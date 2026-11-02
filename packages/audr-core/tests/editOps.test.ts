import { afterEach, describe, expect, it, vi } from "vitest";
import type { SoundBuffer } from "../src/audioUtil";
import { deleteRange, keepRange, pasteClip, resample, sliceRange } from "../src/editOps";

/** 0, 1, 2, ... 으로 채운 샘플 */
function ramp(length: number): Float32Array {
  return Float32Array.from({ length }, (_, i) => i);
}

describe("deleteRange", () => {
  it("100개 샘플에서 0.25~0.75를 지우면 길이 50이고 앞 25개와 뒤 25개가 이어진다", () => {
    const s = ramp(100);
    const result = deleteRange(s, 0.25, 0.75);
    expect(result.length).toBe(50);
    expect(Array.from(result)).toEqual([...Array.from(s.slice(0, 25)), ...Array.from(s.slice(75))]);
  });

  it("전체를 지우면 길이 1의 0이다", () => {
    const result = deleteRange(ramp(100), 0, 1);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(0);
  });

  it("길이 1 배열에서 전체를 지워도 길이 1이다", () => {
    const result = deleteRange(new Float32Array([0.5]), 0, 1);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(0);
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const s = ramp(10);
    deleteRange(s, 0, 0.5);
    expect(Array.from(s)).toEqual(Array.from(ramp(10)));
  });
});

describe("keepRange", () => {
  it("0.25~0.75만 남기면 길이 50이고 값은 s[25..75)다", () => {
    const s = ramp(100);
    const result = keepRange(s, 0.25, 0.75);
    expect(result.length).toBe(50);
    expect(Array.from(result)).toEqual(Array.from(s.slice(25, 75)));
  });

  it("결과가 비면 길이 1의 0이다", () => {
    const result = keepRange(ramp(100), 0.5, 0.5);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(0);
  });
});

describe("sliceRange", () => {
  it("0.25~0.75 구간을 복사한다", () => {
    const s = ramp(100);
    expect(Array.from(sliceRange(s, 0.25, 0.75))).toEqual(Array.from(s.slice(25, 75)));
  });

  it("복사본을 바꿔도 원본은 그대로다", () => {
    const s = ramp(10);
    const copy = sliceRange(s, 0, 1);
    copy[0] = 99;
    expect(s[0]).toBe(0);
  });
});

describe("pasteClip", () => {
  const target: SoundBuffer = { samples: ramp(100), sampleRate: 44100 };
  const clip: SoundBuffer = { samples: new Float32Array(20).fill(-1), sampleRate: 44100 };

  it("선택이 null이면 끝에 붙이고 trim은 둘 다 null이다", () => {
    const result = pasteClip(target, clip, null, null);
    expect(Array.from(result.samples)).toEqual([
      ...Array.from(target.samples),
      ...Array.from(clip.samples),
    ]);
    expect(result.trimStart).toBeNull();
    expect(result.trimEnd).toBeNull();
  });

  it("선택 [0.5, 1]이면 앞 50개 + clip + 뒤 0개이고 trim은 붙여넣은 구간이다", () => {
    const result = pasteClip(target, clip, 0.5, 1);
    expect(Array.from(result.samples)).toEqual([
      ...Array.from(target.samples.slice(0, 50)),
      ...Array.from(clip.samples),
    ]);
    expect(result.samples.length).toBe(70);
    expect(result.trimStart).toBeCloseTo(50 / 70, 9);
    expect(result.trimEnd).toBeCloseTo((50 + 20) / 70, 9);
  });

  it("선택이 중간이면 선택 구간을 clip으로 교체한다", () => {
    const result = pasteClip(target, clip, 0.25, 0.75);
    expect(result.samples.length).toBe(25 + 20 + 25);
    expect(Array.from(result.samples.slice(0, 25))).toEqual(
      Array.from(target.samples.slice(0, 25)),
    );
    expect(Array.from(result.samples.slice(25, 45))).toEqual(Array.from(clip.samples));
    expect(Array.from(result.samples.slice(45))).toEqual(Array.from(target.samples.slice(75)));
  });

  it("샘플레이트가 다르면 거부한다 (호출자가 먼저 resample해야 한다)", () => {
    const other: SoundBuffer = { samples: new Float32Array(10), sampleRate: 22050 };
    expect(() => pasteClip(target, other, null, null)).toThrow("sampleRate");
  });
});

describe("resample", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const buffer: SoundBuffer = { samples: Float32Array.from([1, 2, 3, 4, 5]), sampleRate: 44100 };

  it("OfflineAudioContext가 없으면 절반 rate는 dropEveryOtherSample 결과를 돌려준다", async () => {
    const result = await resample(buffer, 22050);
    expect(Array.from(result.samples)).toEqual([1, 3]);
    expect(result.sampleRate).toBe(22050);
  });

  it("OfflineAudioContext가 없고 절반 rate가 아니면 reject한다", async () => {
    await expect(resample(buffer, 16000)).rejects.toThrow("Could not resample");
  });

  it("OfflineAudioContext가 있으면 렌더링 결과와 새 rate를 돌려준다", async () => {
    const rendered = Float32Array.from([9, 9]);
    class FakeOfflineAudioContext {
      static args: unknown[] = [];
      destination = {};
      oncomplete: ((e: { renderedBuffer: { getChannelData: () => Float32Array } }) => void) | null =
        null;
      constructor(...args: unknown[]) {
        FakeOfflineAudioContext.args = args;
      }
      createBufferSource() {
        return { connect() {}, start() {}, buffer: null };
      }
      createBuffer() {
        return { getChannelData: () => new Float32Array(5) };
      }
      startRendering() {
        queueMicrotask(() =>
          this.oncomplete?.({ renderedBuffer: { getChannelData: () => rendered } }),
        );
        return Promise.resolve();
      }
    }
    vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
    const result = await resample(buffer, 22050);
    expect(result.samples).toBe(rendered);
    expect(result.sampleRate).toBe(22050);
    // 채널 1, 길이 = 5 * 22050 / 44100(소수점 버림), 샘플레이트 22050
    expect(FakeOfflineAudioContext.args).toEqual([1, 2, 22050]);
  });
});
