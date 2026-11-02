import { beforeEach, describe, expect, it, vi } from "vitest";

// 공유 AudioContext를 가짜로 대체한다. decodeAudioData의 동작은 각 테스트가 정한다.
const decodeAudioData = vi.fn();
vi.mock("../src/sharedAudioContext", () => ({
  getSharedAudioContext: () => ({ sampleRate: 48000, decodeAudioData }),
}));

import { decodeAudioFile } from "../src/decodeAudioFile";

/** 채널 배열로 가짜 AudioBuffer를 만든다. length를 따로 주면 채널 길이와 다를 수 있다. */
function fakeAudioBuffer(channels: number[][], length = channels[0]?.length ?? 0) {
  const data = channels.map((c) => Float32Array.from(c));
  return {
    numberOfChannels: data.length,
    length,
    sampleRate: 48000,
    getChannelData: (i: number) => data[i] as Float32Array,
  };
}

const anyFile = () => new Blob([new Uint8Array([1, 2, 3])]);

describe("decodeAudioFile", () => {
  beforeEach(() => {
    decodeAudioData.mockReset();
  });

  it("스테레오 파일을 채널 평균 모노로 합친다", async () => {
    decodeAudioData.mockResolvedValue(
      fakeAudioBuffer([
        [1, 0.5],
        [0, 0.5],
      ]),
    );
    const result = await decodeAudioFile(anyFile());
    expect(Array.from(result.samples)).toEqual([0.5, 0.5]);
  });

  it("반환 sampleRate는 컨텍스트 sampleRate와 같다", async () => {
    decodeAudioData.mockResolvedValue(fakeAudioBuffer([[0, 0]]));
    const result = await decodeAudioFile(anyFile());
    expect(result.sampleRate).toBe(48000);
  });

  it("이미 모노인 파일은 값을 그대로 돌려준다", async () => {
    const channel = [0.25, -0.5, 1];
    const buffer = fakeAudioBuffer([channel]);
    decodeAudioData.mockResolvedValue(buffer);
    const result = await decodeAudioFile(anyFile());
    expect(Array.from(result.samples)).toEqual(channel);
    // AudioBuffer 내부 배열과 메모리를 공유하지 않는다
    expect(result.samples).not.toBe(buffer.getChannelData(0));
  });

  it("길이 0 파일도 예외 없이 빈 samples를 돌려준다", async () => {
    decodeAudioData.mockResolvedValue(fakeAudioBuffer([[], []]));
    const result = await decodeAudioFile(anyFile());
    expect(result.samples.length).toBe(0);
    expect(result.sampleRate).toBe(48000);
  });

  it("디코드 실패는 브라우저 오류를 그대로 reject한다", async () => {
    const error = new DOMException("디코드할 수 없는 데이터", "EncodingError");
    decodeAudioData.mockRejectedValue(error);
    await expect(decodeAudioFile(anyFile())).rejects.toBe(error);
  });

  it("채널 길이가 서로 달라도 예외 없이 buffer.length 길이로 합친다", async () => {
    // 두 번째 채널이 한 샘플 짧다. 모자란 샘플은 0으로 본다.
    decodeAudioData.mockResolvedValue(
      fakeAudioBuffer(
        [
          [1, 1, 1],
          [1, 1],
        ],
        3,
      ),
    );
    const result = await decodeAudioFile(anyFile());
    expect(Array.from(result.samples)).toEqual([1, 1, 0.5]);
  });

  it("모노 합성 결과가 [-1, 1] 밖으로 나가지 않는다", async () => {
    decodeAudioData.mockResolvedValue(
      fakeAudioBuffer([
        [1, -1, 1],
        [1, -1, -1],
      ]),
    );
    const result = await decodeAudioFile(anyFile());
    for (const v of result.samples) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("파일 바이트를 decodeAudioData에 넘긴다", async () => {
    decodeAudioData.mockResolvedValue(fakeAudioBuffer([[0]]));
    await decodeAudioFile(anyFile());
    const arg = decodeAudioData.mock.calls[0]?.[0] as ArrayBuffer;
    expect(Array.from(new Uint8Array(arg))).toEqual([1, 2, 3]);
  });

  it("Blob.arrayBuffer가 없는 브라우저(Chrome 75)에서도 파일 바이트를 읽는다", async () => {
    decodeAudioData.mockResolvedValue(fakeAudioBuffer([[0]]));
    const file = anyFile();
    // Chrome 76 미만에는 Blob.prototype.arrayBuffer가 없다
    Object.defineProperty(file, "arrayBuffer", { value: undefined });
    await decodeAudioFile(file);
    const arg = decodeAudioData.mock.calls[0]?.[0] as ArrayBuffer;
    expect(Array.from(new Uint8Array(arg))).toEqual([1, 2, 3]);
  });
});
