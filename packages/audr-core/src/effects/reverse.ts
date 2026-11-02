// 뒤집기. 구간의 샘플 순서를 거꾸로 만든다.
import { segmentEffect } from "./segment";

/** 선택 구간(0~1 비율)의 샘플 순서를 뒤집은 새 배열을 돌려준다. 입력은 바꾸지 않는다. */
export function reverseRange(samples: Float32Array, start: number, end: number): Float32Array {
  const out = samples.slice();
  const from = Math.floor(start * samples.length);
  const to = Math.floor(end * samples.length);
  for (let i = from; i < to; i++) {
    out[i] = samples[to - 1 - (i - from)] as number;
  }
  return out;
}

/** 뒤집기 효과. 구간만 거꾸로 만들고 길이는 그대로다. */
export const reverse = segmentEffect({
  transform: (mid) => mid.slice().reverse(),
});
