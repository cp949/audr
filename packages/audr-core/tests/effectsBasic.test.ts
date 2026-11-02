import { describe, expect, it } from "vitest";
import { echo } from "../src/effects/echoTrail";
import { fadeIn, fadeOut } from "../src/effects/fadeCurve";
import { louder, mute, softer } from "../src/effects/gain";
import { reverse, reverseRange } from "../src/effects/reverse";
import { faster, resampleLinear, slower } from "../src/effects/speed";

const RATE = 44100;

function constant(value: number, length: number): Float32Array {
  return new Float32Array(length).fill(value);
}

function sine(length: number): Float32Array {
  return Float32Array.from({ length }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE));
}

describe("속도 효과", () => {
  it("resampleLinear은 선형 보간한다", () => {
    const x = Float32Array.from({ length: 10 }, (_, i) => i);
    expect(Array.from(resampleLinear(x, 2))).toEqual([0, 2, 4, 6, 8]);
    const slow = resampleLinear(x, 0.5);
    expect(slow.length).toBe(20);
    expect(slow[1]).toBeCloseTo(0.5, 6);
  });

  it("빠르게는 1초(44100Hz)를 33923샘플로, 느리게는 58800샘플로 만든다", async () => {
    const x = sine(RATE);
    expect(faster.plan(RATE, RATE, 0, RATE).length).toBe(33923);
    expect(slower.plan(RATE, RATE, 0, RATE).length).toBe(58800);
    expect((await faster.run(x, RATE, 0, RATE)).samples.length).toBe(33923);
    expect((await slower.run(x, RATE, 0, RATE)).samples.length).toBe(58800);
    expect(faster.rate).toBe(1.3);
    expect(slower.rate).toBe(0.75);
  });
});

describe("음량 효과", () => {
  it("크게는 가운데를 1.5배로, 앞뒤에 소리가 있는 경계에서는 구간 안쪽에서 서서히 올린다", async () => {
    const { samples } = await louder.run(constant(0.4, RATE), RATE, 1000, RATE - 1000);
    expect(samples[RATE / 2]).toBeCloseTo(0.6, 6);
    expect(samples[1000]).toBeGreaterThan(0.4);
    expect(samples[1000]).toBeLessThan(0.6);
    expect(samples[RATE - 1001]).toBeGreaterThan(0.4);
    expect(samples[RATE - 1001]).toBeLessThan(0.6);
  });

  it("소리 전체에 걸면 맨 앞과 맨 끝도 바로 목표 배율이다", async () => {
    const { samples } = await louder.run(constant(0.4, RATE), RATE, 0, RATE);
    expect(samples[0]).toBeCloseTo(0.6, 6);
    expect(samples[RATE - 1]).toBeCloseTo(0.6, 6);
  });

  it("크게는 큰 입력도 1을 넘기지 않는다", async () => {
    const { samples } = await louder.run(constant(0.95, RATE), RATE, 0, RATE);
    expect(Math.max(...samples)).toBeLessThan(1);
    expect(samples[RATE / 2]).toBeGreaterThan(0.9);
  });

  it("작게는 0.5 상수를 가운데에서 0.3으로 만든다", async () => {
    const { samples } = await softer.run(constant(0.5, RATE), RATE, 0, RATE);
    expect(samples[RATE / 2]).toBeCloseTo(0.3, 6);
    expect(samples[0]).toBeCloseTo(0.3, 6);
    expect(samples[RATE - 1]).toBeCloseTo(0.3, 6);
  });

  it("음소거는 가운데를 0으로 만들고 구간 밖은 비트 단위로 같다", async () => {
    const input = sine(RATE);
    const start = RATE / 4;
    const end = (RATE * 3) / 4;
    const { samples } = await mute.run(input, RATE, start, end);
    expect(samples.length).toBe(RATE);
    expect(Math.max(...samples.subarray(start + 400, end - 400).map(Math.abs))).toBe(0);
    expect(samples.subarray(0, start)).toEqual(input.subarray(0, start));
    expect(samples.subarray(end)).toEqual(input.subarray(end));
  });
});

describe("음소거 경계", () => {
  it("소리 전체에 걸면 처음부터 끝까지 0이다", async () => {
    const { samples } = await mute.run(constant(0.5, RATE), RATE, 0, RATE);
    expect(Math.max(...samples.map(Math.abs))).toBe(0);
  });

  it("앞뒤에 소리가 있는 쪽 경계에서는 구간 안쪽에서 서서히 0이 된다", async () => {
    const { samples } = await mute.run(constant(0.5, RATE), RATE, 1000, 2000);
    // 첫 샘플은 거의 원래 크기이고 ramp(352샘플)가 지나면 0이다
    expect(samples[1000]).toBeGreaterThan(0.49);
    expect(samples[1000 + 352]).toBe(0);
    expect(samples[1999 - 352]).toBe(0);
    expect(samples[1999]).toBeGreaterThan(0.49);
  });

  it("소리의 처음에 닿은 구간은 시작 쪽 ramp 없이 바로 0이고, 끝 쪽만 서서히 0이 된다", async () => {
    const { samples } = await mute.run(constant(0.5, RATE), RATE, 0, 2000);
    expect(samples[0]).toBe(0);
    expect(samples[1999]).toBeGreaterThan(0.49);
  });
});

describe("페이드 효과", () => {
  it("점점 크게는 상수 1 입력에서 처음 0, 끝 1, 가운데 0.5^1.5다", async () => {
    const { samples } = await fadeIn.run(constant(1, 1001), RATE, 0, 1001);
    expect(samples[0]).toBe(0);
    expect(samples[1000]).toBe(1);
    expect(samples[500]).toBeCloseTo(Math.pow(0.5, 1.5), 6);
  });

  it("점점 작게는 상수 1 입력에서 처음 1, 끝 0, 가운데 0.5^1.5다", async () => {
    const { samples } = await fadeOut.run(constant(1, 1001), RATE, 0, 1001);
    expect(samples[0]).toBe(1);
    expect(samples[1000]).toBe(0);
    expect(samples[500]).toBeCloseTo(Math.pow(0.5, 1.5), 6);
  });
});

describe("뒤집기", () => {
  it("reverseRange는 [1,2,3,4,5,6]의 1/6~5/6 구간을 뒤집고 입력은 바꾸지 않는다", () => {
    const input = Float32Array.from([1, 2, 3, 4, 5, 6]);
    expect(Array.from(reverseRange(input, 1 / 6, 5 / 6))).toEqual([1, 5, 4, 3, 2, 6]);
    expect(Array.from(input)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("reverseRange는 전체 구간을 뒤집는다", () => {
    expect(Array.from(reverseRange(Float32Array.from([1, 2, 3]), 0, 1))).toEqual([3, 2, 1]);
  });

  it("뒤집기 효과는 구간만 뒤집고 앞뒤는 그대로 둔다", async () => {
    const input = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
    const { samples, start, end } = await reverse.run(input, RATE, 2, 6);
    expect(Array.from(samples)).toEqual([0, 1, 5, 4, 3, 2, 6, 7]);
    expect([start, end]).toEqual([2, 6]);
    expect(Array.from(input)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("메아리", () => {
  // 샘플레이트 1000이면 간격 0.3초는 300샘플이다
  const impulse = (index: number, length = 1000) => {
    const x = new Float32Array(length);
    x[index] = 0.4;
    return x;
  };

  it("간격 300샘플마다 절반씩 줄어든 소리를 4번 더한다", async () => {
    const { samples } = await echo.run(impulse(100), 1000, 0, 1000);
    expect(samples.length).toBe(2200);
    expect(samples[100]).toBeCloseTo(0.4, 6);
    expect(samples[400]).toBeCloseTo(0.2, 6);
    expect(samples[700]).toBeCloseTo(0.1, 6);
    expect(samples[1000]).toBeCloseTo(0.05, 6);
    expect(samples[1300]).toBeCloseTo(0.025, 6);
  });

  it("구간 밖의 소리는 되풀이하지 않고, 구간은 그대로 둔다", async () => {
    const x = impulse(100);
    x[900] = 0.4;
    const result = await echo.run(x, 1000, 0, 500);
    expect(result.samples.length).toBe(1700);
    expect(result.samples[900]).toBeCloseTo(0.4, 6);
    expect(result.samples[1200]).toBe(0);
    expect(result.samples[400]).toBeCloseTo(0.2, 6);
    expect([result.start, result.end]).toEqual([0, 500]);
  });

  it("큰 입력도 절댓값 1을 넘기지 않는다", async () => {
    const { samples } = await echo.run(constant(0.95, RATE), RATE, 0, RATE);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
    expect(Math.max(...samples)).toBeGreaterThan(0.9);
  });

  it("되풀이를 더하지 않은 영역은 0.9를 넘는 원음도 바꾸지 않는다", async () => {
    // 구간 [0, 500), 간격 300샘플, 4번: 더하는 영역은 [300, 1700)이다
    const input = constant(0.95, 5000);
    const { samples } = await echo.run(input, 1000, 0, 500);
    expect(samples.subarray(0, 300)).toEqual(input.subarray(0, 300));
    expect(samples.subarray(1700)).toEqual(input.subarray(1700));
  });

  it("plan 길이가 run 결과 길이와 같다", async () => {
    for (const rate of [8000, 44100, 48000]) {
      const x = sine(rate);
      const result = await echo.run(x, rate, rate / 4, rate / 2);
      expect(result.samples.length).toBe(echo.plan(rate, rate, rate / 4, rate / 2).length);
      expect(echo.plan(rate, rate, rate / 4, rate / 2).end).toBe(result.end);
    }
  });
});
