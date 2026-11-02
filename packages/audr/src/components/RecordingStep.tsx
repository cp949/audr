import type { MicrophoneErrorCode } from "@cp949/audr-core";
import { useLayoutEffect, useRef } from "react";
import stopIcon from "../assets/icons/record-modal/icon--stop-recording.svg";
import type { Messages } from "../i18n";
import { formatClock } from "../lib/clock";
import { Meter } from "./Meter";
import styles from "./record-dialog.module.css";
import { Waveform } from "./Waveform";

/** 남은 녹음 시간이 이 값(초) 이하이면 시간 라벨을 경고색으로 바꾼다 */
const WARNING_REMAINING_SECONDS = 30;

export type RecordingStepProps = {
  messages: Messages;
  recording: boolean;
  /** 마이크가 열려 입력을 받고 있다 */
  listening: boolean;
  /** 마이크를 쓸 수 없는 원인. 있으면 원인별 안내를 보이고 녹음 버튼을 비활성한다. 정상이면 null이다 */
  errorCode: MicrophoneErrorCode | null;
  level: number;
  /** 녹음 중에 쌓이는 입력 레벨. 녹음 전에는 null이다 */
  levels: number[] | null;
  /** 녹음 중 경과 시간과 길이 상한(초). 녹음 전에는 null이다 */
  timing: { elapsed: number; max: number } | null;
  /**
   * 마이크가 열려 Record 버튼이 활성이 되면 포커스를 옮길지. 처음 렌더 값만 읽는다.
   * 포커스가 대화상자 컨테이너(또는 body)에 있을 때만 옮겨, 그 사이 사용자가 옮긴 포커스를 빼앗지 않는다.
   */
  focusRecordWhenReady: boolean;
  onRecord: () => void;
  onStopRecording: () => void;
};

export function RecordingStep({
  messages: m,
  recording,
  listening,
  errorCode,
  level,
  levels,
  timing,
  focusRecordWhenReady,
  onRecord,
  onStopRecording,
}: RecordingStepProps) {
  const helpText = errorCode
    ? m.microphoneErrors[errorCode]
    : listening
      ? m.beginRecord
      : m.permission.replace("{arrow}", "↖️  ");
  const recordRef = useRef<HTMLButtonElement>(null);
  const focusPending = useRef(focusRecordWhenReady);
  useLayoutEffect(() => {
    const button = recordRef.current;
    if (!focusPending.current || !listening || !button) return;
    focusPending.current = false;
    const active = document.activeElement;
    if (active === document.body || active === button.closest('[role="dialog"]')) button.focus();
  }, [listening]);
  return (
    <div>
      <div className={styles.visualizationContainer}>
        <div className={styles.meterContainer}>
          <Meter height={172} level={level} width={20} />
        </div>
        <div className={styles.waveformContainer}>
          {/* 오류가 나면 파형 대신 안내를 보인다. 녹음 중에 끊겨 샘플이 없을 때 오래된 파형이 남지 않게 한다 */}
          {levels && !errorCode ? (
            <Waveform data={levels} height={150} width={440} />
          ) : (
            <span className={styles.helpText} role={errorCode ? "alert" : undefined}>
              {helpText}
            </span>
          )}
          {/*
            녹음 중에만 파형 영역 오른쪽 위에 겹쳐 그린다. 마지막 자식이고 absolute라 다른 요소의 배치를 바꾸지 않는다.
            프레임마다 바뀌므로 aria-live를 달지 않는다.
          */}
          {recording && timing ? (
            <span
              className={
                timing.max - timing.elapsed <= WARNING_REMAINING_SECONDS
                  ? `${styles.timeLabel} ${styles.timeLabelWarning}`
                  : styles.timeLabel
              }
            >
              {formatClock(timing.elapsed)} / {formatClock(timing.max)}
            </span>
          ) : null}
        </div>
      </div>
      <div className={styles.mainButtonRow}>
        <button
          type="button"
          className={styles.mainButton}
          ref={recordRef}
          disabled={!listening || errorCode !== null}
          onClick={recording ? onStopRecording : onRecord}
        >
          {recording ? (
            <img draggable={false} src={stopIcon} alt="" />
          ) : (
            <svg className={styles.recordButton} height="52" width="52" aria-hidden="true">
              <circle className={styles.recordButtonCircle} cx="26" cy="26" r="25" />
              <circle
                className={styles.recordButtonCircleOutline}
                cx="26"
                cy="26"
                r={27 + level * 5}
              />
            </svg>
          )}
          <div className={styles.helpText}>
            <span className={styles.recordingText}>{recording ? m.stopRecording : m.record}</span>
          </div>
        </button>
      </div>
    </div>
  );
}
