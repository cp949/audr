import { describe, expect, it } from "vitest";
import { segmentEffect, softLimit } from "../src/effects/segment";

describe("softLimit", () => {
  it("0.9 이하를 그대로 두고 큰 값도 절댓값 1을 넘지 않게 누른다", () => {
    expect(softLimit(0.5)).toBe(0.5);
    expect(softLimit(-0.9)).toBe(-0.9);
    // 완만하게 넘는 값은 1 미만으로 눌린다
    expect(softLimit(1.5)).toBeGreaterThan(0.9);
    expect(softLimit(1.5)).toBeLessThan(1);
    // 아주 큰 값은 tanh가 부동소수점에서 1이 되어 정확히 1에 닿는다. 넘지는 않는다
    expect(softLimit(5)).toBeLessThanOrEqual(1);
    expect(softLimit(-5)).toBeGreaterThanOrEqual(-1);
  });

  it("0.9 이상 구간에서 단조 증가한다", () => {
    let prev = softLimit(0.9);
    for (let a = 0.95; a <= 10; a += 0.05) {
      const y = softLimit(a);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });
});

describe("segmentEffect", () => {
  const double = segmentEffect({ transform: (mid) => mid.map((v) => v * 2) });

  it("구간이 2샘플 미만이면 입력 복사본을 돌려준다", async () => {
    const input = Float32Array.from([1, 2, 3, 4]);
    const result = await double.run(input, 1000, 1, 2);
    expect(Array.from(result.samples)).toEqual([1, 2, 3, 4]);
    expect(result.samples).not.toBe(input);
    expect([result.start, result.end]).toEqual([1, 2]);
    expect(double.plan(4, 1000, 1, 2)).toEqual({ length: 4, start: 1, end: 2 });
  });

  it("변환 길이만큼 뒤를 밀고 구간을 다시 계산한다", async () => {
    const stretch = segmentEffect({
      transform: () => new Float32Array(8).fill(9),
      midLength: () => 8,
    });
    const input = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const result = await stretch.run(input, 1000, 2, 6);
    expect(result.samples.length).toBe(14);
    expect([result.start, result.end]).toEqual([2, 10]);
    expect(Array.from(result.samples.subarray(0, 2))).toEqual([0, 1]);
    expect(Array.from(result.samples.subarray(10))).toEqual([6, 7, 8, 9]);
    expect(Array.from(result.samples.subarray(2, 10))).toEqual(Array.from({ length: 8 }, () => 9));
    expect(stretch.plan(10, 1000, 2, 6)).toEqual({ length: 14, start: 2, end: 10 });
  });

  it("입력 배열을 바꾸지 않는다", async () => {
    const input = Float32Array.from([1, 2, 3, 4, 5, 6]);
    await double.run(input, 1000, 1, 5);
    expect(Array.from(input)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
