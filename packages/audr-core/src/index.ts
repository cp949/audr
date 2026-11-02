// 공개 범위를 이름으로 고정한다. 파일을 옮겨도 공개 이름이 바뀌지 않게 `export *`를 쓰지 않는다.
//
// 안정 API: SoundBuffer, MicrophoneErrorCode(타입), decodeAudioFile, maxEditableSamples, createWavBlob, encodeWavPcm16, resample, applyEffect 계열.
// 나머지는 @cp949/audr(UI)가 쓰는 내부용이다. 이름은 유지하지만 변경될 수 있다.

// 안정 API
export type { SoundBuffer } from "./audioUtil";
export { decodeAudioFile } from "./decodeAudioFile";
export { maxEditableSamples } from "./audioUtil";
export { createWavBlob, encodeWavPcm16 } from "./encodeWav";
export { resample } from "./editOps";
export { applyEffect, planEffect, reverseRange } from "./audioEffects";
export type { EffectName, EffectPlan } from "./audioEffects";
export type { MicrophoneErrorCode } from "./microphoneError";

// 내부용 (변경될 수 있음)
export { AudioBufferPlayer } from "./audioBufferPlayer";
export { AudioRecorder } from "./audioRecorder";
export type { RecordingResult } from "./audioRecorder";
export {
  assertMicrophoneAvailable,
  classifyMicrophoneError,
  MicrophoneError,
  toMicrophoneError,
} from "./microphoneError";
export {
  computeChunkedRMS,
  computeRMS,
  downsampleIfNeeded,
  dropEveryOtherSample,
} from "./audioUtil";
export { deleteRange, keepRange, pasteClip, sliceRange } from "./editOps";
export { WAV_HEADER_SIZE } from "./encodeWav";
export { History, UNDO_STACK_SIZE } from "./history";
export type { HistoryBudget } from "./history";
export { getSharedAudioContext } from "./sharedAudioContext";
