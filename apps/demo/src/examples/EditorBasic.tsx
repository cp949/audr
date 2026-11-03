import { SoundEditor } from "@cp949/audr";
import { createWavBlob, decodeAudioFile, maxEditableSamples } from "@cp949/audr-core";
import { useState, type ChangeEvent } from "react";
import { createSine } from "./sampleSound";

/**
 * 예제: SoundEditor 하나로 파일을 열고, 고치고, WAV로 내려받는다. 소리는 하나만 다룬다.
 *
 * - 호스트가 `samples`와 `sampleRate`를 가진다. `onChange`로 받은 새 값을 그대로 다시 내려 준다.
 * - 다른 파일로 바꿀 때는 `soundId`를 바꾼다. 그러면 undo 이력과 선택이 새로 시작한다.
 * - 에디터의 부모는 flex 컨테이너(`flex-direction: column`)이고 높이가 정해져 있어야 한다.
 * - `onCopyToNew`는 필수다. 소리가 하나뿐이라 복사한 구간을 새 소리로 바꿔 연다. 목록이 있으면 항목을 더한다.
 * - 큰 파일은 디코드에 몇 초 걸린다. 끝날 때까지 `loading`으로 입력을 막고 안내를 보인다.
 * - `decodeAudioFile`은 길이를 제한하지 않는다. 편집 한도를 넘는 소리는 목록에 넣지 않는다.
 * - `demo-*` 클래스는 데모 자체 스타일이다. audr가 요구하지 않는다.
 */
export function EditorBasicExample() {
  const [sound, setSound] = useState(() => ({ id: 1, name: "Sine 440Hz", ...createSine() }));
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // 같은 파일을 다시 골라도 change가 일어나도록 비운다
    input.value = "";
    if (!file) return;
    // 디코드는 파일이 크면 몇 초 걸린다. 브라우저가 따로 처리해서 화면은 막히지 않으니, 진행 중임을 알린다.
    setLoading(true);
    setNotice(null);
    try {
      const buffer = await decodeAudioFile(file);
      if (buffer.samples.length > maxEditableSamples(buffer.sampleRate)) {
        setNotice(`${file.name}은(는) 너무 길어 편집할 수 없다`);
        return;
      }
      setSound((prev) => ({ ...buffer, id: prev.id + 1, name: file.name.replace(/\.[^.]+$/, "") }));
    } catch {
      setNotice(`${file.name}을(를) 열 수 없다`);
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(createWavBlob(sound.samples, sound.sampleRate));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sound.name || "sound"}.wav`;
    link.click();
    // 클릭 직후에 해제하면 일부 브라우저에서 내려받기가 끊긴다
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div>
      <div className="demo-toolbar">
        <input
          type="file"
          accept="audio/*"
          aria-label="Open sound file"
          disabled={loading}
          onChange={openFile}
        />
        <button type="button" onClick={download}>
          WAV로 내려받기
        </button>
        {loading && (
          <p className="demo-status" role="status">
            불러오는 중…
          </p>
        )}
        {notice && (
          <p className="demo-error" role="alert">
            {notice}
          </p>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", height: 600, maxWidth: 800 }}>
        <SoundEditor
          soundId={sound.id}
          samples={sound.samples}
          sampleRate={sound.sampleRate}
          name={sound.name}
          onChange={({ samples, sampleRate }) =>
            setSound((prev) => ({ ...prev, samples, sampleRate }))
          }
          onCopyToNew={(buffer) =>
            setSound((prev) => ({ ...buffer, id: prev.id + 1, name: `${prev.name} copy` }))
          }
          onRename={(name) => setSound((prev) => ({ ...prev, name }))}
        />
      </div>
    </div>
  );
}
