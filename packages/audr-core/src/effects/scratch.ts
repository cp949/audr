// 스크래치. 읽는 위치를 앞뒤로 흔들어 판을 문지르는 소리를 만든다.
import { segmentEffect, type EffectDef } from "./segment";

/** 구간 안에서 앞뒤로 흔드는 횟수. */
const SWINGS = 5;

/** 되돌리는 세기. 1을 넘으면 읽는 위치가 줄어드는 구간이 생겨 거꾸로 재생된다. */
const DEPTH = 2.5;

/**
 * 읽는 위치 `(L - 1) * (u + A * sin(2π * k * u))`로 구간을 다시 읽는다. 길이는 입력과 같다.
 * `u`는 0에서 1까지 가는 진행도, `k`(`swings`)는 왕복 횟수다.
 * `A = depth / (2π * k)`라서 위치의 기울기는 `1 + depth * cos`다.
 * 처음과 끝에서는 `sin`이 0이라 입력의 처음과 끝을 읽는다.
 */
export function scratchSamples(x: Float32Array, swings: number, depth: number): Float32Array {
  const length = x.length;
  const out = new Float32Array(length);
  const last = length - 1;
  const amplitude = depth / (2 * Math.PI * swings);
  for (let i = 0; i < length; i++) {
    const u = i / Math.max(1, last);
    const raw = last * (u + amplitude * Math.sin(2 * Math.PI * swings * u));
    // 부동소수 오차로 범위를 살짝 벗어날 수 있어 읽기 전에 막는다.
    const position = Math.min(last, Math.max(0, raw));
    const index = Math.floor(position);
    const fraction = position - index;
    const a = x[index] as number;
    const b = x[Math.min(index + 1, last)] as number;
    out[i] = a + (b - a) * fraction;
  }
  return out;
}

/** 스크래치. */
export const scratch: EffectDef = segmentEffect({
  transform: (mid) => scratchSamples(mid, SWINGS, DEPTH),
});
