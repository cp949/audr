import type { MicrophoneError } from "@cp949/audr-core";
import { vi } from "vitest";

export type FakeRecordingResult = {
  levels: number[];
  samples: Float32Array;
  sampleRate: number;
  trimStart: number;
  trimEnd: number;
};

/** core의 AudioRecorder 대역. 콜백을 보관해 테스트가 직접 호출한다. */
export class FakeAudioRecorder {
  static instances: FakeAudioRecorder[] = [];
  /** true이면 생성자가 던진다 (AudioContext를 쓸 수 없는 환경) */
  static throwOnCreate = false;
  static nextResult: FakeRecordingResult = {
    levels: [0.1, 0.5, 0.3],
    samples: new Float32Array(1000).fill(0.1),
    sampleRate: 44100,
    trimStart: 0.25,
    trimEnd: 0.75,
  };

  /** 테스트가 정하는 경과 시간(초). 실제 녹음기는 쌓인 샘플 수로 계산한다 */
  recordedSeconds = 0;
  /** 길이 상한(초). 44100Hz 편집 한도(9,999,999샘플)와 같은 값이다 */
  maxRecordingSeconds = 9_999_999 / 44100;

  onStarted: (() => void) | null = null;
  onUpdate: ((level: number) => void) | null = null;
  onError: ((e: MicrophoneError) => void) | null = null;

  startListening = vi.fn(
    (
      onStarted: () => void,
      onUpdate: (level: number) => void,
      onError: (e: MicrophoneError) => void,
    ) => {
      this.onStarted = onStarted;
      this.onUpdate = onUpdate;
      this.onError = onError;
    },
  );
  startRecording = vi.fn();
  stop = vi.fn(() => FakeAudioRecorder.nextResult);
  dispose = vi.fn();

  constructor() {
    if (FakeAudioRecorder.throwOnCreate) throw new Error("AudioContext를 쓸 수 없다");
    FakeAudioRecorder.instances.push(this);
  }

  static get last(): FakeAudioRecorder {
    return FakeAudioRecorder.instances[FakeAudioRecorder.instances.length - 1] as FakeAudioRecorder;
  }

  static reset() {
    FakeAudioRecorder.instances = [];
    FakeAudioRecorder.throwOnCreate = false;
    FakeAudioRecorder.nextResult = {
      levels: [0.1, 0.5, 0.3],
      samples: new Float32Array(1000).fill(0.1),
      sampleRate: 44100,
      trimStart: 0.25,
      trimEnd: 0.75,
    };
  }
}
