import { describe, expect, it, vi } from "vitest";
import {
  computeChunkedRMS,
  computeRMS,
  downsampleIfNeeded,
  dropEveryOtherSample,
  maxEditableSamples,
  type SoundBuffer,
} from "../src/audioUtil";

describe("computeRMS", () => {
  it("빈 배열은 0을 돌려준다", () => {
    expect(computeRMS(new Float32Array(0))).toBe(0);
  });

  it("모든 값이 0.55이면 scaling 0.55로 나눠 1이 된다", () => {
    const samples = new Float32Array(100).fill(0.55);
    expect(computeRMS(samples)).toBeCloseTo(1, 5);
  });
});

describe("computeChunkedRMS", () => {
  it("샘플 2500개를 기본 chunkSize 1024로 나누면 길이 3이다", () => {
    expect(computeChunkedRMS(new Float32Array(2500)).length).toBe(3);
  });

  it("chunkSize를 지정하면 그 크기로 나눈다", () => {
    expect(computeChunkedRMS(new Float32Array(10), 5).length).toBe(2);
  });
});

describe("dropEveryOtherSample", () => {
  it("[1,2,3,4,5], 44100이면 [1,3], 22050이 된다", () => {
    const result = dropEveryOtherSample({
      samples: new Float32Array([1, 2, 3, 4, 5]),
      sampleRate: 44100,
    });
    expect(Array.from(result.samples)).toEqual([1, 3]);
    expect(result.sampleRate).toBe(22050);
  });
});

describe("downsampleIfNeeded", () => {
  const resampled: SoundBuffer = { samples: new Float32Array(1), sampleRate: 22050 };

  it("바이트 10,000,000 미만이면 resampler를 호출하지 않고 같은 값을 돌려준다", async () => {
    const resampler = vi.fn().mockResolvedValue(resampled);
    const samples = new Float32Array(4_999_999);
    const result = await downsampleIfNeeded({ samples, sampleRate: 44100 }, resampler);
    expect(resampler).not.toHaveBeenCalled();
    expect(result.samples).toBe(samples);
    expect(result.sampleRate).toBe(44100);
  });

  it("10MB 이상이고 22050Hz로 인코딩하면 10MB 미만이면 resampler를 22050으로 호출한다", async () => {
    const resampler = vi.fn().mockResolvedValue(resampled);
    const buffer: SoundBuffer = { samples: new Float32Array(5_000_000), sampleRate: 44100 };
    const result = await downsampleIfNeeded(buffer, resampler);
    expect(resampler).toHaveBeenCalledTimes(1);
    // 큰 배열의 깊은 비교를 피하려고 참조만 비교한다
    const [passed, rate] = resampler.mock.calls[0] as [SoundBuffer, number];
    expect(passed.samples).toBe(buffer.samples);
    expect(passed.sampleRate).toBe(44100);
    expect(rate).toBe(22050);
    expect(result).toBe(resampled);
  });

  it("22050Hz로도 10MB를 넘으면 reject한다", async () => {
    const resampler = vi.fn().mockResolvedValue(resampled);
    const buffer: SoundBuffer = { samples: new Float32Array(6_000_000), sampleRate: 22050 };
    await expect(downsampleIfNeeded(buffer, resampler)).rejects.toThrow(
      "Sound too large to save, refusing to edit",
    );
    expect(resampler).not.toHaveBeenCalled();
  });
});

describe("maxEditableSamples", () => {
  // downsampleIfNeeded는 samples.length만 읽는다. 수천만 샘플을 실제로 만들지 않으려고 길이만 가진 값을 넘긴다.
  const ofLength = (length: number) => ({ length }) as unknown as Float32Array;
  const identity = (b: SoundBuffer) => Promise.resolve(b);

  it.each([8000, 16000, 22050, 44100, 48000, 96000])(
    "%iHz에서 한도 길이는 편집이 받아들이고 1샘플 더 길면 거부한다",
    async (sampleRate) => {
      const max = maxEditableSamples(sampleRate);
      await expect(
        downsampleIfNeeded({ samples: ofLength(max), sampleRate }, identity),
      ).resolves.toBeDefined();
      await expect(
        downsampleIfNeeded({ samples: ofLength(max + 1), sampleRate }, identity),
      ).rejects.toThrow("Sound too large to save, refusing to edit");
    },
  );
});
