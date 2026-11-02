import { vi } from "vitest";

/** 재생에 쓰는 필드만 가진 가짜 AudioBuffer */
export function fakeAudioBuffer(samples: Float32Array, sampleRate: number) {
  const data = Float32Array.from(samples);
  return {
    length: data.length,
    sampleRate,
    duration: data.length / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

/** core의 AudioBufferPlayer 대역. 생성된 인스턴스는 instances에 쌓인다. */
export class FakeAudioBufferPlayer {
  static instances: FakeAudioBufferPlayer[] = [];

  readonly buffer: AudioBuffer;
  play = vi.fn(
    (_start: number, _end: number, onUpdate: (p: number) => void, onEnded: () => void) => {
      this.onUpdate = onUpdate;
      this.onEnded = onEnded;
    },
  );
  stop = vi.fn();
  onUpdate: ((p: number) => void) | null = null;
  onEnded: (() => void) | null = null;

  constructor(samples: Float32Array, sampleRate: number) {
    // 실제 AudioContext.createBuffer는 길이 0이면 NotSupportedError를 던진다. 같은 제약을 흉내 낸다
    if (samples.length === 0) {
      throw new DOMException(
        "The number of frames provided (0) is less than or equal to the minimum bound (0).",
        "NotSupportedError",
      );
    }
    this.buffer = fakeAudioBuffer(samples, sampleRate);
    FakeAudioBufferPlayer.instances.push(this);
  }

  static get last(): FakeAudioBufferPlayer {
    return FakeAudioBufferPlayer.instances[
      FakeAudioBufferPlayer.instances.length - 1
    ] as FakeAudioBufferPlayer;
  }

  static reset() {
    FakeAudioBufferPlayer.instances = [];
  }
}

/** 0, 1, 2, ... 로 채운 샘플 */
export function ramp(length: number): Float32Array {
  return Float32Array.from({ length }, (_, i) => i);
}
