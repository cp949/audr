// 음량 맞춤 도구. 효과 결과를 입력의 음량에 맞추거나 작은 소리를 키운다.
//
// 전제:
// - 입력 배열은 바꾸지 않고 새 배열을 돌려준다. 되돌리기 이력이 입력 배열을 그대로 보관한다.
// - 무음이나 거의 무음인 입력에서 0으로 나누지 않는다. 이런 입력을 최대 음량으로 키우면
//   잡음이나 신호음이 크게 들려 청각에 위험하므로 키우지 않고 그대로 둔다.

/** 최대 음량 맞춤의 상한. 1에 닿으면 클리핑하므로 조금 낮춘다. */
const PEAK_LIMIT = 0.98;

/** 이 값 이하의 최대값은 무음으로 본다. */
const SILENCE_PEAK = 1e-4;

/** `x`의 절댓값 최대값을 돌려준다. 빈 배열은 0이다. */
export function peakOf(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (v > p) p = v;
  }
  return p;
}

/**
 * `y`의 최대값을 `min(0.98, peakOf(x))`에 맞춘다.
 * `y` 또는 `x`의 최대값이 1e-4 이하이면 스케일 없이 `y`의 복사본을 돌려준다.
 * `x`가 무음일 때 `y`를 키우지 않기 위해서다.
 */
export function matchPeak(y: Float32Array, x: Float32Array): Float32Array {
  const py = peakOf(y);
  const px = peakOf(x);
  if (py <= SILENCE_PEAK || px <= SILENCE_PEAK) return y.slice();
  const g = Math.min(PEAK_LIMIT, px) / py;
  // Float32Array.from(y, fn)은 긴 입력에서 느리고 일시 메모리를 많이 쓴다. 일반 루프로 곱한다.
  const out = new Float32Array(y.length);
  for (let i = 0; i < y.length; i++) out[i] = y[i] * g;
  return out;
}

/**
 * `y`의 RMS를 `x`에 맞추고, 최대값이 `x`의 최대값을 넘지 않게 누른다.
 * 위상을 맞춰 더하는 효과는 최대값이 커지므로, 최대값 기준 맞춤이 결과 전체를 낮추는 일을 막는다.
 *
 * 누르는 방식:
 * - 경계는 `x` 최대값의 0.8배이다.
 * - 경계를 넘는 부분만 tanh로 눌러 `x`의 최대값 안에 둔다.
 * - `y` 또는 `x`가 무음이면 결과는 0이다.
 */
export function fitLevel(y: Float32Array, x: Float32Array): Float32Array {
  let ex = 0;
  let ey = 0;
  let top = 0;
  for (let i = 0; i < x.length; i++) {
    ex += x[i] * x[i];
    top = Math.max(top, Math.abs(x[i]));
  }
  for (let i = 0; i < y.length; i++) ey += y[i] * y[i];

  const g = ey > 1e-12 ? Math.sqrt(ex / ey) : 0;
  const knee = 0.8 * top;
  const out = new Float32Array(y.length);
  for (let i = 0; i < y.length; i++) {
    const v = y[i] * g;
    const a = Math.abs(v);
    out[i] =
      a <= knee || top === 0
        ? v
        : Math.sign(v) * (knee + (top - knee) * Math.tanh((a - knee) / (top - knee)));
  }
  return out;
}

/**
 * 작은 소리를 키우고 큰 소리를 눌러 음량을 고르게 한다. `k`가 클수록 많이 고르고, 0이면 그대로다.
 * 문장 끝 음절은 보통 앞보다 20~30dB 작아서 기계 목소리로 바꾸면 들리지 않는 일이 많다.
 *
 * 동작:
 * - 포락선은 공격 5ms, 해제 80ms로 따라간다.
 * - 포락선의 상위 10% 지점을 기준으로 삼는다.
 * - 배율은 `(포락선 / 기준)^-k`이고 0.4~6배로 제한한다. 6배는 약 15.6dB이다.
 * - 포락선이 기준의 2%보다 작으면 2%로 본다. 무음 구간을 끝없이 키우지 않기 위해서다.
 * - 기준이 1e-6보다 작으면 무음으로 보고 복사본을 돌려준다.
 *
 * 배경 잡음도 같이 커지므로 `k`를 너무 높이지 않는다.
 */
export function leveler(y: Float32Array, sampleRate: number, k: number): Float32Array {
  const n = y.length;
  if (k <= 0 || n === 0) return y.slice();

  const attack = Math.exp(-1 / (0.005 * sampleRate));
  const release = Math.exp(-1 / (0.08 * sampleRate));
  const env = new Float32Array(n);
  let e = 0;
  for (let i = 0; i < n; i++) {
    const v = y[i] * y[i];
    e = v > e ? attack * e + (1 - attack) * v : release * e + (1 - release) * v;
    env[i] = Math.sqrt(e);
  }

  // 타입 배열 sort는 숫자 순으로 정렬한다.
  const ref = env.slice().sort()[Math.floor(n * 0.9)];
  if (ref < 1e-6) return y.slice();

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const g = Math.pow(Math.max(env[i], ref * 0.02) / ref, -k);
    out[i] = y[i] * Math.min(6, Math.max(0.4, g));
  }
  return out;
}
