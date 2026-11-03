// 외계인, 방송, 무전기의 수치 계약을 고정한다.
// 순수 함수라 node 환경에서 샘플 배열만으로 검사한다. 무전기 잡음은 시드 고정이라 결과가 매번 같다.
import { describe, expect, it } from "vitest";
import { alien, ringModulate } from "../src/effects/alien";
import { broadcast } from "../src/effects/broadcast";
import { peakOf } from "../src/effects/level";
import { softClip } from "../src/effects/shaper";
import type { EffectDef } from "../src/effects/segment";
import { walkie } from "../src/effects/walkie";

const RATE = 44100;

const FILTERS: [string, EffectDef][] = [
  ["외계인", alien],
  ["방송", broadcast],
  ["무전기", walkie],
];

function sine(freq: number, amp: number, seconds: number, rate = RATE): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate),
  );
}

function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
}

function energy(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return s;
}

/** 주파수 `freq`(Hz)의 DFT 크기. */
function magnitudeAt(x: Float32Array, freq: number, rate = RATE): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < x.length; i++) {
    const w = (2 * Math.PI * freq * i) / rate;
    re += x[i] * Math.cos(w);
    im -= x[i] * Math.sin(w);
  }
  return Math.hypot(re, im) / x.length;
}

/** `lo`~`hi`Hz를 10Hz 간격으로 훑은 DFT 크기 목록. */
function bandMagnitudes(x: Float32Array, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let f = lo; f <= hi; f += 10) out.push(magnitudeAt(x, f));
  return out;
}

/** 10Hz 간격으로 훑어 DFT 크기가 가장 큰 주파수를 돌려준다. */
function dominantFreq(x: Float32Array, lo: number, hi: number, rate = RATE): number {
  let best = lo;
  let bestMag = -1;
  for (let f = lo; f <= hi; f += 10) {
    const m = magnitudeAt(x, f, rate);
    if (m > bestMag) {
      bestMag = m;
      best = f;
    }
  }
  return best;
}

async function runAll(def: EffectDef, x: Float32Array, rate = RATE): Promise<Float32Array> {
  return (await def.run(x, rate, 0, x.length)).samples;
}

describe("softClip", () => {
  it("±1을 ±1로 두고 0을 0으로 두며 ±1을 넘는 입력은 ±1로 막는다", () => {
    const y = softClip(Float32Array.from([1, -1, 0, 3, -5]), 2.5);
    expect(y[0]).toBeCloseTo(1, 6);
    expect(y[1]).toBeCloseTo(-1, 6);
    expect(y[2]).toBe(0);
    expect(y[3]).toBeCloseTo(1, 6);
    expect(y[4]).toBeCloseTo(-1, 6);
  });

  it("입력 배열을 바꾸지 않고 새 배열을 돌려준다", () => {
    const x = Float32Array.from([0.5, -2]);
    const y = softClip(x, 3);
    expect(y).not.toBe(x);
    expect(Array.from(x)).toEqual([0.5, -2]);
  });
});

describe("외계인", () => {
  it("dry 1이면 입력과 같고 dry 0이면 입력에 사인파를 곱한 값이다", () => {
    const x = sine(220, 0.6, 0.2);
    const same = ringModulate(x, RATE, 1);
    for (let i = 0; i < x.length; i++) expect(Math.abs(same[i] - x[i])).toBeLessThan(1e-6);

    const wet = ringModulate(x, RATE, 0);
    let phase = 0;
    for (let i = 0; i < x.length; i++) {
      const expected = x[i] * Math.sin(phase);
      expect(Math.abs(wet[i] - expected)).toBeLessThan(1e-6);
      phase += (2 * Math.PI * (300 + 60 * Math.sin((2 * Math.PI * 5 * i) / RATE))) / RATE;
    }
  });

  it("1000Hz 사인에서 곱하는 주파수 300Hz 주변으로 옆띠(700Hz, 1300Hz 근처)가 생긴다", async () => {
    const x = sine(1000, 0.5, 1);
    const y = await runAll(alien, x);
    // 곱하는 주파수가 240~360Hz로 흔들리므로 옆띠는 한 칸이 아니라 띠로 퍼진다.
    const lower = Math.max(...bandMagnitudes(y, 640, 760));
    const upper = Math.max(...bandMagnitudes(y, 1240, 1360));
    // 원음 1000Hz 크기와 비교한다. 곱하는 주파수가 틀리면 옆띠가 이 범위를 벗어나 작아진다.
    const tone = magnitudeAt(y, 1000);
    expect(lower).toBeGreaterThan(0.1 * tone);
    expect(upper).toBeGreaterThan(0.1 * tone);
  });

  it("길이가 변하지 않는다", async () => {
    const x = sine(440, 0.5, 1);
    expect((await runAll(alien, x)).length).toBe(44100);
    expect(alien.plan(44100, RATE, 0, 44100).length).toBe(44100);
  });
});

describe("방송", () => {
  it("되돌아오는 소리가 0.2초와 0.4초 뒤에 0.35배, 0.1225배로 온다", async () => {
    const n = 4410;
    const x = new Float32Array(n);
    x[0] = 0.5;
    const y = (await broadcast.run(x, RATE, 0, n)).samples;
    expect(y.length).toBe(n + 17640);

    const win = (from: number) => energy(y, from, from + n);
    const direct = win(0);
    const first = win(8820);
    const second = win(17640);
    // 진폭 비가 0.35, 0.1225이므로 에너지 비는 제곱이다.
    expect(first / direct / (0.35 * 0.35)).toBeGreaterThan(0.85);
    expect(first / direct / (0.35 * 0.35)).toBeLessThan(1.15);
    expect(second / direct / (0.1225 * 0.1225)).toBeGreaterThan(0.85);
    expect(second / direct / (0.1225 * 0.1225)).toBeLessThan(1.15);
  });

  it("400Hz 아래와 4500Hz 위를 줄인다", async () => {
    // 결과 최대값을 입력에 맞추므로 사인을 하나씩 돌리면 줄어든 소리가 다시 커진다.
    // 같은 크기의 세 사인을 한 입력에 섞어, 한 결과 안에서 성분 크기를 비교한다.
    const a = sine(100, 0.2, 1);
    const b = sine(1000, 0.2, 1);
    const c = sine(10000, 0.2, 1);
    const x = Float32Array.from(a, (v, i) => v + b[i] + c[i]);
    const y = await runAll(broadcast, x);
    const body = y.subarray(8000, 30000);
    const mid = magnitudeAt(body, 1000);
    expect(magnitudeAt(body, 100)).toBeLessThanOrEqual(0.3 * mid);
    expect(magnitudeAt(body, 10000)).toBeLessThanOrEqual(0.3 * mid);
  });

  it("길이는 입력 + 17640이고 plan과 일치한다", async () => {
    const x = sine(440, 0.5, 1);
    const r = await broadcast.run(x, RATE, 0, x.length);
    expect(r.samples.length).toBe(61740);
    expect(broadcast.plan(x.length, RATE, 0, x.length)).toEqual({
      length: 61740,
      start: 0,
      end: r.end,
    });
  });
});

describe("무전기", () => {
  it("길이는 입력 + 앞뒤 치직·간격·신호음이고 plan과 일치한다", async () => {
    const x = sine(440, 0.5, 1);
    const r = await walkie.run(x, RATE, 0, x.length);
    expect(r.samples.length).toBe(54243);
    expect(walkie.plan(x.length, RATE, 0, x.length)).toEqual({
      length: 54243,
      start: 0,
      end: r.end,
    });
  });

  it("맨 앞 0.05초는 잡음이고 끝 0.1초는 1200Hz 신호음이다", async () => {
    const x = sine(440, 0.5, 1);
    const y = await runAll(walkie, x);
    const pre = y.subarray(0, 2205);
    expect(peakOf(pre)).toBeGreaterThan(0);
    // 잡음이라 어느 한 주파수에 몰리지 않는다. 신호음 구간보다 DFT 최대 크기가 훨씬 작다.
    const beep = y.subarray(y.length - 4410);
    expect(Math.abs(dominantFreq(beep, 600, 2400) - 1200)).toBeLessThanOrEqual(50);
    expect(magnitudeAt(beep, 1200)).toBeGreaterThan(5 * magnitudeAt(pre, 1200));
  });

  it("같은 입력은 같은 결과다", async () => {
    const x = sine(440, 0.5, 0.5);
    expect(await runAll(walkie, x)).toEqual(await runAll(walkie, x));
  });

  it("무음 입력에서도 치직과 신호음이 남고 최대값은 0.15다", async () => {
    // 무음이면 기준 음량 T = 0.3을 쓰고 키우지 않는다. 신호음 최대값은 0.5 × T = 0.15다.
    const y = await runAll(walkie, new Float32Array(RATE));
    expect(peakOf(y)).toBeCloseTo(0.15, 2);
  });
});

describe("필터 효과 공통 안전", () => {
  for (const [name, def] of FILTERS) {
    it(`${name}: 결과 최대값이 0.98을 넘지 않는다(0.95 상수, 풀스케일 사인)`, async () => {
      const constant = new Float32Array(RATE).fill(0.95);
      const full = sine(300, 1, 1);
      expect(peakOf(await runAll(def, constant))).toBeLessThanOrEqual(0.98 + 1e-6);
      expect(peakOf(await runAll(def, full))).toBeLessThanOrEqual(0.98 + 1e-6);
    });

    it(`${name}: 무음 입력에서 NaN이 없다`, async () => {
      const y = await runAll(def, new Float32Array(RATE));
      expect(y.every(Number.isFinite)).toBe(true);
      // 무음을 키우지 않는다. 무전기는 잡음·신호음만 있고 T = 0.3 기준이다.
      expect(peakOf(y)).toBeLessThanOrEqual(0.3);
    });

    it(`${name}: 2~10샘플 구간도 길이가 plan과 같고 NaN이 없다`, async () => {
      const x = sine(300, 0.5, 0.1);
      for (let n = 1; n <= 10; n++) {
        const start = 100;
        const r = await def.run(x, RATE, start, start + n);
        const p = def.plan(x.length, RATE, start, start + n);
        expect(r.samples.length).toBe(p.length);
        expect(r.start).toBe(p.start);
        expect(r.end).toBe(p.end);
        expect(r.samples.every(Number.isFinite)).toBe(true);
      }
    });

    it(`${name}: 구간 일부에 걸면 앞은 그대로이고 뒤는 밀린 길이만큼 이어 붙는다`, async () => {
      const x = sine(300, 0.5, 0.5);
      const start = 5000;
      const end = 15000;
      const r = await def.run(x, RATE, start, end);
      const p = def.plan(x.length, RATE, start, end);
      expect(r.samples.length).toBe(p.length);
      expect(r.samples.subarray(0, start)).toEqual(x.subarray(0, start));
      expect(r.samples.subarray(r.end)).toEqual(x.subarray(end));
    });

    it(`${name}: 8000Hz에서도 NaN이 없다`, async () => {
      const x = sine(300, 0.5, 0.5, 8000);
      const y = await runAll(def, x, 8000);
      expect(y.every(Number.isFinite)).toBe(true);
      expect(peakOf(y)).toBeLessThanOrEqual(0.98 + 1e-6);
    });

    it(`${name}: 입력 배열을 바꾸지 않는다`, async () => {
      const x = sine(300, 0.5, 0.1);
      const copy = x.slice();
      await runAll(def, x);
      expect(x).toEqual(copy);
    });
  }

  it("방송은 8000Hz에서 4500Hz 경계가 나이퀴스트 이상이어도 중간 대역 소리가 남는다", async () => {
    const y = await runAll(broadcast, sine(1000, 0.5, 0.5, 8000), 8000);
    expect(rms(y, 1000, 3000)).toBeGreaterThan(0.05);
  });
});
