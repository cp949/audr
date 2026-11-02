// 점점 크게·점점 작게. 구간 안에서 지수 1.5 곡선으로 음량을 올리거나 내린다.
// 구간이 2샘플 이상일 때만 불리므로(segment.ts의 구간 규칙) `n - 1`로 나눠도 0이 되지 않는다.
import { segmentEffect, type EffectDef } from "./segment";

/** 곡선 지수. 1이면 직선이고 클수록 처음에 천천히 변한다. */
const CURVE = 1.5;

function fadeEffect(rising: boolean): EffectDef {
  return segmentEffect({
    transform(mid) {
      const n = mid.length;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        out[i] = (mid[i] as number) * Math.pow(rising ? t : 1 - t, CURVE);
      }
      return out;
    },
  });
}

/** 점점 크게. 구간 처음은 무음, 끝은 원래 음량이다. */
export const fadeIn = fadeEffect(true);
/** 점점 작게. 구간 처음은 원래 음량, 끝은 무음이다. */
export const fadeOut = fadeEffect(false);
