// 롤러코스터. 재생 속도가 빨라졌다 느려지길 반복해 음높이가 함께 출렁인다.
import { segmentEffect, type EffectDef } from "./segment";

/** 속도가 출렁이는 횟수(Hz). */
const RATE_HZ = 0.6;

/** 속도가 출렁이는 폭. 재생 비율은 `1 + depth * sin`이다. */
const DEPTH = 0.35;

/**
 * 읽는 위치를 샘플마다 `1 + depth * sin(2π * rateHz * i / sr)`씩 옮기며 선형 보간한다.
 * 결과 길이는 입력과 같다.
 * `depth`가 1 미만이면 위치가 뒤로 가지 않는다.
 *
 * 끝의 무음 꼬리:
 * - `i`번째 출력의 읽는 위치는 `i + depth × (sin 누적)`이다.
 * - sin 누적은 거의 언제나 0 이상이라 읽는 위치가 출력 위치보다 앞선다.
 * - 그래서 읽는 위치가 입력 끝에 먼저 닿고, 그 뒤의 출력은 0이다.
 * - 꼬리 길이는 입력 길이에 따라 다르다.
 *   0.6Hz, 폭 0.35에서 0.5초 입력은 약 90ms, 1초는 약 185ms, 2초는 약 49ms다.
 */
export function coasterSamples(
  x: Float32Array,
  sampleRate: number,
  rateHz: number,
  depth: number,
): Float32Array {
  const length = x.length;
  const out = new Float32Array(length);
  const last = length - 1;
  const step = (2 * Math.PI * rateHz) / sampleRate;
  let position = 0;
  for (let i = 0; i < length; i++) {
    if (position > last) break;
    const index = Math.max(0, Math.floor(position));
    const fraction = position - index;
    const a = x[index] as number;
    const b = x[Math.min(index + 1, last)] as number;
    out[i] = a + (b - a) * fraction;
    position += 1 + depth * Math.sin(step * i);
  }
  return out;
}

/** 롤러코스터. */
export const coaster: EffectDef = segmentEffect({
  transform: (mid, sampleRate) => coasterSamples(mid, sampleRate, RATE_HZ, DEPTH),
});
