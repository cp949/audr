// 상태와 동작은 useSoundEditor에 있다.
import type { EffectName, SoundBuffer } from "@cp949/audr-core";
import { useId, useMemo, useState } from "react";
import alienIcon from "../assets/icons/sound-editor/icon--alien.svg";
import broadcastIcon from "../assets/icons/sound-editor/icon--broadcast.svg";
import coasterIcon from "../assets/icons/sound-editor/icon--coaster.svg";
import copyToNewIcon from "../assets/icons/sound-editor/icon--copy-to-new.svg";
import copyIcon from "../assets/icons/sound-editor/icon--copy.svg";
import cyborgIcon from "../assets/icons/sound-editor/icon--cyborg.svg";
import deleteIcon from "../assets/icons/sound-editor/icon--delete.svg";
import echoIcon from "../assets/icons/sound-editor/icon--echo.svg";
import fadeInIcon from "../assets/icons/sound-editor/icon--fade-in.svg";
import fadeOutIcon from "../assets/icons/sound-editor/icon--fade-out.svg";
import fasterIcon from "../assets/icons/sound-editor/icon--faster.svg";
import louderIcon from "../assets/icons/sound-editor/icon--louder.svg";
import muteIcon from "../assets/icons/sound-editor/icon--mute.svg";
import pasteIcon from "../assets/icons/sound-editor/icon--paste.svg";
import playIcon from "../assets/icons/sound-editor/icon--play.svg";
import redoIcon from "../assets/icons/sound-editor/icon--redo.svg";
import reverseReverbIcon from "../assets/icons/sound-editor/icon--reverse-reverb.svg";
import reverseIcon from "../assets/icons/sound-editor/icon--reverse.svg";
import robotIcon from "../assets/icons/sound-editor/icon--robot.svg";
import scratchIcon from "../assets/icons/sound-editor/icon--scratch.svg";
import slowerIcon from "../assets/icons/sound-editor/icon--slower.svg";
import softerIcon from "../assets/icons/sound-editor/icon--softer.svg";
import stopIcon from "../assets/icons/sound-editor/icon--stop.svg";
import stutterIcon from "../assets/icons/sound-editor/icon--stutter.svg";
import undoIcon from "../assets/icons/sound-editor/icon--undo.svg";
import vibratoIcon from "../assets/icons/sound-editor/icon--vibrato.svg";
import walkieIcon from "../assets/icons/sound-editor/icon--walkie.svg";
import { useSoundEditor, type SoundEditorError } from "../hooks/useSoundEditor";
import { getMessages, type Locale, type MessageOverrides, type Messages } from "../i18n";
import { createSecondsFormat } from "../lib/secondsFormat";
import type { AudrTheme } from "../theme";
import { ariaKeyShortcuts, SHORTCUTS, useIsApplePlatform, withShortcut } from "../lib/shortcuts";
import { secondsValueText } from "../lib/valueText";
import { AudioSelector } from "./AudioSelector";
// IconButton의 CSS가 sound-module.css보다 먼저 로드되어야 `.effectButton + .effectButton`이 이긴다
import { IconButton } from "./IconButton";
import { NameInput } from "./NameInput";
import styles from "./sound-editor.module.css";
import { SelectionLabel } from "./SelectionLabel";
import { ShortcutHelp } from "./ShortcutHelp";
import { Waveform } from "./Waveform";

/**
 * 효과 버튼. 배열 순서가 화면 순서다(9칸 × 2줄, 위→아래, 왼쪽→오른쪽).
 * 화면의 Louder는 `higher`, Softer는 `lower` 효과다.
 * 음소거는 소스를 유지하고 화면에는 보이지 않는다(`hidden`).
 */
const EFFECT_BUTTONS = [
  { effect: "faster", icon: fasterIcon, label: "faster" },
  { effect: "slower", icon: slowerIcon, label: "slower" },
  { effect: "higher", icon: louderIcon, label: "louder" },
  { effect: "lower", icon: softerIcon, label: "softer" },
  { effect: "fade in", icon: fadeInIcon, label: "fadeIn" },
  { effect: "fade out", icon: fadeOutIcon, label: "fadeOut" },
  { effect: "cyborg", icon: cyborgIcon, label: "cyborg" },
  { effect: "robot", icon: robotIcon, label: "robot" },
  { effect: "alien", icon: alienIcon, label: "alien" },
  { effect: "echo", icon: echoIcon, label: "echo" },
  { effect: "broadcast", icon: broadcastIcon, label: "broadcast" },
  { effect: "walkie", icon: walkieIcon, label: "walkie" },
  { effect: "reverse reverb", icon: reverseReverbIcon, label: "reverseReverb" },
  { effect: "scratch", icon: scratchIcon, label: "scratch" },
  { effect: "coaster", icon: coasterIcon, label: "coaster" },
  { effect: "stutter", icon: stutterIcon, label: "stutter" },
  { effect: "vibrato", icon: vibratoIcon, label: "vibrato" },
  { effect: "reverse", icon: reverseIcon, label: "reverse" },
  { effect: "mute", icon: muteIcon, label: "mute", hidden: true },
] as const satisfies ReadonlyArray<{
  effect: EffectName;
  icon: string;
  label: keyof Messages;
  hidden?: boolean;
}>;

/** 화면에 그리는 효과 버튼. `hidden`인 항목은 거른다 */
const VISIBLE_EFFECT_BUTTONS = EFFECT_BUTTONS.filter(
  (b): b is Exclude<(typeof EFFECT_BUTTONS)[number], { hidden: true }> => !("hidden" in b),
);

/** 파형 위 세로 기준선의 가로 위치(%) */
const GUIDE_POSITIONS = [25, 50, 75];

/**
 * SoundEditor props.
 *
 * 다른 소리로 바꿀 때는 key로 다시 마운트하지 않고 soundId를 바꾼다.
 * soundId가 바뀌면 내용이 같아도 다른 소리로 보고 undo 이력, 선택, 편집 실패 알림, 입력 중인 이름, 끌던 선택을 지운다.
 * 전환 전에 시작한 편집 결과는 버리고, 복사한 내용은 유지한다(다른 소리에 붙일 수 있다).
 * soundId를 생략하면 samples 내용이 현재 재생기 버퍼와 같은 경우(예: 같은 소리를 복제한 다른 항목)
 * 같은 소리로 보고 이전 소리의 undo 이력을 유지한다.
 */
export type SoundEditorProps = {
  samples: Float32Array;
  sampleRate: number;
  /** 소리를 가리키는 식별자. 다른 소리로 바꿀 때 함께 바꾼다. 생략하면 samples 내용으로 판단한다 */
  soundId?: string | number;
  name: string;
  /** 편집, undo, redo가 끝날 때마다 새 samples를 돌려준다 */
  onChange: (buffer: SoundBuffer) => void;
  /** Copy to New: 선택 구간(없으면 전체)을 새 소리로 만들도록 바깥에 넘긴다 */
  onCopyToNew: (buffer: SoundBuffer) => void;
  onRename: (name: string) => void;
  /**
   * 편집을 반영하지 못했을 때 호출한다(용량 초과, 붙이기·효과 실패).
   * `errorNotice`가 꺼져 있으면 화면에 아무 표시가 없으므로 호스트가 알림을 띄워야 한다.
   */
  onError?: (error: SoundEditorError) => void;
  /**
   * 편집 실패를 에디터 맨 아래 시간 표시줄 밑에 `role="alert"` 문구로 보인다. 기본값은 `true`다.
   * 다음 편집·undo·redo가 성공하면 지운다. 호스트가 자체 알림을 쓰면 `false`로 끈다.
   * 끄더라도 `onError`는 그대로 호출한다.
   */
  errorNotice?: boolean;
  locale?: Locale;
  /** 문구를 덮어쓴다. 넘긴 키만 바뀌고 나머지는 `locale` 문구를 쓴다 */
  messages?: MessageOverrides;
  /** 색 테마. 생략하면 청록. 에디터 루트에 걸리므로 에디터 안쪽만 바뀐다 */
  theme?: AudrTheme;
};

export function SoundEditor({
  locale = "en",
  messages: overrides,
  theme,
  errorNotice = true,
  ...props
}: SoundEditorProps) {
  const m = useMemo(() => getMessages(locale, overrides), [locale, overrides]);
  const formatSeconds = useMemo(() => createSecondsFormat(locale), [locale]);
  const apple = useIsApplePlatform();
  // 접근 가능한 이름(aria-label, 버튼 텍스트)은 그대로 두고 단축키는 title과 aria-keyshortcuts로 알린다
  const tip = (label: string, key: keyof typeof SHORTCUTS) =>
    withShortcut(label, SHORTCUTS[key], apple);
  const {
    chunkLevels,
    durationSeconds,
    playhead,
    trimStart,
    trimEnd,
    canUndo,
    canRedo,
    canPaste,
    tooLoud,
    busy,
    editError,
    switchCount,
    setContainer,
    onContainerMouseDown,
    onPlay,
    onStop,
    onSetTrim,
    onUndo,
    onRedo,
    onCopy,
    onPaste,
    onCopyToNew,
    onDelete,
    onEffect,
  } = useSoundEditor(props);
  // 드래그 중 임시 선택. 확정 전이라 훅의 trim에는 없고, 시간 표시줄의 선택 구간에만 쓴다
  const [preview, setPreview] = useState<{ start: number; end: number } | null>(null);
  // 끄는 중 소리가 전환되면 AudioSelector는 다시 만들어지며 null을 알리지 않는다. 여기서 임시 선택을 지운다
  const [previewSwitchCount, setPreviewSwitchCount] = useState(switchCount);
  if (previewSwitchCount !== switchCount) {
    setPreviewSwitchCount(switchCount);
    setPreview(null);
  }
  const selection =
    preview ?? (trimStart !== null && trimEnd !== null ? { start: trimStart, end: trimEnd } : null);
  const editErrorText = {
    apply: m.editErrorApply,
    paste: m.editErrorPaste,
    effect: m.editErrorEffect,
  };
  const sec = (position: number) => formatSeconds(position * durationSeconds);
  /** 선택 구간 문구의 {start}, {end}, {length}를 채운다. 선택이 없으면 쓰지 않는다 */
  const fillRange = (template: string) =>
    selection
      ? template
          .replace("{start}", sec(selection.start))
          .replace("{end}", sec(selection.end))
          .replace("{length}", sec(selection.end - selection.start))
      : "";
  // 효과는 훅의 선택(trim)을 기준으로 적용된다. 드래그 중 임시 선택(preview)은 쓰지 않는다.
  // 새 선택은 누르는 순간 길이 0으로 trim에 들어가므로 길이 0 선택도 선택 구간으로 표시한다(효과도 그 지점에 적용된다)
  const scopeId = useId();
  const effectScopeText =
    trimStart === null || trimEnd === null ? m.effectScopeWhole : m.effectScopeSelection;

  return (
    <div
      className={styles.editorContainer}
      data-audr-theme={theme}
      ref={setContainer}
      onMouseDown={onContainerMouseDown}
      aria-busy={busy || undefined}
    >
      <div className={styles.row}>
        <div className={styles.inputGroup}>
          {/*
            key로 soundId가 바뀌면 다시 만든다. 입력 중이던 이전 소리의 이름을
            새 소리에 보이거나 새 소리의 onRename으로 제출하지 않게 한다
          */}
          <NameInput
            key={props.soundId}
            label={m.sound}
            value={props.name}
            onSubmit={props.onRename}
          />
          <div className={styles.buttonGroup}>
            <button
              type="button"
              aria-label={m.undo}
              title={tip(m.undo, "undo")}
              aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.undo)}
              className={styles.button}
              disabled={!canUndo || busy}
              onClick={onUndo}
            >
              <img draggable={false} src={undoIcon} alt="" />
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={!canRedo || busy}
              aria-label={m.redo}
              title={tip(m.redo, "redo")}
              aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.redo)}
              onClick={onRedo}
            >
              <img draggable={false} src={redoIcon} alt="" />
            </button>
          </div>
        </div>
        <div className={styles.inputGroup}>
          <IconButton
            className={styles.toolButton}
            img={copyIcon}
            title={m.copy}
            tooltip={tip(m.copy, "copy")}
            keyShortcuts={ariaKeyShortcuts(SHORTCUTS.copy)}
            onClick={onCopy}
          />
          <IconButton
            className={styles.toolButton}
            disabled={!canPaste || busy}
            img={pasteIcon}
            title={m.paste}
            tooltip={tip(m.paste, "paste")}
            keyShortcuts={ariaKeyShortcuts(SHORTCUTS.paste)}
            onClick={onPaste}
          />
          <IconButton
            className={styles.toolButton}
            img={copyToNewIcon}
            title={m.copyToNew}
            onClick={onCopyToNew}
          />
        </div>
        <IconButton
          className={styles.toolButton}
          disabled={trimStart === null || busy}
          img={deleteIcon}
          title={m.delete}
          tooltip={tip(m.delete, "delete")}
          keyShortcuts={ariaKeyShortcuts(SHORTCUTS.delete)}
          onClick={onDelete}
        />
      </div>
      <div className={styles.row}>
        <div className={styles.waveformArea}>
          <div className={styles.waveformContainer}>
            <Waveform data={chunkLevels} height={160} width={600} />
            {/* 진폭 0(가로선)과 시간 25%·50%·75%(세로선)를 가리키는 연한 기준선. 선택 영역 아래에 두어 입력을 막지 않는다 */}
            <div className={styles.guideHorizontal} aria-hidden="true" />
            {GUIDE_POSITIONS.map((percent) => (
              <div
                key={percent}
                className={styles.guideVertical}
                style={{ left: `${percent}%` }}
                aria-hidden="true"
              />
            ))}
            {/* 끄는 중 소리가 전환되면 드래그를 버린다. 끝날 때 이전 소리에서 잡은 구간이 새 소리의 선택이 되지 않게 한다 */}
            <AudioSelector
              key={switchCount}
              playhead={playhead}
              trimStart={trimStart}
              trimEnd={trimEnd}
              onSetTrim={onSetTrim}
              startLabel={m.selectionStart}
              endLabel={m.selectionEnd}
              valueText={secondsValueText(m, formatSeconds, durationSeconds)}
              onPreviewChange={setPreview}
            />
            {/* 선택 구간의 시간 범위. 파형 바로 위에 띄우고, 드래그하는 동안 임시 선택(preview)도 따라간다 */}
            {selection ? (
              <SelectionLabel
                start={selection.start}
                end={selection.end}
                text={fillRange(m.timeSelectionValue)}
                readText={fillRange(m.timeSelection)}
              />
            ) : null}
          </div>
          {/*
            파형 아래 여백의 오른쪽 끝에 띄운다. 파형과 선택 영역을 가리지 않고 줄 높이도 바꾸지 않는다.
            화면에는 숫자와 단위만 보이고, 보조기기는 "길이"가 붙은 문구를 읽는다
          */}
          <span className={styles.totalLength}>
            <span aria-hidden="true">
              {m.timeLengthValue.replace("{seconds}", formatSeconds(durationSeconds))}
            </span>
            <span className={styles.visuallyHidden}>
              {m.timeLength.replace("{seconds}", formatSeconds(durationSeconds))}
            </span>
          </span>
        </div>
      </div>
      <div className={styles.row}>
        <div className={`${styles.inputGroup} ${styles.playGroup}`}>
          {playhead !== null ? (
            <button
              type="button"
              className={styles.roundButton}
              aria-label={m.stop}
              title={tip(m.stop, "playStop")}
              aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.playStop)}
              onClick={onStop}
            >
              <img draggable={false} src={stopIcon} alt="" />
            </button>
          ) : (
            <button
              type="button"
              className={styles.roundButton}
              aria-label={m.play}
              title={tip(m.play, "playStop")}
              aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.playStop)}
              onClick={onPlay}
            >
              <img draggable={false} src={playIcon} alt="" />
            </button>
          )}
        </div>
        {/* 9칸 × 2줄. DOM 순서가 Tab 순서이자 화면 순서다 */}
        <div className={styles.effectGrid}>
          {VISIBLE_EFFECT_BUTTONS.map(({ effect, icon, label }) => {
            // Louder는 너무 큰 구간에서 막고 이유를 알린다
            const blocked = effect === "higher" && tooLoud;
            return (
              <IconButton
                key={effect}
                className={styles.effectButton}
                describedBy={scopeId}
                disabled={blocked || busy}
                disabledReason={blocked ? m.tooLoudHint : undefined}
                img={icon}
                title={m[label]}
                onClick={() => onEffect(effect)}
              />
            );
          })}
        </div>
      </div>
      {/* 화면용 정보다. 재생 위치가 프레임마다 바뀌므로 aria-live를 달지 않는다(스크린 리더는 핸들의 aria-valuetext를 쓴다) */}
      <div className={styles.timeReadout}>
        {/*
          효과 버튼이 aria-describedby로 가리킨다. 선택을 끌 때마다 낭독되지 않도록 aria-live는 달지 않는다.
          화면에는 보이지 않고 보조기기만 읽는다. 선택 구간은 파형 위 범위 문구와 핸들로 이미 보인다
        */}
        <span id={scopeId} className={styles.visuallyHidden}>
          {effectScopeText}
        </span>
        {playhead !== null ? (
          <span>{m.timePlaying.replace("{seconds}", sec(playhead))}</span>
        ) : null}
        {/* 버튼은 줄 오른쪽 끝에 붙여 재생 항목이 늘고 줄어도 제자리에 있게 하고, 목록은 알림 위에 한 줄로 펼친다 */}
        <ShortcutHelp messages={m} apple={apple} />
        {/*
          시간 줄 아래에 둬서 시간 줄 위치는 그대로다. 포커스를 옮기지 않는다.
          key가 실패마다 바뀌어 같은 문구여도 요소를 새로 넣는다. 그래야 스크린 리더가 다시 읽는다
        */}
        {errorNotice && editError ? (
          <div key={editError.id} role="alert" className={styles.editError}>
            {editErrorText[editError.kind]}
          </div>
        ) : null}
      </div>
    </div>
  );
}
