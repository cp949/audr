// 따따따. 창마다 앞 조각을 되풀이해 창을 채운다. 말을 더듬는 소리가 난다.
import { segmentEffect, type EffectDef } from "./segment";

/** 창 길이(초). 이 길이마다 되풀이를 새로 시작한다. */
const WINDOW_SEC = 0.3;

/** 되풀이하는 앞 조각 길이(초). */
const SLICE_SEC = 0.1;

/** 조각 경계 페이드 길이(초). 조각을 이어 붙일 때 생기는 딸깍 소리를 줄인다. */
const FADE_SEC = 0.002;

/**
 * 구간을 창으로 나누고, 창마다 앞 조각을 창 끝까지 되풀이한 새 배열을 돌려준다.
 * 길이는 입력과 같다. 마지막 창이 짧으면 그 길이 안에서 같은 규칙을 쓴다.
 * 조각 양 끝은 `FADE_SEC`만큼 0에서 1로, 1에서 0으로 줄인다. 조각이 짧으면 절반까지만 줄인다.
 */
function stutterSamples(x: Float32Array, sampleRate: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  const windowLength = Math.max(1, Math.floor(WINDOW_SEC * sampleRate));
  const sliceLength = Math.max(1, Math.floor(SLICE_SEC * sampleRate));
  const fadeLength = Math.floor(FADE_SEC * sampleRate);
  for (let windowStart = 0; windowStart < n; windowStart += windowLength) {
    const windowEnd = Math.min(n, windowStart + windowLength);
    const length = Math.min(windowEnd, windowStart + sliceLength) - windowStart;
    for (let position = windowStart; position < windowEnd; position += length) {
      const copyLength = Math.min(windowEnd, position + length) - position;
      const fade = Math.min(fadeLength, copyLength >> 1);
      for (let i = 0; i < copyLength; i++) {
        let gain = 1;
        if (fade > 0) {
          if (i < fade) gain = i / fade;
          else if (i >= copyLength - fade) gain = (copyLength - 1 - i) / fade;
        }
        out[position + i] = (x[windowStart + i] as number) * gain;
      }
    }
  }
  return out;
}

/** 따따따. */
export const stutter: EffectDef = segmentEffect({ transform: stutterSamples });
