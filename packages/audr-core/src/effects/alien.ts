// 외계인. 원음에 사인파를 곱하고 곱하는 주파수를 흔들어 금속처럼 떨리는 소리를 만든다.
import { matchPeak } from "./level";
import { segmentEffect } from "./segment";

/** 곱하는 주파수(Hz). */
const CARRIER = 300;

/** 곱하는 주파수가 오르내리는 폭(Hz). */
const WOBBLE = 60;

/** 곱하는 주파수가 오르내리는 속도(Hz). */
const WOBBLE_RATE = 5;

/** 원음을 섞는 비율. */
const DRY = 0.3;

/**
 * `x`에 사인파를 곱하고 원음을 `dry`만큼 섞는다: `(1 − dry) × x × sin(phase) + dry × x`.
 * `phase`는 첫 샘플이 0이고, 샘플마다 `2π × (300 + 60 × sin(2π × 5 × t)) / sampleRate`를 더해 쌓는다.
 * 곱하는 주파수가 시간에 따라 변하므로 `sin(2π × f × t)`로 쓰지 않고 위상을 누적한다.
 */
export function ringModulate(x: Float32Array, sampleRate: number, dry: number): Float32Array {
  const out = new Float32Array(x.length);
  let phase = 0;
  for (let i = 0; i < x.length; i++) {
    out[i] = (1 - dry) * x[i] * Math.sin(phase) + dry * x[i];
    const freq = CARRIER + WOBBLE * Math.sin((2 * Math.PI * WOBBLE_RATE * i) / sampleRate);
    phase += (2 * Math.PI * freq) / sampleRate;
  }
  return out;
}

/** 외계인. 길이는 변하지 않고, 결과 최대값을 구간 입력의 최대값에 맞춘다. */
export const alien = segmentEffect({
  transform: (mid, sampleRate) => matchPeak(ringModulate(mid, sampleRate, DRY), mid),
});
