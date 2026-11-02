import type { RecordingResult } from "@cp949/audr-core";
import { describe, expect, it } from "vitest";
import {
  initialRecordDialogState,
  recordDialogReducer,
  type RecordDialogAction,
  type RecordDialogState,
} from "../src/lib/recordDialogState";

const recorded = (length = 4): RecordingResult => ({
  samples: new Float32Array(length).fill(0.5),
  sampleRate: 44100,
  levels: [0.1, 0.2],
  trimStart: 0.25,
  trimEnd: 0.75,
});

const run = (actions: RecordDialogAction[], from: RecordDialogState = initialRecordDialogState) =>
  actions.reduce(recordDialogReducer, from);

describe("recordDialogReducer 녹음 멈춤", () => {
  it("샘플이 있으면 재생·trim 단계로 넘어가며 녹음 결과를 담는다", () => {
    const result = recorded();
    const state = run([
      { type: "record" },
      { type: "stopRecording", result, autoStopReason: "limit" },
    ]);
    expect(state).toMatchObject({
      samples: result.samples,
      sampleRate: 44100,
      levels: [0.1, 0.2],
      trimStart: 0.25,
      trimEnd: 0.75,
      recording: false,
      autoStopReason: "limit",
    });
  });

  it("샘플이 없으면 녹음 단계에 머물고 녹음 중 상태도 그대로다", () => {
    const state = run([
      { type: "record" },
      { type: "stopRecording", result: recorded(0), autoStopReason: null },
    ]);
    expect(state.samples).toBeNull();
    expect(state.recording).toBe(true);
  });

  it("마이크가 끊겨 샘플 없이 멈추면 녹음 중 상태만 푼다", () => {
    const state = run([
      { type: "record" },
      { type: "stopRecording", result: recorded(0), autoStopReason: "microphone-lost" },
    ]);
    expect(state.samples).toBeNull();
    expect(state.recording).toBe(false);
  });
});

describe("recordDialogReducer 재생 위치", () => {
  it("재생을 멈추면 재생 위치를 비운다", () => {
    const state = run([
      { type: "play" },
      { type: "setPlayhead", playhead: 0.4 },
      { type: "stopPlaying" },
    ]);
    expect(state).toMatchObject({ playing: false, playhead: null });
  });
});

describe("recordDialogReducer 녹음 단계로 돌아가기", () => {
  const inPlayback = () =>
    run([
      { type: "record" },
      { type: "stopRecording", result: recorded(), autoStopReason: "microphone-lost" },
      { type: "setTrimStart", trimStart: 0.3 },
      { type: "setTrimEnd", trimEnd: 0.6 },
      { type: "play" },
      { type: "setPlayhead", playhead: 0.4 },
    ]);

  it("재생·trim 단계에서 쌓인 값을 모두 처음 상태로 되돌린다", () => {
    expect(recordDialogReducer(inPlayback(), { type: "back" })).toEqual(initialRecordDialogState);
  });

  it("저장 중 값(encoding)은 건드리지 않는다", () => {
    const state = recordDialogReducer({ ...inPlayback(), encoding: true }, { type: "back" });
    expect(state).toEqual({ ...initialRecordDialogState, encoding: true });
  });
});
