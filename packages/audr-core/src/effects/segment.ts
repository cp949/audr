// 효과 정의 형식과 구간 도우미.
//
// 구간 규칙:
// - 구간 효과는 선택 구간 [start, end)만 변환하고 앞뒤 소리는 그대로 이어 붙인다.
// - 변환 결과 길이가 달라지면 구간 뒤의 소리가 그만큼 밀리거나 당겨진다.
// - 구간이 2샘플 미만이면 효과를 걸지 않고 입력 복사본을 돌려준다.
// - 입력 배열은 바꾸지 않는다. 되돌리기 이력이 입력 배열을 그대로 보관한다.

/** 효과를 적용한 소리와, 결과 배열 기준으로 효과가 적용된 구간(샘플 인덱스). */
export type EffectResult = { samples: Float32Array; start: number; end: number };

/** 렌더링 없이 미리 계산한 결과 길이와 구간. `run` 결과와 같아야 한다. */
export type EffectPlanLike = { length: number; start: number; end: number };

/** 효과 하나의 정의. `start`·`end`는 입력 샘플 인덱스다. */
export type EffectDef = {
  /** 구간 [start, end)에 효과를 적용한 새 소리를 돌려준다. */
  run(samples: Float32Array, sampleRate: number, start: number, end: number): Promise<EffectResult>;

  /** 렌더링 없이 결과 길이와 구간을 계산한다. trim을 미리 알아야 해서 따로 둔다. */
  plan(length: number, sampleRate: number, start: number, end: number): EffectPlanLike;

  /** 빠르게·느리게의 재생 비율. 나머지 효과는 생략한다. */
  rate?: number;
};

/** 구간 길이가 이보다 짧으면 효과를 걸지 않는다. 양 끝 ramp와 `n - 1` 나눗셈이 성립하는 최소 길이다. */
export const MIN_SEGMENT = 2;

/** 0.9 이하는 그대로 두고, 넘는 부분만 부드럽게 눌러 절댓값이 1을 넘지 않게 한다. */
export function softLimit(y: number): number {
  const a = Math.abs(y);
  if (a <= 0.9) return y;
  return Math.sign(y) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
}

/**
 * 구간 변환 함수를 효과 정의로 만든다.
 * 변환 결과 길이는 `midLength`와 같아야 한다. 같은지는 효과마다 테스트로 확인한다.
 */
export function segmentEffect(opts: {
  /** 구간을 변환한 새 배열을 돌려준다. 입력 뷰를 그대로 돌려주면 안 된다. */
  transform(mid: Float32Array, sampleRate: number): Float32Array | Promise<Float32Array>;
  /** 변환 결과 길이. 생략하면 길이가 변하지 않는다. */
  midLength?(midLength: number, sampleRate: number): number;
  rate?: number;
}): EffectDef {
  const lengthOf = (m: number, sampleRate: number) =>
    opts.midLength ? opts.midLength(m, sampleRate) : m;

  return {
    rate: opts.rate,
    plan(length, sampleRate, start, end) {
      if (end - start < MIN_SEGMENT) return { length, start, end };
      const mid = lengthOf(end - start, sampleRate);
      return { length: start + mid + (length - end), start, end: start + mid };
    },
    async run(samples, sampleRate, start, end) {
      if (end - start < MIN_SEGMENT) return { samples: samples.slice(), start, end };
      const mid = await opts.transform(samples.subarray(start, end), sampleRate);
      const out = new Float32Array(start + mid.length + (samples.length - end));
      out.set(samples.subarray(0, start), 0);
      out.set(mid, start);
      out.set(samples.subarray(end), start + mid.length);
      return { samples: out, start, end: start + mid.length };
    },
  };
}
