import { describe, expect, it } from "vitest";
import { coaster, coasterSamples } from "../src/effects/coaster";
import type { EffectDef } from "../src/effects/segment";
import { scratch, scratchSamples } from "../src/effects/scratch";
import { stutter } from "../src/effects/stutter";
import { vibrato } from "../src/effects/vibrato";

const RATE = 44100;

const EFFECTS: [string, EffectDef][] = [
  ["따따따", stutter],
  ["스크래치", scratch],
  ["떨림", vibrato],
  ["롤러코스터", coaster],
];

function ramp(length: number): Float32Array {
  return Float32Array.from({ length }, (_, i) => (i + 1) / length);
}

function sine(length: number, hz: number, amplitude: number): Float32Array {
  return Float32Array.from(
    { length },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE),
  );
}

function zeroCrossings(x: Float32Array): number {
  let count = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1]! < 0 !== x[i]! < 0) count++;
  return count;
}

describe("따따따", () => {
  it("따따따는 창마다 앞 조각을 되풀이한다", async () => {
    const length = RATE;
    const x = ramp(length);
    const { samples } = await stutter.run(x, RATE, 0, length);
    const windowLength = Math.floor(0.3 * RATE);
    const sliceLength = Math.floor(0.1 * RATE);
    const fade = Math.floor(0.002 * RATE);
    expect(samples.length).toBe(length);
    // 두 번째 조각의 페이드가 끝난 첫 샘플은 창 시작 쪽 값과 같다.
    expect(samples[sliceLength + fade]).toBeCloseTo(x[fade]!, 6);
    expect(samples[sliceLength + 2000]).toBeCloseTo(x[2000]!, 6);
    // 두 번째 창은 자기 시작 값을 되풀이한다.
    expect(samples[windowLength + sliceLength + fade]).toBeCloseTo(x[windowLength + fade]!, 6);
    // 조각 경계는 0으로 내려갔다가 다시 올라온다.
    expect(samples[sliceLength - 1]).toBeCloseTo(0, 6);
    expect(samples[sliceLength]).toBeCloseTo(0, 6);
  });

  it("따따따는 창보다 짧은 입력도 길이가 같다", async () => {
    const x = ramp(1000);
    const { samples } = await stutter.run(x, RATE, 0, 1000);
    expect(samples.length).toBe(1000);
    expect(samples.every(Number.isFinite)).toBe(true);
  });
});

describe("스크래치", () => {
  it("스크래치는 읽는 위치가 처음과 끝에서 입력의 처음·끝과 같다", async () => {
    const x = ramp(10000);
    const { samples } = await scratch.run(x, RATE, 0, x.length);
    expect(samples.length).toBe(x.length);
    expect(samples[0]).toBeCloseTo(x[0]!, 6);
    expect(samples[x.length - 1]).toBeCloseTo(x[x.length - 1]!, 4);
  });

  it("스크래치는 depth 0이면 입력과 같다", () => {
    const x = sine(5000, 300, 0.8);
    const out = scratchSamples(x, 5, 0);
    for (let i = 0; i < x.length; i++) expect(Math.abs(out[i]! - x[i]!)).toBeLessThan(1e-6);
  });

  it("스크래치는 되돌리는 세기 2.5에서 읽는 위치가 줄어드는 구간이 있다", async () => {
    // 증가하는 램프를 읽으므로 출력이 줄어드는 곳이 읽는 위치가 줄어드는 곳이다.
    const x = ramp(20000);
    const { samples } = await scratch.run(x, RATE, 0, x.length);
    let decreasing = 0;
    for (let i = 1; i < samples.length; i++) if (samples[i]! < samples[i - 1]!) decreasing++;
    expect(decreasing).toBeGreaterThan(1000);
    // 되돌리는 세기가 1 미만이면 거꾸로 가는 구간이 없다.
    const gentle = scratchSamples(x, 5, 0.8);
    for (let i = 1; i < gentle.length; i++)
      expect(gentle[i]!).toBeGreaterThanOrEqual(gentle[i - 1]!);
  });
});

describe("떨림", () => {
  it("떨림은 DC 입력에서 시작 지연 구간 뒤에 같은 값이다", async () => {
    const x = new Float32Array(RATE).fill(0.5);
    const { samples } = await vibrato.run(x, RATE, 0, x.length);
    // 지연 최댓값은 (1.5 + 2 + 1.5)ms = 약 221샘플이다.
    const maxDelay = Math.ceil(0.005 * RATE) + 2;
    expect(samples[0]).toBe(0);
    for (let i = maxDelay; i < samples.length; i++) expect(samples[i]).toBeCloseTo(0.5, 6);
  });

  it("떨림은 440Hz 입력의 순간 주파수가 6Hz로 출렁인다", async () => {
    const x = sine(RATE, 440, 0.5);
    const { samples } = await vibrato.run(x, RATE, 0, x.length);
    // 지연 변화율이 주파수를 바꾼다. 0.04초 창마다 영교차를 세면 값이 오르내린다.
    const windowLength = Math.floor(0.04 * RATE);
    const counts: number[] = [];
    for (let start = 1000; start + windowLength <= samples.length; start += windowLength) {
      counts.push(zeroCrossings(samples.subarray(start, start + windowLength)));
    }
    expect(Math.max(...counts) - Math.min(...counts)).toBeGreaterThanOrEqual(2);
    // 6Hz 주기(약 0.167초)로 오르내리므로 한 주기 안에서 최댓값과 최솟값이 모두 나온다.
    const perCycle = Math.round(1 / 6 / 0.04);
    const cycle = counts.slice(0, perCycle + 1);
    expect(Math.max(...cycle) - Math.min(...cycle)).toBeGreaterThanOrEqual(2);
  });
});

describe("롤러코스터", () => {
  it("롤러코스터는 길이를 바꾸지 않고 끝의 무음 꼬리가 입력 길이의 20% 이하다", async () => {
    // 읽는 위치가 출력 위치보다 앞서 구간 끝에 먼저 닿는다. 그 뒤는 0이다. 2초 입력의 꼬리는 약 49ms다.
    const x = sine(2 * RATE, 440, 0.5);
    const { samples } = await coaster.run(x, RATE, 0, x.length);
    expect(samples.length).toBe(x.length);
    let silent = 0;
    while (silent < samples.length && samples[samples.length - 1 - silent] === 0) silent++;
    expect(silent).toBeLessThanOrEqual(0.2 * x.length);
  });

  it("롤러코스터는 depth 0이면 입력과 같다", () => {
    const x = sine(5000, 300, 0.8);
    const out = coasterSamples(x, RATE, 0.6, 0);
    for (let i = 0; i < x.length; i++) expect(Math.abs(out[i]! - x[i]!)).toBeLessThan(1e-6);
  });
});

describe.each(EFFECTS)("%s 공통 경계", (_name, effect) => {
  it("무음 입력에서 NaN 없이 무음이다", async () => {
    const { samples } = await effect.run(new Float32Array(RATE), RATE, 0, RATE);
    expect(samples.length).toBe(RATE);
    expect(samples.every((v) => v === 0)).toBe(true);
  });

  it("2~10샘플 구간에서 길이를 유지한다", async () => {
    for (let n = 2; n <= 10; n++) {
      const x = Float32Array.from({ length: 30 }, (_, i) => Math.sin(i + 1) * 0.9);
      const plan = effect.plan(30, RATE, 3, 3 + n);
      const { samples, start, end } = await effect.run(x, RATE, 3, 3 + n);
      expect(plan).toEqual({ length: 30, start: 3, end: 3 + n });
      expect(samples.length).toBe(30);
      expect(start).toBe(3);
      expect(end).toBe(3 + n);
      expect(samples.every(Number.isFinite)).toBe(true);
      // 구간 밖은 입력 그대로다.
      expect(samples.subarray(0, 3)).toEqual(x.subarray(0, 3));
      expect(samples.subarray(3 + n)).toEqual(x.subarray(3 + n));
    }
  });

  it("8000Hz 샘플레이트에서도 길이를 유지하고 유한한 값을 낸다", async () => {
    const x = Float32Array.from({ length: 4000 }, (_, i) => 0.5 * Math.sin(i * 0.3));
    const { samples } = await effect.run(x, 8000, 0, x.length);
    expect(samples.length).toBe(x.length);
    expect(samples.every(Number.isFinite)).toBe(true);
  });

  it("큰 입력(풀스케일 사인, 0.95 상수)에서 절댓값 1 이하다", async () => {
    const full = sine(RATE, 440, 1);
    const constant = new Float32Array(RATE).fill(0.95);
    for (const x of [full, constant]) {
      const { samples } = await effect.run(x, RATE, 0, x.length);
      let peak = 0;
      for (const v of samples) peak = Math.max(peak, Math.abs(v));
      expect(peak).toBeLessThanOrEqual(1);
    }
  });

  it("같은 입력을 두 번 실행하면 같고 입력은 바뀌지 않는다", async () => {
    const x = sine(RATE, 440, 0.7);
    const copy = x.slice();
    const a = await effect.run(x, RATE, 0, x.length);
    const b = await effect.run(x, RATE, 0, x.length);
    expect(a.samples).toEqual(b.samples);
    expect(x).toEqual(copy);
    expect(a.samples.buffer).not.toBe(x.buffer);
  });
});
