// 로봇 음성 도구(robotize, metalComb, crush)와 로봇·기계 인간 효과의 수치 계약을 고정한다.
// 순수 함수라 node 환경에서 샘플 배열만으로 검사한다. 잡음은 시드 고정 난수라 결과가 매번 같다.
import { describe, expect, it } from "vitest";
import { biquad } from "../src/effects/biquad";
import { cyborg } from "../src/effects/cyborg";
import { peakOf } from "../src/effects/level";
import { mulberry32 } from "../src/effects/random";
import { robot } from "../src/effects/robot";
import { crush, metalComb, robotize } from "../src/effects/robotVoice";
import type { EffectDef } from "../src/effects/segment";

const RATE = 44100;

const VOICES: [string, EffectDef][] = [
  ["로봇", robot],
  ["기계 인간", cyborg],
];

function sine(freq: number, amp: number, seconds: number, rate = RATE): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate),
  );
}

/** 음높이가 `f0`에서 `f1`까지 직선으로 바뀌는 톱니파. */
function sweepSaw(f0: number, f1: number, seconds: number): Float32Array {
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    out[i] = 0.5 * (2 * phase - 1);
    phase += (f0 + ((f1 - f0) * i) / n) / RATE;
    phase -= Math.floor(phase);
  }
  return out;
}

/** 6~8kHz 대역의 잡음. 백색 잡음을 highpass·lowpass 두 번씩 거른다. */
function hissNoise(seconds: number, amp: number): Float32Array {
  const rand = mulberry32(3);
  let x: Float32Array = Float32Array.from(
    { length: Math.round(seconds * RATE) },
    () => amp * (rand() * 2 - 1),
  );
  x = biquad(biquad(x, RATE, "highpass", 6000), RATE, "highpass", 6000);
  return biquad(biquad(x, RATE, "lowpass", 8000), RATE, "lowpass", 8000);
}

function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
}

function energy(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return s;
}

/** 지연 `minLag`~`maxLag`의 정규화 자기상관. 지연 0의 값으로 나눈다. */
function autocorr(x: Float32Array, minLag: number, maxLag: number): Float64Array {
  const r = new Float64Array(maxLag + 1);
  const e = energy(x);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    r[lag] = e > 0 ? s / e : 0;
  }
  return r;
}

/** 자기상관 최대값의 0.9배 이상인 첫 봉우리의 지연. 배음 지연(2배, 3배)을 고르지 않게 첫 봉우리를 쓴다. */
function pitchLag(x: Float32Array, minLag: number, maxLag: number): number {
  const r = autocorr(x, minLag, maxLag);
  let top = 0;
  for (let lag = minLag; lag <= maxLag; lag++) top = Math.max(top, r[lag]);
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (r[lag] >= 0.9 * top && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) return lag;
  }
  return -1;
}

function maxAutocorr(x: Float32Array, minLag: number, maxLag: number): number {
  const r = autocorr(x, minLag, maxLag);
  let top = 0;
  for (let lag = minLag; lag <= maxLag; lag++) top = Math.max(top, r[lag]);
  return top;
}

function hasNaN(x: Float32Array): boolean {
  return x.some((v) => !Number.isFinite(v));
}

describe("robotize", () => {
  it("robotize는 음높이가 변하는 소리를 140Hz로 고정한다", () => {
    const y = robotize(sweepSaw(120, 200, 1), RATE, 140, 0);
    // 양 끝은 창이 반쯤 걸쳐 빼고 가운데로 잰다.
    const lag = pitchLag(y.subarray(4410, 39690), Math.floor(RATE / 400), Math.ceil(RATE / 60));
    const expected = RATE / 140;
    expect(Math.abs(lag - expected) / expected).toBeLessThanOrEqual(0.015);
  });

  it("robotize는 길이가 입력 + ext이고 RMS가 입력과 같다", () => {
    const x = sweepSaw(120, 200, 0.5);
    const same = robotize(x, RATE, 140, 0);
    expect(same.length).toBe(x.length);
    expect(rms(same) / rms(x)).toBeCloseTo(1, 2);

    // ext만큼 늘어난 결과는 에너지(제곱합)가 입력과 같다. 늘어난 길이로 나누면 RMS가 작아진다.
    const ext = Math.floor(0.2 * RATE);
    const longer = robotize(x, RATE, 140, ext);
    expect(longer.length).toBe(x.length + ext);
    expect(energy(longer) / energy(x)).toBeCloseTo(1, 2);
  });

  it("robotize는 무음 입력에서 NaN 없이 무음이다", () => {
    const y = robotize(new Float32Array(1000), RATE, 90, 100);
    expect(y.length).toBe(1100);
    expect(y.every((v) => v === 0)).toBe(true);
  });
});

describe("metalComb", () => {
  it("metalComb은 D샘플 뒤에 g배로 되돌아온다", () => {
    const x = new Float32Array(30);
    x[0] = 1;
    const out = metalComb(x, 5, 0.3);
    expect(out[0]).toBe(1);
    expect(out[5]).toBeCloseTo(0.3, 6);
    expect(out[10]).toBeCloseTo(0.09, 6);
    expect(out[3]).toBe(0);
    expect(x[5]).toBe(0);
  });
});

describe("crush", () => {
  it("crush는 최대값을 유지하고 값을 levels 단계로 만든다", () => {
    const x = sine(220, 0.8, 0.1);
    const pk = peakOf(x);
    const out = crush(x, 8);
    expect(peakOf(out)).toBeCloseTo(pk, 6);
    for (const v of out) {
      const step = (v / pk) * 4;
      expect(Math.abs(step - Math.round(step))).toBeLessThan(1e-4);
    }
    expect(new Set(out).size).toBeLessThanOrEqual(9);
  });

  it("crush는 무음이면 그대로다", () => {
    const x = new Float32Array(100);
    expect(crush(x, 64)).toEqual(x);
  });
});

describe("로봇과 기계 인간", () => {
  it("로봇은 ㅅ 같은 쉬익 소리(6~8kHz 잡음)를 원음 수준으로 남긴다", async () => {
    // 앞 0.7초는 200Hz 사인, 뒤 0.3초는 고음 잡음이다.
    const head = sine(200, 0.5, 0.7);
    const hiss = hissNoise(0.3, 0.6);
    const x = new Float32Array(head.length + hiss.length);
    x.set(head);
    x.set(hiss, head.length);

    const { samples } = await robot.run(x, RATE, 0, x.length);
    // 사인의 되돌림(0.08초)과 창 반쪽이 끝 구간에 섞이지 않도록 0.85초부터 잰다.
    const from = Math.round(0.85 * RATE);
    const ratio = rms(samples, from, x.length) / rms(x, from, x.length);
    expect(ratio).toBeGreaterThanOrEqual(0.5);
    expect(ratio).toBeLessThanOrEqual(2);
    // 윙 소리로 바뀌었다면 음높이 주기(90Hz는 490샘플)에서 자기상관이 커진다.
    const tail = samples.subarray(from, x.length);
    expect(maxAutocorr(tail, Math.floor(RATE / 400), Math.ceil(RATE / 60))).toBeLessThan(0.3);
  });

  it.each(VOICES)("%s은 끝이 작은 소리도 끝 구간이 들리게 키운다", async (_name, def) => {
    // 앞 0.5초는 0.5, 뒤 1초는 0.02다.
    // leveler의 포락선은 큰 소리가 끝난 뒤 약 0.5초 동안 천천히 내려온다. 작은 소리를 그보다 길게 둔다.
    const x = sine(440, 0.5, 1.5);
    for (let i = RATE / 2; i < x.length; i++) x[i] *= 0.04;
    const { samples } = await def.run(x, RATE, 0, x.length);
    // 결과는 꼬리가 붙어 길어지므로 입력의 끝 0.3초와 같은 위치를 잰다.
    const from = x.length - Math.round(0.3 * RATE);
    expect(rms(samples, from, x.length) / rms(x, from, x.length)).toBeGreaterThanOrEqual(4);
  });

  it.each(VOICES)("%s은 길이가 0.2초 늘어난다", async (_name, def) => {
    for (const rate of [8000, 44100, 48000]) {
      const x = sine(440, 0.5, 0.5, rate);
      const start = Math.floor(x.length / 4);
      const end = Math.floor((3 * x.length) / 4);
      const plan = def.plan(x.length, rate, start, end);
      const result = await def.run(x, rate, start, end);
      expect(plan.length, `${rate}Hz 계획 길이`).toBe(x.length + Math.floor(0.2 * rate));
      expect(result.samples.length, `${rate}Hz 길이`).toBe(plan.length);
      expect(result.end, `${rate}Hz 끝`).toBe(plan.end);
      // 8000Hz는 경계 4000Hz와 lowpass 5000Hz가 나이퀴스트 이상이다.
      expect(hasNaN(result.samples), `${rate}Hz NaN`).toBe(false);
    }
  });

  it.each(VOICES)("%s의 결과 최대값은 입력 최대값을 넘지 않는다", async (_name, def) => {
    const inputs = [new Float32Array(RATE / 2).fill(0.95), sine(440, 1, 0.5), sine(150, 0.5, 0.5)];
    for (const x of inputs) {
      const { samples } = await def.run(x, RATE, 0, x.length);
      // 결과는 Float32라 0.98도 Float32로 반올림한 값(0.98000001…)이 된다.
      const limit = Math.fround(Math.min(0.98, peakOf(x)));
      expect(peakOf(samples)).toBeLessThanOrEqual(limit);
    }
  });

  it.each(VOICES)("%s은 무음 입력에서 NaN 없이 무음이다", async (_name, def) => {
    const x = new Float32Array(RATE / 2);
    const { samples } = await def.run(x, RATE, 0, x.length);
    expect(samples.length).toBe(x.length + Math.floor(0.2 * RATE));
    expect(samples.every((v) => v === 0)).toBe(true);
  });

  it.each(VOICES)("%s은 2~10샘플 구간도 길이가 plan과 같다", async (_name, def) => {
    const x = sine(440, 0.5, 0.05);
    for (let n = 2; n <= 10; n++) {
      const plan = def.plan(x.length, RATE, 100, 100 + n);
      const result = await def.run(x, RATE, 100, 100 + n);
      expect(result.samples.length, `${n}샘플`).toBe(plan.length);
      expect(result.end, `${n}샘플 끝`).toBe(plan.end);
      expect(hasNaN(result.samples), `${n}샘플 NaN`).toBe(false);
    }
  });

  it.each(VOICES)("%s은 같은 입력에 같은 결과다", async (_name, def) => {
    const x = sweepSaw(120, 200, 0.5);
    const a = await def.run(x, RATE, 1000, x.length - 1000);
    const b = await def.run(x, RATE, 1000, x.length - 1000);
    expect(a).toEqual(b);
  });

  it.each(VOICES)("%s은 입력 배열을 바꾸지 않는다", async (_name, def) => {
    const x = sweepSaw(120, 200, 0.3);
    const copy = x.slice();
    await def.run(x, RATE, 0, x.length);
    expect(x).toEqual(copy);
  });
});
