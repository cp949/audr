// 빠르게·느리게. 구간을 선형 보간으로 다시 읽어 길이와 음높이를 함께 바꾼다.
import { segmentEffect, type EffectDef } from "./segment";

/** 빠르게의 재생 비율. 구간이 짧아지고 음이 높아진다. */
const FASTER_RATE = 1.3;

/** 느리게의 재생 비율. 구간이 길어지고 음이 낮아진다. */
const SLOWER_RATE = 0.75;

/**
 * 읽는 위치를 `rate`씩 옮기며 이웃한 두 샘플을 선형 보간한 새 배열을 돌려준다.
 * 길이는 `max(1, floor(n / rate))`이다. 끝을 넘는 위치는 마지막 샘플로 막는다.
 */
export function resampleLinear(x: Float32Array, rate: number): Float32Array {
  const outLength = speedLength(x.length, rate);
  const out = new Float32Array(outLength);
  const last = x.length - 1;
  for (let i = 0; i < outLength; i++) {
    const position = i * rate;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = x[Math.min(index, last)] as number;
    const b = x[Math.min(index + 1, last)] as number;
    out[i] = a + (b - a) * fraction;
  }
  return out;
}

/** 구간 길이가 `rate` 배속으로 바뀐 뒤의 길이. `resampleLinear`과 `plan`이 같은 식을 쓴다. */
function speedLength(length: number, rate: number): number {
  return Math.max(1, Math.floor(length / rate));
}

function speedEffect(rate: number): EffectDef {
  return segmentEffect({
    transform: (mid) => resampleLinear(mid, rate),
    midLength: (m) => speedLength(m, rate),
    rate,
  });
}

/** 빠르게. */
export const faster = speedEffect(FASTER_RATE);
/** 느리게. */
export const slower = speedEffect(SLOWER_RATE);
