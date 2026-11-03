import {
  RecordDialog,
  type AudrTheme,
  type EffectsLayout,
  type MicrophoneErrorCode,
  SoundEditor,
  type RecordDialogError,
} from "@cp949/audr";
import { createWavBlob, decodeAudioFile, maxEditableSamples } from "@cp949/audr-core";
import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import "./demo.css";
import { MESSAGES_DE } from "./messagesDe";
import { useSoundLibrary } from "./useSoundLibrary";

/** 데모에서 고를 수 있는 테마. 빈 값은 기본 청록이다. */
// 호스트 폭 슬라이더(px). 기본값은 예전 고정 폭이다.
// 범위는 에디터 최소 폭(demo.css의 .editor-frame) 아래까지 내려가서, 최소 폭에서 멈추고 가로 스크롤이 생기는 모습도 보인다.
const HOST_WIDTH_MIN = 200;
const HOST_WIDTH_MAX = 1000;
const HOST_WIDTH_DEFAULT = 629;

/** 데모에서 고를 수 있는 효과 버튼 배치 */
const EFFECTS_LAYOUTS: { value: EffectsLayout; label: string }[] = [
  { value: "expanded", label: "Expanded" },
  { value: "minimized", label: "Minimized" },
  { value: "overflow", label: "Overflow" },
];

const THEMES: { value: "" | AudrTheme; label: string }[] = [
  { value: "", label: "Teal" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
];

/**
 * 데모에서 고를 수 있는 언어. 영어와 한국어는 라이브러리에 내장되어 있고,
 * 독일어는 내장 문구가 없어 `locale`(숫자 표기)과 `messages`(문구)를 함께 넘긴다.
 */
const LANGUAGES = [
  { value: "en", label: "English", messages: undefined },
  { value: "ko", label: "한국어", messages: undefined },
  { value: "de", label: "Deutsch", messages: MESSAGES_DE },
] as const;

/** 마이크 실패 원인(code)별 안내 문구 */
const MICROPHONE_ERROR_NOTICE: Record<MicrophoneErrorCode, string> = {
  "permission-denied": "마이크 권한이 거부되었다",
  "policy-blocked": "페이지 정책이 마이크를 막고 있다",
  "insecure-context": "마이크는 HTTPS 또는 localhost에서만 쓸 수 있다",
  unsupported: "이 브라우저에서는 녹음할 수 없다",
  "device-not-found": "마이크를 찾을 수 없다",
  "device-in-use": "다른 앱이 마이크를 쓰고 있다",
  "track-ended": "마이크 연결이 끊겼다",
  aborted: "마이크 요청이 중단되었다",
  unknown: "마이크를 사용할 수 없다",
};

/** 녹음 대화상자 오류를 kind와 code로 나눠 안내 문구로 바꾼다 */
function recordErrorNotice(error: RecordDialogError): string {
  return error.kind === "save" ? "녹음을 저장하지 못했다" : MICROPHONE_ERROR_NOTICE[error.code];
}

/** 샘플의 절댓값 최댓값. e2e가 무음 여부를 확인하는 데 쓴다. */
function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  return peak;
}

/** 파일명에 쓸 수 없는 문자를 `_`로 바꾼다. 비면 기본 이름을 쓴다. */
function wavFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return `${safe || "sound"}.wav`;
}

/** Blob을 파일로 내려받는다. 클릭 직후 URL을 해제하면 일부 브라우저에서 다운로드가 끊겨 다음 틱에 해제한다. */
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 끌어 온 항목에 파일이 들어 있는지 본다. 텍스트·링크 끌기는 가져오기 대상이 아니다. */
function hasFiles(event: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/**
 * 파일을 .workspace 밖(헤더, 모달 오버레이 등)에 놓으면 브라우저가 그 파일로 이동해
 * 소리 목록과 undo 이력이 사라진다. 파일 끌기만 window에서 기본 동작을 막는다.
 * 텍스트·링크 끌기는 그대로 둔다.
 */
function useBlockStrayFileDrop() {
  useEffect(() => {
    const block = (event: globalThis.DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);
}

export function App() {
  useBlockStrayFileDrop();
  const { sounds, selected, canRemove, select, addSound, updateSelected, removeSelected } =
    useSoundLibrary();
  const [recording, setRecording] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [themeValue, setThemeValue] = useState<"" | AudrTheme>("");
  // 빈 값은 기본 보라이므로 prop을 생략한다
  const theme = themeValue || undefined;
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]>(LANGUAGES[0]);
  // 호스트가 에디터에 주는 가로 폭. 에디터는 이 폭을 따라가고, 그 범위는 demo.css의 .editor-frame이 정한다
  const [effectsLayout, setEffectsLayout] = useState<EffectsLayout>("expanded");
  const [hostWidth, setHostWidth] = useState(HOST_WIDTH_DEFAULT);

  /**
   * 파일을 차례로 디코드해 소리로 추가한다. 이름은 확장자를 뗀 파일명이다.
   * 파일 선택과 끌어 놓기가 같은 경로를 쓴다. 열지 못한 파일은 모아서 한 번에 알린다.
   */
  const importFiles = async (files: File[]) => {
    const failed: string[] = [];
    const tooLong: string[] = [];
    for (const file of files) {
      try {
        const buffer = await decodeAudioFile(file);
        // 한도를 넘는 소리는 이후 모든 편집이 거부되므로 목록에 넣지 않는다
        if (buffer.samples.length > maxEditableSamples(buffer.sampleRate)) {
          tooLong.push(file.name);
          continue;
        }
        addSound(buffer, file.name.replace(/\.[^.]+$/, ""));
      } catch (error) {
        console.error(error);
        failed.push(file.name);
      }
    }
    const messages = [];
    if (failed.length > 0) messages.push(`${failed.join(", ")}을(를) 열 수 없다`);
    if (tooLong.length > 0) {
      messages.push(`${tooLong.join(", ")}은(는) 너무 길어 편집할 수 없어 추가하지 않았다`);
    }
    setNotice(messages.length > 0 ? messages.join(". ") : null);
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []).slice(0, 1);
    // 같은 파일을 다시 골라도 change가 일어나도록 비운다
    input.value = "";
    await importFiles(files);
  };

  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    // preventDefault를 해야 drop이 일어나고, 브라우저가 파일을 새 탭으로 열지 않는다
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDragEnter = (event: DragEvent) => {
    if (hasFiles(event)) setDropping(true);
  };

  const onDragLeave = (event: DragEvent) => {
    // 자식 요소로 옮겨 갈 때도 dragleave가 오므로, 영역 밖으로 나갈 때만 끈다
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
  };

  const onDrop = async (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDropping(false);
    await importFiles(Array.from(event.dataTransfer.files));
  };

  /** 선택한 소리를 WAV 파일로 내려받는다. */
  const downloadSelected = () => {
    if (!selected) return;
    downloadBlob(createWavBlob(selected.samples, selected.sampleRate), wavFileName(selected.name));
  };

  /** 선택한 소리를 지운다. 되돌릴 수 없어서 확인을 받는다. */
  const confirmRemoveSelected = () => {
    if (!selected) return;
    if (!window.confirm(`"${selected.name}"을(를) 삭제할까요? 되돌릴 수 없다`)) return;
    removeSelected();
  };

  // 데모 상단 바는 라이브러리 밖이므로 같은 속성을 래퍼에 직접 걸어 색을 맞춘다
  return (
    <div className="app" data-audr-theme={theme}>
      <header className="topbar">
        <h1>audr demo</h1>
        <button type="button" onClick={() => setRecording(true)}>
          Record
        </button>
        <input type="file" accept="audio/*" aria-label="Import sound" onChange={importFile} />
        <label className="themePicker">
          Theme
          <select
            value={themeValue}
            onChange={(event) => setThemeValue(event.target.value as "" | AudrTheme)}
          >
            {THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="themePicker">
          Language
          <select
            value={language.value}
            onChange={(event) =>
              setLanguage(LANGUAGES.find((l) => l.value === event.target.value) ?? LANGUAGES[0])
            }
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="themePicker">
          Effects layout
          <select
            value={effectsLayout}
            onChange={(event) => setEffectsLayout(event.target.value as EffectsLayout)}
          >
            {EFFECTS_LAYOUTS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="themePicker widthPicker">
          Host width
          <input
            type="range"
            min={HOST_WIDTH_MIN}
            max={HOST_WIDTH_MAX}
            value={hostWidth}
            onChange={(event) => setHostWidth(Number(event.target.value))}
          />
          <output>{hostWidth}px</output>
        </label>
        {notice && <span role="alert">{notice}</span>}
      </header>
      <div
        className="workspace"
        data-dropping={dropping || undefined}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="sound-panel">
          <ul className="sound-list" aria-label="Sounds">
            {sounds.map((sound) => (
              <li key={sound.id}>
                <button
                  type="button"
                  className="sound-item"
                  aria-current={sound.id === selected?.id}
                  data-samples={sound.samples.length}
                  data-sample-rate={sound.sampleRate}
                  data-peak={peakOf(sound.samples).toFixed(4)}
                  onClick={() => select(sound.id)}
                >
                  <span className="sound-name">{sound.name}</span>
                  <span className="sound-length">
                    {(sound.samples.length / sound.sampleRate).toFixed(2)}s
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="sound-actions">
            <button type="button" disabled={!selected} onClick={downloadSelected}>
              Download WAV
            </button>
            <button type="button" disabled={!canRemove} onClick={confirmRemoveSelected}>
              Remove sound
            </button>
          </div>
        </div>
        <main className="editor-pane">
          {/* soundId로 소리가 바뀔 때 undo 이력과 선택을 새로 시작한다. 복사한 내용은 소리 사이에서 유지된다 */}
          <div className="editor-host" style={{ width: hostWidth }}>
            <div className="editor-frame">
              {selected ? (
                <SoundEditor
                  soundId={selected.id}
                  samples={selected.samples}
                  sampleRate={selected.sampleRate}
                  name={selected.name}
                  onChange={({ samples, sampleRate }) => {
                    updateSelected({ samples, sampleRate });
                    // 편집이 성공하면 가져오기·녹음 오류 안내를 지운다. 편집 실패는 에디터가 기본 알림으로 보인다
                    setNotice(null);
                  }}
                  onCopyToNew={(buffer) => addSound(buffer, selected.name)}
                  onRename={(name) => updateSelected({ name })}
                  theme={theme}
                  effectsLayout={effectsLayout}
                  locale={language.value}
                  messages={language.messages}
                />
              ) : (
                <div className="empty-state">
                  <p className="empty-title">No sounds yet</p>
                  <p>Record, import a file, or drop one here.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
      <RecordDialog
        open={recording}
        theme={theme}
        locale={language.value}
        messages={language.messages}
        onCancel={() => setRecording(false)}
        onError={(error) => setNotice(recordErrorNotice(error))}
        onSave={({ samples, sampleRate }) => {
          addSound({ samples, sampleRate }, "recording1");
          setRecording(false);
        }}
      />
    </div>
  );
}
