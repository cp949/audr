// 메아리. 구간의 소리를 일정한 간격으로 점점 줄여 원음 위에 겹쳐 더한다.
// 구간 효과와 달리 앞뒤를 밀지 않는다. 겹쳐 더한 꼬리만큼 전체 길이가 늘 수 있다.
import { MIN_SEGMENT, softLimit, type EffectDef, type EffectPlanLike } from "./segment";

/** 되풀이 간격(초). */
const DELAY_SECONDS = 0.3;

/** 되풀이 횟수. */
const REPEATS = 4;

/** 한 번 되풀이할 때마다 남는 비율. */
const DECAY = 0.5;

function plan(length: number, sampleRate: number, start: number, end: number): EffectPlanLike {
  if (end - start < MIN_SEGMENT) return { length, start, end };
  const delay = Math.floor(DELAY_SECONDS * sampleRate);
  return { length: Math.max(length, end + REPEATS * delay), start, end };
}

/**
 * 메아리. `k`번째 되풀이는 `k × 간격`만큼 뒤에 `0.5^k` 배로 더한다.
 * 되풀이가 더해진 영역(첫 되풀이 시작부터 마지막 되풀이 끝까지)에만 부드러운 상한을 건다.
 * 겹쳐 더하면 1을 넘을 수 있다. 더하지 않은 샘플은 원음이 0.9를 넘어도 바꾸지 않는다.
 */
export const echo: EffectDef = {
  plan,
  async run(samples, sampleRate, start, end) {
    const { length } = plan(samples.length, sampleRate, start, end);
    const out = new Float32Array(length);
    out.set(samples);
    if (end - start < MIN_SEGMENT) return { samples: out, start, end };

    const delay = Math.floor(DELAY_SECONDS * sampleRate);
    for (let k = 1; k <= REPEATS; k++) {
      const gain = Math.pow(DECAY, k);
      const offset = k * delay;
      for (let i = start; i < end; i++) {
        out[i + offset] += (samples[i] as number) * gain;
      }
    }
    const limitEnd = Math.min(length, end + REPEATS * delay);
    for (let i = Math.min(start + delay, limitEnd); i < limitEnd; i++) {
      out[i] = softLimit(out[i] as number);
    }
    return { samples: out, start, end };
  },
};
