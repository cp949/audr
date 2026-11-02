// 녹음 단계의 상태와 AudioRecorder 수명 관리를 맡는 훅.
import {
  AudioRecorder,
  toMicrophoneError,
  type MicrophoneError,
  type MicrophoneErrorCode,
  type RecordingResult,
} from "@cp949/audr-core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * onMicrophoneError는 마이크를 쓸 수 없을 때(생성 실패, 권한 거부, 끊김 등) 원인 code를 가진 오류와 함께 불린다.
 * 녹음 중에 끊겼으면 두 번째 인자로 그때까지 녹음한 결과를 함께 준다. 이 결과를 살릴지는 호출하는 쪽이 정한다.
 */
export function useRecordingStep(
  recording: boolean,
  onMicrophoneError?: (error: MicrophoneError, partial?: RecordingResult) => void,
) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  // 녹음 중에 쌓이는 입력 레벨(프레임마다 1개). 녹음 전에는 null이다
  const [levels, setLevels] = useState<number[] | null>(null);
  // 마이크를 쓸 수 없는 원인. 정상이면 null이다
  const [errorCode, setErrorCode] = useState<MicrophoneErrorCode | null>(null);
  // 녹음 중 경과 시간과 길이 상한(초). 녹음 전에는 null이다. 프레임마다 levels와 함께 갱신한다
  const [timing, setTiming] = useState<{ elapsed: number; max: number } | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const recordingRef = useRef(recording);
  const onMicrophoneErrorRef = useRef(onMicrophoneError);
  useLayoutEffect(() => {
    recordingRef.current = recording;
    onMicrophoneErrorRef.current = onMicrophoneError;
  });

  useEffect(() => {
    let recorder: AudioRecorder;
    try {
      recorder = new AudioRecorder();
    } catch (e) {
      // AudioContext를 쓸 수 없는 환경이다
      console.error(`Could not create the audio recorder: ${(e as Error).message}`);
      const error = toMicrophoneError(e, "unsupported");
      // effect 안에서 동기 setState를 부르면 연쇄 렌더가 생기므로 microtask로 미룬다.
      // 그 사이에 정리됐으면(닫힘, StrictMode 첫 실행) 알리지 않는다
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setErrorCode(error.code);
        onMicrophoneErrorRef.current?.(error);
      });
      return () => {
        cancelled = true;
      };
    }
    recorderRef.current = recorder;
    recorder.startListening(
      () => setListening(true),
      (nextLevel) => {
        setLevel(nextLevel);
        if (recordingRef.current) {
          setLevels((prev) => [...(prev ?? []), nextLevel]);
          setTiming({ elapsed: recorder.recordedSeconds, max: recorder.maxRecordingSeconds });
        }
      },
      (error) => {
        setErrorCode(error.code);
        // 녹음 중에 끊겼으면 녹음기를 여기서 멈춰 그때까지의 결과를 넘긴다. 이후 샘플은 녹음기가 이미 쌓지 않는다
        const partial =
          error.code === "track-ended" && recordingRef.current ? recorder.stop() : undefined;
        onMicrophoneErrorRef.current?.(error, partial);
      },
    );
    // unmount 때 마이크를 해제하고 이후 콜백을 막는다
    return () => {
      recorder.dispose();
      recorderRef.current = null;
    };
  }, []);

  /** onLimitReached는 녹음 길이가 편집 한도에 닿았을 때 한 번 불린다 */
  const startRecording = (onLimitReached?: () => void) => {
    recorderRef.current?.startRecording(onLimitReached);
  };

  /** 녹음을 마치고 합쳐진 샘플과 자동 trim을 돌려준다. */
  const stopRecording = (): RecordingResult | undefined => recorderRef.current?.stop();

  return { listening, level, levels, timing, errorCode, startRecording, stopRecording };
}
