// 재생기는 usePlaybackStep이 맡는다.
import { useLayoutEffect, useRef, type RefObject } from "react";
import backIcon from "../assets/icons/record-modal/icon--back.svg";
import playIcon from "../assets/icons/record-modal/icon--play.svg";
import stopIcon from "../assets/icons/record-modal/icon--stop-playback.svg";
import { usePlaybackStep } from "../hooks/usePlaybackStep";
import type { AutoStopReason } from "../hooks/useRecordDialog";
import type { Messages } from "../i18n";
import { trimmedSampleCount } from "../lib/trimRange";
import { secondsValueText } from "../lib/valueText";
import { AudioTrimmer } from "./AudioTrimmer";
import { Meter } from "./Meter";
import styles from "./record-dialog.module.css";
import { Waveform } from "./Waveform";

export type PlaybackStepProps = {
  messages: Messages;
  samples: Float32Array;
  sampleRate: number;
  levels: number[];
  encoding: boolean;
  playing: boolean;
  playhead: number | null;
  trimStart: number;
  trimEnd: number;
  /** 녹음이 저절로 멈춘 이유. 있으면 이유에 맞는 안내 문구를 보인다. 사용자가 멈췄으면 null이다 */
  autoStopReason: AutoStopReason | null;
  /**
   * 마운트될 때 Play 버튼에 포커스를 둘지. 처음 렌더 값만 읽는다.
   * 녹음 단계의 Stop 버튼이 사라지면 포커스가 body로 빠지므로 단계가 바뀔 때 켠다.
   * 확인창이 떠 있으면 포커스는 확인창에 있어야 하므로 끈다.
   */
  focusPlay: boolean;
  /** Play 버튼. 확인창 중 자동 정지로 마운트된 뒤 확인창이 닫히면 호출하는 쪽이 여기로 포커스를 보낸다 */
  playRef: RefObject<HTMLButtonElement | null>;
  /** Re-record 버튼. 저장 중에는 비활성이다. 확인은 호출하는 쪽이 맡는다 */
  onBack: () => void;
  onPlay: () => void;
  onStopPlaying: () => void;
  onSetPlayhead: (playhead: number) => void;
  onSetTrimStart: (value: number) => void;
  onSetTrimEnd: (value: number) => void;
  onSubmit: () => void;
};

export function PlaybackStep({
  messages: m,
  samples,
  sampleRate,
  levels,
  encoding,
  playing,
  playhead,
  trimStart,
  trimEnd,
  autoStopReason,
  focusPlay,
  playRef,
  onBack,
  onPlay,
  onStopPlaying,
  onSetPlayhead,
  onSetTrimStart,
  onSetTrimEnd,
  onSubmit,
}: PlaybackStepProps) {
  const { play, stopPlaying } = usePlaybackStep({
    samples,
    sampleRate,
    trimStart,
    trimEnd,
    onPlay,
    onStopPlaying,
    onSetPlayhead,
  });
  const focusPlayOnMount = useRef(focusPlay);
  useLayoutEffect(() => {
    if (focusPlayOnMount.current) playRef.current?.focus();
  }, [playRef]);

  // 저장 중에는 Save 버튼이 disabled가 되어 포커스가 body로 빠진다. 대화상자 안에 붙잡아 둔다.
  // 저장이 끝나 Save가 다시 활성이 되었을 때 포커스가 아직 대화상자나 body에 있으면 Save로 돌린다.
  // 그 사이 사용자가 옮긴 포커스는 빼앗지 않는다. 대개 실패 복귀다. 성공해도 호스트가 닫지 않으면 같은 복귀가 일어난다.
  const saveRef = useRef<HTMLButtonElement>(null);
  const wasEncoding = useRef(false);
  useLayoutEffect(() => {
    const save = saveRef.current;
    const dialog = save?.closest<HTMLElement>('[role="dialog"]');
    const active = document.activeElement;
    if (encoding) {
      wasEncoding.current = true;
      if (active === save || active === document.body) dialog?.focus();
    } else if (wasEncoding.current) {
      wasEncoding.current = false;
      if (active === dialog || active === document.body) save?.focus();
    }
  }, [encoding]);
  return (
    <div>
      <div className={styles.visualizationContainer}>
        <div className={styles.meterContainer}>
          <Meter height={172} level={0} width={20} />
        </div>
        <div className={styles.waveformContainer}>
          <Waveform data={levels} height={150} width={480} />
          <AudioTrimmer
            playhead={playhead}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onSetTrimStart={onSetTrimStart}
            onSetTrimEnd={onSetTrimEnd}
            startLabel={m.trimStart}
            endLabel={m.trimEnd}
            valueText={secondsValueText(m, samples.length / sampleRate)}
          />
        </div>
      </div>
      <div className={styles.mainButtonRow}>
        <button
          type="button"
          className={styles.mainButton}
          ref={playRef}
          onClick={playing ? stopPlaying : play}
        >
          <img
            draggable={false}
            src={playing ? stopIcon : playIcon}
            alt=""
            data-audr-icon="looks"
          />
          <div className={styles.helpText}>
            <span className={styles.playingText}>{playing ? m.playbackStop : m.playbackPlay}</span>
          </div>
        </button>
      </div>
      {autoStopReason && (
        <p role="status" className={styles.limitNotice}>
          {autoStopReason === "limit" ? m.recordingLimitReached : m.recordingInterrupted}
        </p>
      )}
      <div className={styles.buttonRow}>
        <button type="button" disabled={encoding} onClick={onBack}>
          <img draggable={false} src={backIcon} alt="" data-audr-icon="looks" />
          {m.reRecord}
        </button>
        <button
          type="button"
          className={styles.okButton}
          ref={saveRef}
          disabled={encoding}
          onClick={onSubmit}
        >
          {encoding ? m.loading : m.save}
        </button>
        {/*
          저장될 구간 길이. 마지막 자식이고 absolute라 Re-record와 Save의 위치·크기를 바꾸지 않는다.
          trim 핸들을 끄는 동안 trimStart·trimEnd가 바뀌므로 실시간으로 갱신된다. aria-live는 달지 않는다.
        */}
        <span className={styles.savedLength}>
          {m.recordSavedLength.replace(
            "{seconds}",
            (trimmedSampleCount(samples.length, trimStart, trimEnd) / sampleRate).toFixed(2),
          )}
        </span>
      </div>
    </div>
  );
}
