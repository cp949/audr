// 녹음 단계(RecordingStep)와 재생·trim 단계(PlaybackStep)를 번갈아 보여 준다.
import type { MicrophoneError, RecordingResult } from "@cp949/audr-core";
import { useRef } from "react";
import {
  useRecordDialog,
  type AutoStopReason,
  type RecordDialogOptions,
} from "../hooks/useRecordDialog";
import { useDiscardConfirm } from "../hooks/useDiscardConfirm";
import { useRecordingStep } from "../hooks/useRecordingStep";
import { getMessages, type Locale, type Messages } from "../i18n";
import type { AudrTheme } from "../theme";
import { DiscardConfirm } from "./DiscardConfirm";
import { Modal } from "./Modal";
import { PlaybackStep } from "./PlaybackStep";
import styles from "./record-dialog.module.css";
import { RecordingStep } from "./RecordingStep";

export type RecordDialogProps = RecordDialogOptions & {
  open: boolean;
  /**
   * 닫기 버튼, Esc, 배경 클릭, 확인창의 버리기.
   * 녹음 중이거나 녹음이 있으면 확인창에서 버리기를 골라야 부른다.
   * 저장 중(`onSave` 호출 뒤)에는 호스트가 녹음을 이미 받았으므로 확인 없이 바로 부른다.
   */
  onCancel: () => void;
  locale?: Locale;
  /** 색 테마. 생략하면 보라. 모달은 body에 그려지므로 호스트의 래퍼 속성이 닿지 않아 여기서 받는다 */
  theme?: AudrTheme;
};

/** 녹음 단계. 다시 녹음할 때 새 녹음기를 만들도록 단계마다 따로 마운트한다. */
function RecordingStepContainer({
  messages,
  recording,
  focusRecordWhenReady,
  onRecord,
  onStopRecording,
  onMicrophoneError,
}: {
  messages: Messages;
  recording: boolean;
  focusRecordWhenReady: boolean;
  onRecord: () => void;
  onStopRecording: (result: RecordingResult, autoStopReason: AutoStopReason | null) => void;
  onMicrophoneError: (error: MicrophoneError, partial?: RecordingResult) => void;
}) {
  const { listening, level, levels, timing, errorCode, startRecording, stopRecording } =
    useRecordingStep(recording, onMicrophoneError);
  /** autoStopReason은 사용자가 아니라 편집 한도 길이가 녹음을 멈췄을 때 "limit"이다 */
  const finishRecording = (autoStopReason: AutoStopReason | null) => {
    const result = stopRecording();
    if (result) onStopRecording(result, autoStopReason);
  };
  return (
    <RecordingStep
      messages={messages}
      recording={recording}
      listening={listening}
      errorCode={errorCode}
      level={level}
      levels={levels}
      timing={timing}
      focusRecordWhenReady={focusRecordWhenReady}
      onRecord={() => {
        // 편집 한도 길이에 닿으면 정지 버튼을 누른 것처럼 끝낸다. 더 길면 저장 뒤 편집이 모두 거부된다
        startRecording(() => finishRecording("limit"));
        onRecord();
      }}
      onStopRecording={() => finishRecording(null)}
    />
  );
}

/**
 * 열려 있는 동안만 마운트되어 닫으면 상태, 녹음기, 재생기가 모두 정리된다.
 * 닫기 요청(Esc, 배경 클릭, ✕)과 Re-record가 같은 확인창을 쓰도록 Modal도 여기서 그린다.
 */
function RecordDialogBody({
  messages,
  theme,
  onCancel,
  onSave,
  onError,
}: { messages: Messages; theme?: AudrTheme; onCancel: () => void } & RecordDialogOptions) {
  const {
    samples,
    sampleRate,
    levels,
    playhead,
    playing,
    recording,
    autoStopReason,
    trimStart,
    trimEnd,
    encoding,
    onRecord,
    onStopRecording,
    onPlay,
    onStopPlaying,
    onBack,
    onSetTrimStart,
    onSetTrimEnd,
    onSetPlayhead,
    onSubmit,
    onMicrophoneError,
  } = useRecordDialog({ onSave, onError });

  const bodyRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const hasSamples = samples !== null;
  const { discarding, reRecorded, askDiscard, keepRecording, confirmDiscard } = useDiscardConfirm({
    bodyRef,
    playRef,
    hasSamples,
  });

  // 확인창이 이미 떠 있으면 Esc, 배경 클릭, ✕는 확인창만 닫는다(돌아가기와 같다)
  const requestClose = () => {
    if (discarding) keepRecording();
    // 저장 중에는 onSave가 이미 불려 호스트가 녹음을 받았다. 닫아도 녹음이 사라지지 않으므로 묻지 않는다.
    // useRecordDialog.submit은 인코딩을 동기로 하고 같은 틱에 onSave를 부르므로 encoding이면 onSave 호출 뒤다
    else if (encoding) onCancel();
    else if (recording || samples) askDiscard("close");
    else onCancel();
  };

  return (
    <Modal
      title={messages.recordTitle}
      closeLabel={messages.close}
      className={styles.dialogContent}
      theme={theme}
      onRequestClose={requestClose}
    >
      {/*
        확인창 뒤의 단계는 계속 마운트해 둔다. 녹음기와 재생기를 유지하고, confirming이 숨겨서 Tab과 읽기에서 뺀다.
        기본 상태의 DOM 구조와 스타일을 바꾸지 않으려고 단계를 감싸지 않고 클래스도 확인창이 뜰 때만 붙인다.
      */}
      <div
        className={discarding ? `${styles.body} ${styles.confirming}` : styles.body}
        ref={bodyRef}
      >
        {samples ? (
          <PlaybackStep
            messages={messages}
            samples={samples}
            sampleRate={sampleRate}
            levels={levels ?? []}
            encoding={encoding}
            playing={playing}
            playhead={playhead}
            trimStart={trimStart}
            trimEnd={trimEnd}
            autoStopReason={autoStopReason}
            focusPlay={discarding === null}
            playRef={playRef}
            onBack={() => askDiscard("reRecord")}
            onPlay={onPlay}
            onStopPlaying={onStopPlaying}
            onSetPlayhead={onSetPlayhead}
            onSetTrimStart={onSetTrimStart}
            onSetTrimEnd={onSetTrimEnd}
            onSubmit={() => void onSubmit()}
          />
        ) : (
          <RecordingStepContainer
            messages={messages}
            recording={recording}
            focusRecordWhenReady={reRecorded}
            onRecord={onRecord}
            onStopRecording={onStopRecording}
            onMicrophoneError={onMicrophoneError}
          />
        )}
        {discarding && (
          <DiscardConfirm
            messages={messages}
            reason={discarding}
            onKeep={keepRecording}
            onDiscard={() => confirmDiscard({ onCancel, onBack })}
          />
        )}
      </div>
    </Modal>
  );
}

export function RecordDialog({
  open,
  onCancel,
  onSave,
  onError,
  locale = "en",
  theme,
}: RecordDialogProps) {
  if (!open) return null;
  return (
    <RecordDialogBody
      messages={getMessages(locale)}
      theme={theme}
      onCancel={onCancel}
      onSave={onSave}
      onError={onError}
    />
  );
}
