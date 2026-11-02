// 크게·작게·음소거. 구간에 배율을 곱한다.
import { MIN_SEGMENT, softLimit, type EffectDef } from "./segment";

/** 구간 안쪽 경계에서 배율이 서서히 바뀌는 시간(초). 경계의 딸깍 소리를 막는다. */
const RAMP_SECONDS = 0.008;

/** 구간 경계에서 `distance`샘플째까지 0에서 1로 오르는 가중치. `ramp`가 0 이하이면 항상 1이다. */
function rise(distance: number, ramp: number): number {
  return ramp <= 0 ? 1 : Math.min(1, distance / ramp);
}

/**
 * 구간에 `gain`을 곱하는 효과를 만든다.
 *
 * 앞뒤에 소리가 있는 쪽 경계는 구간 안쪽 ramp 동안 배율이 1에서 `gain`까지 서서히 바뀐다.
 * 소리의 맨 앞이나 맨 끝에 닿은 쪽은 이웃 소리가 없어 딸깍 소리가 나지 않으므로 ramp 없이 바로 `gain`이다.
 * ramp를 두면 소리 전체를 음소거해도 양 끝 8ms가 새어 나오고, 작게는 양 끝이 원래 음량으로 남는다.
 * ramp가 구간 안쪽이라 구간 밖 샘플에는 영향이 없다.
 */
function gainEffect(gain: number, limit: boolean): EffectDef {
  return {
    plan: (length, _sampleRate, start, end) => ({ length, start, end }),
    async run(samples, sampleRate, start, end) {
      const out = samples.slice();
      if (end - start < MIN_SEGMENT) return { samples: out, start, end };
      const ramp = Math.floor(RAMP_SECONDS * sampleRate);
      const rampStart = start > 0 ? ramp : 0;
      const rampEnd = end < samples.length ? ramp : 0;
      for (let i = start; i < end; i++) {
        const weight = Math.min(rise(i - start + 1, rampStart), rise(end - i, rampEnd));
        const y = (samples[i] as number) * (1 + (gain - 1) * weight);
        out[i] = limit ? softLimit(y) : y;
      }
      return { samples: out, start, end };
    },
  };
}

/** 크게. 커진 소리가 1을 넘지 않도록 부드러운 상한을 건다. */
export const louder = gainEffect(1.5, true);

/** 작게. */
export const softer = gainEffect(0.6, false);

/** 음소거. */
export const mute = gainEffect(0, false);
