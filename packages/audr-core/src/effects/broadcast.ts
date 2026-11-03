// 방송. 운동장 확성기 소리가 건물에 부딪혀 되돌아오는 소리다.
// 좁은 대역으로 깎고 살짝 찌그러뜨린 뒤, 같은 소리를 간격을 두고 두 번 더한다.
import { biquad } from "./biquad";
import { matchPeak } from "./level";
import { segmentEffect } from "./segment";
import { softClip } from "./shaper";

/** 낮은 쪽을 자르는 highpass 경계(Hz). */
const LOW_CUT = 400;

/** 높은 쪽을 자르는 lowpass 경계(Hz). */
const HIGH_CUT = 4500;

/** 되돌아오는 소리의 간격(초). */
const GAP = 0.2;

/** 첫 번째로 되돌아오는 소리의 배율. 두 번째는 이 값의 제곱이다. */
const ECHO = 0.35;

/** 찌그러짐 정도. softClip의 k는 `1 + DRIVE × 6`이다. */
const DRIVE = 0.3;

/** 되돌아오는 소리가 끝나는 곳까지 붙는 꼬리 길이(샘플). plan과 run이 같은 식을 쓴다. */
function tailLength(sampleRate: number): number {
  return Math.floor(GAP * 2 * sampleRate);
}

/** 방송. 결과 길이는 구간 길이 + floor(0.2 × 2 × sampleRate)다. */
export const broadcast = segmentEffect({
  transform(mid, sampleRate) {
    const n = mid.length;
    const band = biquad(
      biquad(mid, sampleRate, "highpass", LOW_CUT),
      sampleRate,
      "lowpass",
      HIGH_CUT,
    );
    const f = softClip(band, 1 + DRIVE * 6);

    const out = new Float32Array(n + tailLength(sampleRate));
    out.set(f);
    for (const m of [1, 2]) {
      const offset = Math.floor(GAP * m * sampleRate);
      const gain = Math.pow(ECHO, m);
      for (let i = 0; i < n; i++) out[i + offset] += f[i] * gain;
    }
    return matchPeak(out, mid);
  },
  midLength: (m, sampleRate) => m + tailLength(sampleRate),
});
