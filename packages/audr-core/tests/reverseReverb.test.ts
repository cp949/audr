// 거꾸로 울림의 수치 계약을 고정한다.
// 순수 함수라 node 환경에서 샘플 배열만으로 검사한다. 임펄스 응답은 시드 고정이라 결과가 매번 같다.
import { describe, expect, it } from "vitest";
import { peakOf } from "../src/effects/level";
import { mulberry32 } from "../src/effects/random";
import { convolve, reverbImpulse, reverseReverb } from "../src/effects/reverseReverb";

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

describe("convolve", () => {
  it("convolve는 직접 계산한 컨볼루션과 같다", () => {
    const rand = mulberry32(3);
    const x = Float32Array.from({ length: 50 }, () => rand() * 2 - 1);
    const h = Float32Array.from({ length: 20 }, () => rand() * 2 - 1);
    const y = convolve(x, h);
    expect(y.length).toBe(69);
    for (let n = 0; n < y.length; n++) {
      let s = 0;
      for (let k = 0; k < h.length; k++) {
        const i = n - k;
        if (i >= 0 && i < x.length) s += x[i] * h[k];
      }
      expect(Math.abs(y[n] - s)).toBeLessThan(1e-5);
    }
  });

  it("convolve는 입력이 비면 빈 배열을 돌려준다", () => {
    expect(convolve(new Float32Array(0), new Float32Array(4)).length).toBe(0);
    expect(convolve(new Float32Array(4), new Float32Array(0)).length).toBe(0);
  });

  it("convolve는 30초 입력도 처리하고 임의 위치의 값이 직접 계산과 같다", () => {
    const n = 30 * RATE;
    const rand = mulberry32(9);
    const x = Float32Array.from({ length: n }, () => rand() * 2 - 1);
    const h = Float32Array.from({ length: 1000 }, () => rand() * 2 - 1);
    const y = convolve(x, h);
    expect(y.length).toBe(n + 999);
    for (const at of [0, 12345, 654321, n - 1, n + 500, n + 998]) {
      let s = 0;
      for (let k = 0; k < h.length; k++) {
        const i = at - k;
        if (i >= 0 && i < n) s += x[i] * h[k];
      }
      expect(Math.abs(y[at] - s)).toBeLessThan(1e-3);
    }
  });

  // 긴 입력은 블록으로 나눠 변환한다. 블록 경계에서 꼬리가 빠지거나 두 번 더해지면 값이 어긋난다.
  // 경계 앞뒤 샘플과 일정 간격의 샘플을 모두 직접 계산과 비교한다.
  it("convolve는 블록 경계를 여러 번 넘는 긴 입력에서도 직접 계산과 같다", () => {
    const rand = mulberry32(31);
    const x = Float32Array.from({ length: 300_000 }, () => rand() * 2 - 1);
    const h = Float32Array.from({ length: 66_150 }, () => rand() * 2 - 1);
    const y = convolve(x, h);
    expect(y.length).toBe(x.length + h.length - 1);
    // 블록 길이는 2^18 − h.length + 1이다. 경계 ±1과 2^18 ±1을 함께 본다.
    const block = 2 ** 18 - h.length + 1;
    const at = [0, 1, block - 1, block, block + 1, 2 ** 18 - 1, 2 ** 18, 2 ** 18 + 1];
    at.push(x.length - 1, x.length, y.length - 2, y.length - 1);
    for (let i = 0; i < y.length; i += 1009) at.push(i);
    for (const i of at) expect(Math.abs(y[i] - directAt(x, h, i))).toBeLessThan(1e-3);
  });

  it("convolve는 h가 2^18 이상이어도 직접 계산과 같다", () => {
    const rand = mulberry32(32);
    const x = Float32Array.from({ length: 700_000 }, () => rand() * 2 - 1);
    const h = Float32Array.from({ length: 2 ** 18 }, () => (rand() * 2 - 1) * 0.1);
    const y = convolve(x, h);
    expect(y.length).toBe(x.length + h.length - 1);
    // 블록 길이가 h보다 길도록 FFT 크기가 2^19로 커진다. 경계는 2^19 − h.length + 1의 배수다.
    const block = 2 ** 19 - h.length + 1;
    const at = [0, 1, x.length - 1, x.length, y.length - 1];
    for (const b of [block, 2 * block]) at.push(b - 1, b, b + 1);
    for (let i = 0; i < y.length; i += 4999) at.push(i);
    for (const i of at) expect(Math.abs(y[i] - directAt(x, h, i))).toBeLessThan(1e-3);
  });

  it("convolve는 x가 h보다 짧아도 직접 계산과 같다", () => {
    const rand = mulberry32(33);
    const x = Float32Array.from({ length: 1000 }, () => rand() * 2 - 1);
    const h = Float32Array.from({ length: 300_000 }, () => (rand() * 2 - 1) * 0.1);
    const y = convolve(x, h);
    expect(y.length).toBe(x.length + h.length - 1);
    const at = [0, 1, x.length - 1, x.length, h.length - 1, h.length, y.length - 1];
    for (let i = 0; i < y.length; i += 997) at.push(i);
    for (const i of at) expect(Math.abs(y[i] - directAt(x, h, i))).toBeLessThan(1e-3);
  });
});

/** 컨볼루션의 `at`번째 값을 정의대로 직접 더해 구한다. */
function directAt(x: Float32Array, h: Float32Array, at: number): number {
  let s = 0;
  const from = Math.max(0, at - x.length + 1);
  const to = Math.min(h.length - 1, at);
  for (let k = from; k <= to; k++) s += x[at - k] * h[k];
  return s;
}

describe("reverbImpulse", () => {
  it("reverbImpulse는 같은 인자에서 같은 값이고 길이가 floor(length × sr)다", () => {
    const a = reverbImpulse(44100, 1.5, 0.5);
    expect(a.length).toBe(66150);
    expect(reverbImpulse(44100, 1.5, 0.5)).toEqual(a);
    expect(reverbImpulse(8000, 1.5, 0.5).length).toBe(12000);
    expect(reverbImpulse(44100, 0.33333, 0.5).length).toBe(Math.floor(0.33333 * 44100));
  });

  it("reverbImpulse는 뒤쪽이 앞쪽보다 작다", () => {
    const ir = reverbImpulse(44100, 1.5, 0.5);
    const tenth = Math.floor(ir.length / 10);
    expect(rms(ir, ir.length - tenth)).toBeLessThan(0.2 * rms(ir, 0, tenth));
  });

  it("reverbImpulse는 컨볼버 정규화 식으로 크기를 맞춘다", () => {
    // 원래 RMS가 0.000125 이상이면 scale이 RMS를 0.00125 × (44100 / sr)로 만든다.
    for (const sr of [8000, 44100, 48000]) {
      const ir = reverbImpulse(sr, 1.5, 0.5);
      expect(rms(ir) / (0.00125 * (44100 / sr))).toBeCloseTo(1, 3);
    }
  });

  it("reverbImpulse는 길이가 0이어도 NaN 없이 빈 배열이다", () => {
    expect(reverbImpulse(44100, 0, 0.5).length).toBe(0);
  });
});

describe("거꾸로 울림", () => {
  it("거꾸로 울림은 소리가 나기 전에 울림이 먼저 차오른다", async () => {
    // 1초 입력의 0.9~1.0초에만 톤이 있다. 결과에서는 톤이 1.5초 뒤로 밀리고 울림이 그 앞에 생긴다.
    const x = new Float32Array(RATE);
    x.set(sine(440, 0.5, 0.1), Math.floor(0.9 * RATE));
    const y = (await reverseReverb.run(x, RATE, 0, x.length)).samples;

    const burst = Math.floor(1.5 * RATE) + Math.floor(0.9 * RATE);
    const before = rms(y, burst - Math.floor(0.3 * RATE), burst);
    const inputSame = rms(x, Math.floor(0.6 * RATE), Math.floor(0.9 * RATE));
    expect(inputSame).toBe(0);
    expect(before).toBeGreaterThan(inputSame);

    // 서서히 차오른다. 0.3초 구간의 처음 0.1초가 마지막 0.1초보다 작다.
    const tenth = Math.floor(0.1 * RATE);
    const first = rms(y, burst - 3 * tenth, burst - 2 * tenth);
    const last = rms(y, burst - tenth, burst);
    expect(first).toBeLessThan(last);
  });

  it.each([8000, 44100, 48000])("길이가 입력 + 1.5초이고 plan과 같다 (%dHz)", async (sr) => {
    const x = sine(440, 0.5, 0.5, sr);
    const tail = Math.floor(1.5 * sr);
    const r = await reverseReverb.run(x, sr, 0, x.length);
    expect(r.samples.length).toBe(x.length + tail);
    expect(reverseReverb.plan(x.length, sr, 0, x.length)).toEqual({
      length: x.length + tail,
      start: 0,
      end: r.end,
    });
  });

  it("구간 일부에만 걸면 앞뒤를 그대로 두고 뒤 소리를 1.5초 민다", async () => {
    const x = sine(440, 0.5, 1);
    const start = 10000;
    const end = 30000;
    const r = await reverseReverb.run(x, RATE, start, end);
    const tail = Math.floor(1.5 * RATE);
    expect(r.samples.length).toBe(x.length + tail);
    expect(r.end).toBe(end + tail);
    expect(r.samples.subarray(0, start)).toEqual(x.subarray(0, start));
    expect(r.samples.subarray(end + tail)).toEqual(x.subarray(end));
  });

  it("같은 입력은 같은 결과다", async () => {
    const x = sine(440, 0.5, 0.3);
    const a = (await reverseReverb.run(x, RATE, 0, x.length)).samples;
    const b = (await reverseReverb.run(x, RATE, 0, x.length)).samples;
    expect(a).toEqual(b);
  });

  it("결과 최대값은 입력 최대값을 넘지 않는다", async () => {
    const half = sine(440, 0.5, 0.3);
    const yHalf = (await reverseReverb.run(half, RATE, 0, half.length)).samples;
    expect(peakOf(yHalf)).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(peakOf(yHalf)).toBeGreaterThan(0.49);

    const full = sine(440, 0.95, 0.3);
    const yFull = (await reverseReverb.run(full, RATE, 0, full.length)).samples;
    expect(peakOf(yFull)).toBeLessThanOrEqual(0.98);
  });

  it("무음 입력은 NaN 없이 무음이다", async () => {
    const x = new Float32Array(RATE / 2);
    const y = (await reverseReverb.run(x, RATE, 0, x.length)).samples;
    expect(y.length).toBe(x.length + Math.floor(1.5 * RATE));
    expect(hasNaN(y)).toBe(false);
    expect(peakOf(y)).toBe(0);
  });

  it("2~10샘플 구간도 길이가 plan과 같다", async () => {
    for (const sr of [8000, 44100, 48000]) {
      for (let n = 2; n <= 10; n++) {
        const x = Float32Array.from({ length: 30 }, (_, i) => Math.sin(i) * 0.5);
        const r = await reverseReverb.run(x, sr, 5, 5 + n);
        const p = reverseReverb.plan(x.length, sr, 5, 5 + n);
        expect(r.samples.length).toBe(p.length);
        expect(r.end).toBe(p.end);
        expect(hasNaN(r.samples)).toBe(false);
      }
    }
  });

  it("구간이 2샘플보다 짧으면 입력을 그대로 돌려준다", async () => {
    const x = sine(440, 0.5, 0.01);
    const r = await reverseReverb.run(x, RATE, 3, 4);
    expect(r.samples).toEqual(x);
    expect(r.samples).not.toBe(x);
  });
});
