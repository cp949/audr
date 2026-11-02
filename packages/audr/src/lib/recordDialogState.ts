// 녹음 대화상자의 단계 상태와 전이 규칙. 순수 함수로 두어 React 없이 전이를 검증한다.
// 단계는 samples로 가른다: null이면 녹음 단계, 있으면 재생·trim 단계다.
import type { RecordingResult } from "@cp949/audr-core";

/** limit: 편집 한도 길이에 닿았다. microphone-lost: 녹음 중 마이크가 끊겼다 */
export type AutoStopReason = "limit" | "microphone-lost";

export type RecordDialogState = {
  samples: Float32Array | null;
  sampleRate: number;
  levels: number[] | null;
  playhead: number | null;
  playing: boolean;
  recording: boolean;
  /** 녹음이 저절로 멈춘 이유. 사용자가 멈추면 null이다 */
  autoStopReason: AutoStopReason | null;
  trimStart: number;
  trimEnd: number;
  encoding: boolean;
};

export const initialRecordDialogState: RecordDialogState = {
  samples: null,
  sampleRate: 0,
  levels: null,
  playhead: null,
  playing: false,
  recording: false,
  autoStopReason: null,
  trimStart: 0,
  trimEnd: 1,
  encoding: false,
};

export type RecordDialogAction =
  | { type: "record" }
  | { type: "stopRecording"; result: RecordingResult; autoStopReason: AutoStopReason | null }
  | { type: "play" }
  | { type: "stopPlaying" }
  | { type: "back" }
  | { type: "setTrimStart"; trimStart: number }
  | { type: "setTrimEnd"; trimEnd: number }
  | { type: "setPlayhead"; playhead: number }
  | { type: "setEncoding"; encoding: boolean };

export function recordDialogReducer(
  state: RecordDialogState,
  action: RecordDialogAction,
): RecordDialogState {
  switch (action.type) {
    case "record":
      return { ...state, recording: true };
    case "stopRecording": {
      const { result, autoStopReason } = action;
      // 샘플이 있으면 재생·trim 단계로 넘어간다. 없으면 녹음 단계에 머문다.
      if (result.samples.length > 0) {
        return {
          ...state,
          samples: result.samples,
          sampleRate: result.sampleRate,
          levels: result.levels,
          trimStart: result.trimStart,
          trimEnd: result.trimEnd,
          recording: false,
          autoStopReason,
        };
      }
      // 마이크가 끊겨 멈췄는데 샘플이 없으면 더 쌓일 샘플도 없으므로 녹음 중 상태만 푼다.
      // 녹음 중 상태가 남으면 닫을 때 버릴 것도 없는데 확인창이 뜬다.
      return autoStopReason === "microphone-lost" ? { ...state, recording: false } : state;
    }
    case "play":
      return { ...state, playing: true };
    case "stopPlaying":
      return { ...state, playing: false, playhead: null };
    case "back":
      // 녹음 단계의 상태는 처음과 같다. 필드를 하나씩 되돌리면 빠뜨린 값(재생 위치 등)이 다음 녹음에 남는다.
      // 저장 중 값(encoding)은 저장 흐름이 소유하므로 그대로 둔다
      return { ...initialRecordDialogState, encoding: state.encoding };
    case "setTrimStart":
      return { ...state, trimStart: action.trimStart };
    case "setTrimEnd":
      return { ...state, trimEnd: action.trimEnd };
    case "setPlayhead":
      return { ...state, playhead: action.playhead };
    case "setEncoding":
      return { ...state, encoding: action.encoding };
  }
}
