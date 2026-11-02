import { describe, expect, it } from "vitest";
import * as core from "../src/index";

// 1단계(export * 8줄)에서 내보내던 값 이름. 이름 지정 export로 바꾼 뒤에도 같아야 한다.
const PREVIOUS_EXPORTS = [
  "AudioBufferPlayer",
  "AudioRecorder",
  "History",
  "UNDO_STACK_SIZE",
  "WAV_HEADER_SIZE",
  "applyEffect",
  "computeChunkedRMS",
  "computeRMS",
  "createWavBlob",
  "deleteRange",
  "downsampleIfNeeded",
  "dropEveryOtherSample",
  "encodeWavPcm16",
  "getSharedAudioContext",
  "keepRange",
  "pasteClip",
  "planEffect",
  "resample",
  "reverseRange",
  "sliceRange",
];

// 마이크 오류 분류와 사전 검사. 값 export는 내부용이고 MicrophoneErrorCode는 타입이라 값에 없다.
const MICROPHONE_ERROR_EXPORTS = [
  "MicrophoneError",
  "assertMicrophoneAvailable",
  "classifyMicrophoneError",
  "toMicrophoneError",
];

describe("audr-core 공개 export", () => {
  it("이름 집합이 이전 export에 decodeAudioFile, maxEditableSamples, 마이크 오류 export를 더한 것과 같다", () => {
    expect(Object.keys(core).sort()).toEqual(
      [
        ...PREVIOUS_EXPORTS,
        "decodeAudioFile",
        "maxEditableSamples",
        ...MICROPHONE_ERROR_EXPORTS,
      ].sort(),
    );
  });

  it("maxEditableSamples는 44100Hz에서 9,999,999샘플을 돌려준다", () => {
    expect(core.maxEditableSamples(44100)).toBe(9_999_999);
  });
});
