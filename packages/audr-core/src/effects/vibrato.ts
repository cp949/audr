// 떨림. 지연 시간을 빠르게 흔들어 음높이가 출렁이게 한다.
import { segmentEffect, type EffectDef } from "./segment";

/** 지연 시간이 흔들리는 속도(Hz). */
const RATE_HZ = 6;

/** 지연 시간이 흔들리는 폭(초). */
const DEPTH_SEC = 0.0015;

/** 지연 중심값에 더하는 여유(초). 흔들려도 지연이 음수가 되지 않게 한다. */
const BASE_SEC = 0.002;

/**
 * `y[i] = x(i - d(i))`. 지연 `d(i)`는 `(depth + base + depth * sin(2π * rate * i / sr))`초를 샘플로 바꾼 값이다.
 * 소수 위치는 선형 보간한다. 구간 시작 전을 읽는 위치는 0으로 본다.
 * 길이는 입력과 같다.
 */
function vibratoSamples(x: Float32Array, sampleRate: number): Float32Array {
  const length = x.length;
  const out = new Float32Array(length);
  const last = length - 1;
  const step = (2 * Math.PI * RATE_HZ) / sampleRate;
  for (let i = 0; i < length; i++) {
    const delay = (DEPTH_SEC + BASE_SEC + DEPTH_SEC * Math.sin(step * i)) * sampleRate;
    const position = Math.min(last, i - delay);
    const index = Math.floor(position);
    const fraction = position - index;
    const a = index >= 0 ? (x[index] as number) : 0;
    const b = index + 1 >= 0 ? (x[Math.min(index + 1, last)] as number) : 0;
    out[i] = a + (b - a) * fraction;
  }
  return out;
}

/** 떨림. */
export const vibrato: EffectDef = segmentEffect({ transform: vibratoSamples });
