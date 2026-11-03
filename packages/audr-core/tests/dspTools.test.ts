// 효과 공통 DSP 도구(fft, biquad, level, random)의 수치 계약을 고정한다.
// 순수 함수라 node 환경에서 샘플 배열만으로 검사한다.
import { describe, expect, it } from "vitest";
import { biquad, crossover } from "../src/effects/biquad";
import { fft } from "../src/effects/fft";
import { fitLevel, leveler, matchPeak, peakOf } from "../src/effects/level";
import { mulberry32 } from "../src/effects/random";

const RATE = 44100;

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

function hasNaN(x: Float32Array): boolean {
  return x.some((v) => !Number.isFinite(v));
}

describe("fft", () => {
  it("fft는 역변환하면 원래 값으로 돌아온다", () => {
    const rand = mulberry32(7);
    const n = 64;
    const orig = Float64Array.from({ length: n }, () => rand() * 2 - 1);
    const re = orig.slice();
    const im = new Float64Array(n);
    fft(re, im, false);
    fft(re, im, true);
    for (let i = 0; i < n; i++) {
      expect(Math.abs(re[i] - orig[i])).toBeLessThan(1e-9);
      expect(Math.abs(im[i])).toBeLessThan(1e-9);
    }
  });

  it("fft는 주파수 k의 사인파에서 k번째 칸에 N/2 크기를 만든다", () => {
    const n = 64;
    const k = 5;
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * k * i) / n));
    const im = new Float64Array(n);
    fft(re, im, false);
    expect(Math.hypot(re[k], im[k])).toBeCloseTo(n / 2, 9);
    expect(Math.hypot(re[n - k], im[n - k])).toBeCloseTo(n / 2, 9);
    expect(Math.hypot(re[k + 1], im[k + 1])).toBeLessThan(1e-9);
  });
});

describe("biquad", () => {
  it("lowpass는 경계보다 한참 높은 소리를 30dB 이상 줄이고 낮은 소리는 0.5dB 안에서 통과시킨다", () => {
    const high = sine(8000, 0.5, 0.5);
    const low = sine(100, 0.5, 0.5);
    const highRatio = rms(biquad(high, RATE, "lowpass", 1000), 4000) / rms(high, 4000);
    const lowRatio = rms(biquad(low, RATE, "lowpass", 1000), 4000) / rms(low, 4000);
    expect(20 * Math.log10(highRatio)).toBeLessThan(-30);
    expect(Math.abs(20 * Math.log10(lowRatio))).toBeLessThan(0.5);
  });

  it("highpass는 반대로 동작한다", () => {
    const high = sine(8000, 0.5, 0.5);
    const low = sine(100, 0.5, 0.5);
    const highRatio = rms(biquad(high, RATE, "highpass", 1000), 4000) / rms(high, 4000);
    const lowRatio = rms(biquad(low, RATE, "highpass", 1000), 4000) / rms(low, 4000);
    expect(Math.abs(20 * Math.log10(highRatio))).toBeLessThan(0.5);
    expect(20 * Math.log10(lowRatio)).toBeLessThan(-30);
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const x = sine(440, 0.5, 0.05);
    const copy = x.slice();
    biquad(x, RATE, "lowpass", 1000);
    expect(x).toEqual(copy);
  });

  it("경계가 나이퀴스트 이상이면 NaN 없이 lowpass는 입력과 같고 highpass는 0이다", () => {
    const x = sine(440, 0.5, 0.05, 8000);
    const lp = biquad(x, 8000, "lowpass", 4000);
    const hp = biquad(x, 8000, "highpass", 4000);
    expect(hasNaN(lp)).toBe(false);
    expect(hasNaN(hp)).toBe(false);
    expect(lp).toEqual(x);
    expect(lp).not.toBe(x);
    expect(peakOf(hp)).toBe(0);
    const split = crossover(x, 8000, 4000);
    expect(split.low).toEqual(x);
    expect(peakOf(split.high)).toBe(0);
  });
});

describe("crossover", () => {
  // 크기는 정상 상태 구간의 RMS 비를 dB로 본다. 두 쪽의 합은 경계 부근에서 평탄하지 않아 검사하지 않는다.
  const gainDb = (freq: number, side: "low" | "high") => {
    const x = sine(freq, 0.5, 0.5);
    return 20 * Math.log10(rms(crossover(x, RATE, 4000)[side], 8000) / rms(x, 8000));
  };

  it("crossover의 낮은 쪽은 500Hz를 1dB 안에서 통과시키고 8000Hz를 20dB 이상 줄인다", () => {
    expect(Math.abs(gainDb(500, "low"))).toBeLessThan(1);
    expect(gainDb(8000, "low")).toBeLessThan(-20);
  });

  it("crossover의 높은 쪽은 8000Hz를 3dB 안에서 통과시키고 500Hz를 20dB 이상 줄인다", () => {
    // 8000Hz는 경계의 한 옥타브 위라 공진이 남아 약 +1.9dB가 된다.
    expect(Math.abs(gainDb(8000, "high"))).toBeLessThan(3);
    expect(gainDb(500, "high")).toBeLessThan(-20);
  });

  it("crossover는 경계에서 qDb = √½(약 0.71dB)의 공진으로 두 쪽 모두 약 +1.4dB가 된다", () => {
    // 선형 Q = 10^(√½/20) ≈ 1.085이고, 경계에서 한 단의 크기가 Q라 두 단이면 Q² ≈ 1.177(+1.42dB)이다.
    // 값을 리터럴로 둔 이유는 확정한 소리의 Q가 바뀌면 이 테스트가 실패하게 하기 위해서다.
    expect(gainDb(4000, "low")).toBeCloseTo(1.42, 1);
    expect(gainDb(4000, "high")).toBeCloseTo(1.42, 1);
  });
});

describe("matchPeak", () => {
  it("matchPeak는 최대값을 맞추고 0.98을 넘기지 않는다", () => {
    const y = sine(440, 0.7, 0.05);
    expect(peakOf(matchPeak(y, sine(440, 0.3, 0.05)))).toBeCloseTo(0.3, 6);
    expect(peakOf(matchPeak(y, sine(440, 1.2, 0.05)))).toBeCloseTo(0.98, 6);
  });

  it("y가 무음이면 그대로 돌려준다", () => {
    const y = new Float32Array(100);
    const out = matchPeak(y, sine(440, 0.5, 0.01));
    expect(out).toEqual(y);
    expect(out).not.toBe(y);
  });

  it("기준 x가 무음이면 y를 키우지 않고 그대로 돌려준다", () => {
    // 무음 입력에 잡음·신호음만 있는 결과가 최대 음량으로 커지면 청각에 위험하다.
    const y = Float32Array.from({ length: 100 }, (_, i) => 0.01 * Math.sin(i));
    const out = matchPeak(y, new Float32Array(100));
    expect(out).toEqual(y);
    expect(out).not.toBe(y);
  });

  it("matchPeak는 모든 샘플에 같은 배율 g를 곱한 값과 비트 단위로 같다", () => {
    // 배율 식을 리터럴로 둔다. 곱하는 방식을 바꿔도 결과가 달라지면 실패한다.
    const rand = mulberry32(21);
    const y = Float32Array.from({ length: 5000 }, () => (rand() * 2 - 1) * 0.7);
    const x = Float32Array.from({ length: 3000 }, () => (rand() * 2 - 1) * 0.4);
    const g = Math.min(0.98, peakOf(x)) / peakOf(y);
    expect(matchPeak(y, x)).toEqual(Float32Array.from(y, (v) => v * g));
  });
});

describe("fitLevel", () => {
  it("fitLevel은 RMS를 입력에 맞추고 최대값이 입력 최대값을 넘지 않는다", () => {
    const x = sine(440, 0.4, 0.2);
    // 위상을 맞춘 펄스가 섞여 최대값이 큰 소리
    const y = Float32Array.from(x, (v, i) => v * 0.1 + (i % 500 === 0 ? 0.9 : 0));
    const out = fitLevel(y, x);
    expect(peakOf(out)).toBeLessThanOrEqual(peakOf(x) + 1e-6);
    const smooth = fitLevel(sine(300, 0.05, 0.2), x);
    expect(rms(smooth) / rms(x)).toBeCloseTo(1, 1);
  });

  it("무음 y는 NaN 없이 0이다", () => {
    const out = fitLevel(new Float32Array(100), sine(440, 0.5, 0.01));
    expect(hasNaN(out)).toBe(false);
    expect(peakOf(out)).toBe(0);
  });

  it("x가 무음이어도 NaN 없이 0이다", () => {
    const out = fitLevel(sine(440, 0.5, 0.01), new Float32Array(100));
    expect(hasNaN(out)).toBe(false);
    expect(peakOf(out)).toBe(0);
  });
});

describe("leveler", () => {
  it("leveler는 앞이 크고 끝이 작은 소리의 끝 구간 RMS를 6dB 이상 올린다", () => {
    const y = new Float32Array(RATE);
    y.set(sine(440, 0.5, 0.5));
    y.set(sine(440, 0.02, 0.5), RATE / 2);
    const out = leveler(y, RATE, 1);
    const from = Math.round(0.7 * RATE);
    expect(rms(out, from) / rms(y, from)).toBeGreaterThanOrEqual(2);
  });

  it("k가 0이면 입력과 같다", () => {
    const y = sine(440, 0.3, 0.1);
    const out = leveler(y, RATE, 0);
    expect(out).toEqual(y);
    expect(out).not.toBe(y);
  });

  it("무음이면 NaN 없이 그대로다", () => {
    const y = new Float32Array(1000);
    const out = leveler(y, RATE, 1);
    expect(hasNaN(out)).toBe(false);
    expect(out).toEqual(y);
  });
});

describe("mulberry32", () => {
  it("mulberry32는 같은 시드에서 같은 열을 내고 값이 [0, 1)이다", () => {
    const a = mulberry32(55);
    const b = mulberry32(55);
    const seqA = Array.from({ length: 1000 }, () => a());
    const seqB = Array.from({ length: 1000 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(seqA).size).toBeGreaterThan(990);
  });
});
