// RecordDialog의 상태를 맡는 훅.
import type { MicrophoneError, MicrophoneErrorCode, RecordingResult } from "@cp949/audr-core";
import { createWavBlob } from "@cp949/audr-core";
import { useEffect, useReducer, useRef } from "react";
import {
  initialRecordDialogState,
  recordDialogReducer,
  type AutoStopReason,
} from "../lib/recordDialogState";
import { trimSampleRange } from "../lib/trimRange";

export type { AutoStopReason };

export type RecordedSound = {
  /** trim 구간만 잘라낸 샘플 */
  samples: Float32Array;
  sampleRate: number;
  /** samples를 16비트 PCM WAV로 인코딩한 Blob (audio/wav) */
  wav: Blob;
};

/**
 * 녹음 대화상자가 호스트에 알리는 실패 정보. `kind`로 좁힌다.
 * - save: onSave가 reject했다. `cause`는 reject된 값이다.
 * - microphone: 마이크를 쓸 수 없다. 녹음 단계마다 한 번만 알린다. Re-record로 녹음 단계에 돌아오면 다시 알린다.
 *   `code`가 원인이다(권한 거부, 장치 없음, 사용 중, 끊김 등).
 *   `cause`는 브라우저가 던진 원본 예외다. 원본이 없는 사전 검사 실패는 MicrophoneError 자신이다.
 *
 * `kind`와 `cause`는 `code`가 생기기 전과 같은 이름이다. `kind`만 읽는 호스트 코드는 그대로 동작한다.
 */
export type RecordDialogError =
  | { kind: "save"; cause: unknown }
  | { kind: "microphone"; code: MicrophoneErrorCode; cause: unknown };

export type RecordDialogOptions = {
  /** Promise를 돌려주면 끝날 때까지 Save 버튼이 Loading...으로 비활성이다 */
  onSave: (recorded: RecordedSound) => void | Promise<void>;
  /**
   * 저장이나 마이크 사용에 실패하면 호출한다. 호스트가 실패를 사용자에게 보여 줄 때 쓴다.
   * 없어도 대화상자 문구와 console.error는 그대로 남고 Save 버튼은 원래대로 돌아온다.
   * 이 콜백이 던지는 예외는 삼키고 console.error로만 남긴다.
   */
  onError?: (error: RecordDialogError) => void;
};

export function useRecordDialog({ onSave, onError }: RecordDialogOptions) {
  const [state, dispatch] = useReducer(recordDialogReducer, initialRecordDialogState);
  const stateRef = useRef(state);
  const onSaveRef = useRef(onSave);
  const onErrorRef = useRef(onError);
  const mountedRef = useRef(false);
  // 지금 녹음 단계에서 마이크 실패를 이미 알렸는지. ref는 StrictMode의 effect 이중 실행에서도 유지된다.
  // Re-record(back)로 새 녹음 단계가 열리면 푼다
  const microphoneReportedRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
    onSaveRef.current = onSave;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** 호스트에 실패를 알린다. 콜백이 던져도 대화상자 흐름과 React 트리를 깨지 않는다. */
  const reportError = (error: RecordDialogError) => {
    try {
      onErrorRef.current?.(error);
    } catch (callbackError) {
      console.error("onError 콜백이 예외를 던졌다", callbackError);
    }
  };

  /** 마이크 실패를 녹음 단계마다 한 번만 알린다. */
  const reportMicrophoneError = (error: MicrophoneError) => {
    if (microphoneReportedRef.current) return;
    microphoneReportedRef.current = true;
    reportError({ kind: "microphone", code: error.code, cause: error.cause ?? error });
  };

  const record = () => dispatch({ type: "record" });

  /** autoStopReason은 사용자가 멈추지 않고 저절로 멈췄을 때만 준다. 전이 규칙은 recordDialogReducer에 있다. */
  const stopRecording = (result: RecordingResult, autoStopReason: AutoStopReason | null = null) =>
    dispatch({ type: "stopRecording", result, autoStopReason });

  /**
   * 마이크 실패를 호스트에 알린다. 녹음 중에 끊겨 partial이 오면 그때까지의 녹음을 살려 재생·trim 단계로 넘긴다.
   * 오류로만 처리하면 사용자가 이미 녹음한 소리를 잃는다. 끊김을 알려도 저장은 할 수 있어야 한다.
   */
  const microphoneError = (error: MicrophoneError, partial?: RecordingResult) => {
    reportMicrophoneError(error);
    if (partial) stopRecording(partial, "microphone-lost");
  };

  const play = () => dispatch({ type: "play" });
  const stopPlaying = () => dispatch({ type: "stopPlaying" });
  /**
   * 녹음 단계로 돌아간다. 새 녹음기가 마이크를 다시 열므로 마이크 실패 알림도 다시 할 수 있게 한다.
   * 끊김 뒤 Re-record한 녹음기가 다른 이유(장치 없음 등)로 실패하면 호스트가 그 원인을 받아야 한다.
   */
  const back = () => {
    microphoneReportedRef.current = false;
    dispatch({ type: "back" });
  };
  const setTrimStart = (trimStart: number) => dispatch({ type: "setTrimStart", trimStart });
  const setTrimEnd = (trimEnd: number) => dispatch({ type: "setTrimEnd", trimEnd });
  const setPlayhead = (playhead: number) => dispatch({ type: "setPlayhead", playhead });

  /**
   * trim 구간만 잘라 WAV로 인코딩해 onSave로 넘긴다.
   * 인코딩은 동기이고 같은 틱에 onSave를 부른다. 그래서 encoding이 true이면 onSave는 이미 불렸고,
   * RecordDialog는 이 사실에 기대어 저장 중 닫기를 확인 없이 처리한다. 인코딩을 비동기로 바꾸면 그쪽도 고쳐야 한다.
   */
  const submit = async () => {
    const { samples, sampleRate, trimStart, trimEnd } = stateRef.current;
    if (!samples) return;
    dispatch({ type: "setEncoding", encoding: true });
    try {
      const { startIndex, endIndex } = trimSampleRange(samples.length, trimStart, trimEnd);
      let clipped = samples.slice(startIndex, endIndex);
      // 빈 WAV는 디코딩이 실패할 수 있어 1샘플 무음으로 대신한다
      if (clipped.length === 0) clipped = new Float32Array(1);
      await onSaveRef.current({
        samples: clipped,
        sampleRate,
        wav: createWavBlob(clipped, sampleRate),
      });
    } catch (e) {
      // Error가 아닌 값으로 reject해도 이 블록에서 다시 던지지 않도록 문자열로 바꾼다
      console.error(`Could not save the recording: ${e instanceof Error ? e.message : String(e)}`);
      reportError({ kind: "save", cause: e });
    } finally {
      if (mountedRef.current) dispatch({ type: "setEncoding", encoding: false });
    }
  };

  return {
    ...state,
    onRecord: record,
    onStopRecording: stopRecording,
    onPlay: play,
    onStopPlaying: stopPlaying,
    onBack: back,
    onSetTrimStart: setTrimStart,
    onSetTrimEnd: setTrimEnd,
    onSetPlayhead: setPlayhead,
    onSubmit: submit,
    onMicrophoneError: microphoneError,
  };
}
