// 2차 IIR 필터(biquad)와 4차 크로스오버.
//
// 전제:
// - 계수는 RBJ Audio EQ Cookbook 식이다.
// - `qDb`는 Web Audio의 `BiquadFilterNode.Q`처럼 dB 단위다. 선형 Q는 `10^(qDb/20)`이다.
//   같은 값에서 같은 소리가 나도록 단위를 맞췄다.
// - 필터 상태는 Float64로 유지하고 결과만 Float32로 내보낸다.
// - 입력 배열은 바꾸지 않는다.

export type BiquadType = "lowpass" | "highpass";

/** 크로스오버 두 단이 같이 쓰는 `qDb`. 소리를 이 값(dB 단위)으로 확정했다. */
const CROSSOVER_Q_DB = Math.SQRT1_2;

/**
 * `x`에 2차 lowpass 또는 highpass를 적용한 새 배열을 돌려준다.
 *
 * 경계 처리:
 * - `frequency`가 나이퀴스트(`sampleRate / 2`) 이상이면 lowpass는 입력 복사본, highpass는 무음을 돌려준다.
 * - `frequency`가 0 이하이면 lowpass는 무음, highpass는 입력 복사본을 돌려준다.
 * - 두 경우 모두 계수가 발산하지 않도록 필터를 계산하지 않는다.
 */
export function biquad(
  x: Float32Array,
  sampleRate: number,
  type: BiquadType,
  frequency: number,
  qDb = 1,
): Float32Array {
  if (frequency >= sampleRate / 2) {
    return type === "lowpass" ? x.slice() : new Float32Array(x.length);
  }
  if (frequency <= 0) {
    return type === "lowpass" ? new Float32Array(x.length) : x.slice();
  }

  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosW = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.pow(10, qDb / 20));
  let b0: number;
  let b1: number;
  if (type === "lowpass") {
    b0 = (1 - cosW) / 2;
    b1 = 1 - cosW;
  } else {
    b0 = (1 + cosW) / 2;
    b1 = -(1 + cosW);
  }
  const b2 = b0;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW;
  const a2 = 1 - alpha;

  // a0로 나눠 두면 샘플 루프에서 나눗셈이 없다.
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  const out = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const y = nb0 * xi + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * `fc`를 경계로 소리를 낮은 쪽과 높은 쪽으로 나눈다.
 * 같은 2차 필터(`qDb` = √½, 약 0.71dB)를 2번씩 이은 4차이다.
 *
 * 주의:
 * - 두 쪽을 더해도 경계 부근에서 크기가 평탄하게 돌아온다고 보장하지 않는다.
 *   선형 Q가 √½보다 큰 1.085라 경계에서 두 쪽이 각각 약 +1.4dB 공진한다.
 * - 경계에서 멀면(500Hz, 8000Hz 등) 한쪽은 통과하고 다른 쪽은 20dB 이상 줄어든다.
 * - 경계 처리는 `biquad`와 같다.
 */
export function crossover(
  x: Float32Array,
  sampleRate: number,
  fc: number,
): { low: Float32Array; high: Float32Array } {
  const pass = (type: BiquadType) =>
    biquad(biquad(x, sampleRate, type, fc, CROSSOVER_Q_DB), sampleRate, type, fc, CROSSOVER_Q_DB);
  return { low: pass("lowpass"), high: pass("highpass") };
}
