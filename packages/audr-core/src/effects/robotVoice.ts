// 로봇 음성 도구와 로봇·기계 인간이 같이 쓰는 처리 틀.
//
// 처리 틀(`voiceEffect`):
// - 구간을 경계 주파수에서 낮은 쪽과 높은 쪽으로 나눈다.
// - 낮은 쪽만 기계 목소리로 바꾼다. 결과는 꼬리만큼 길다.
// - 높은 쪽(ㅅ·ㅊ·ㅎ 같은 쉬익 소리)은 원음으로 되돌려 더한다. 음높이를 고정하면 쉬익 소리도 윙 소리가 되어 자음이 들리지 않는다.
// - 음량을 고르고(`leveler`) 구간 입력의 RMS와 최대값에 맞춘다(`fitLevel`, `matchPeak`).
// - 입력 배열은 바꾸지 않는다.
import { crossover } from "./biquad";
import { fft } from "./fft";
import { fitLevel, leveler, matchPeak } from "./level";
import { segmentEffect, type EffectDef } from "./segment";

/** 끝에 붙는 꼬리(초). 울림이 갑자기 잘리지 않게 한다. */
const TAIL_SECONDS = 0.2;

/** 이 주파수 위의 소리는 원음으로 둔다. */
const EDGE_HZ = 4000;

/** 높은 쪽 원음을 되돌려 더하는 배율. */
const SIBILANCE = 1;

/** `leveler`의 고르는 정도. 문장 끝 음절이 묻히지 않게 한다. */
const EVEN = 0.5;

/** 꼬리 길이(샘플). `plan`의 길이 계산과 `run`의 변환이 같이 써서 둘의 길이가 같다. */
function tailLength(sampleRate: number): number {
  return Math.floor(TAIL_SECONDS * sampleRate);
}

/** 금속 울림의 되먹임 간격(샘플). 울림이 음높이의 2.37배 주파수 간격으로 생긴다. */
export function metalDelay(sampleRate: number, pitch: number): number {
  return Math.max(1, Math.round(sampleRate / (pitch * 2.37)));
}

/**
 * 음높이를 f0 하나로 고정한다. ext샘플만큼 더 출력해 끝이 잘리지 않게 한다.
 * 결과 길이는 x.length + ext다. 에너지(제곱합)는 입력과 같다.
 *
 * 동작:
 * - 펄스 간격 `H`는 `max(16, round(sampleRate / f0))`샘플이다.
 * - 창 길이 `N`은 512부터 2배씩 키워 `2.5 × H` 이상이 된 첫 값이다. Hann 창을 쓴다.
 * - 프레임 중심은 0부터 `x.length + ext + N` 전까지 `H` 간격이다.
 * - 프레임마다 FFT 크기만 남기고 위상을 0으로 만들어 역변환한다. 펄스 중심이 인덱스 0에 온다.
 * - 펄스를 `0.5 + 0.5 cos(2π off / N)` 테이퍼로 프레임 중심에 겹쳐 더한다.
 * - 결과 전체의 에너지(제곱합)를 입력과 같게 맞춘다. ext가 0이면 RMS가 같다.
 *
 * 모음 색(스펙트럼 모양)은 남고 음높이만 f0의 일정한 윙 소리가 된다.
 * 입력이 무음이면 결과도 무음이다.
 */
export function robotize(
  x: Float32Array,
  sampleRate: number,
  f0: number,
  ext: number,
): Float32Array {
  const n = x.length;
  const total = n + ext;
  const hop = Math.max(16, Math.round(sampleRate / f0));
  let size = 512;
  while (size < 2.5 * hop) size <<= 1;
  const half = size >> 1;

  const win = new Float64Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  // 역변환 결과의 인덱스 j는 중심에서 off = j 또는 j − N 떨어진 위치다. cos가 짝수라 테이퍼는 j로 구해 둔다.
  const taper = new Float64Array(size);
  for (let j = 0; j < size; j++) taper[j] = 0.5 + 0.5 * Math.cos((2 * Math.PI * j) / size);

  // 프레임 버퍼는 한 번만 만들어 모든 프레임이 다시 쓴다. 30초 소리는 프레임이 수천 개다.
  const out = new Float64Array(total);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let center = 0; center < total + size; center += hop) {
    const start = center - half;
    for (let i = 0; i < size; i++) {
      const k = start + i;
      re[i] = k >= 0 && k < n ? x[k] * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im, false);
    for (let i = 0; i < size; i++) {
      re[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      im[i] = 0;
    }
    fft(re, im, true);
    for (let j = 0; j < size; j++) {
      const pos = center + (j < half ? j : j - size);
      if (pos >= 0 && pos < total) out[pos] += re[j] * taper[j];
    }
  }

  let eo = 0;
  let ei = 0;
  for (let i = 0; i < total; i++) eo += out[i] * out[i];
  for (let i = 0; i < n; i++) ei += x[i] * x[i];
  const g = eo > 1e-12 ? Math.sqrt(ei / eo) : 0;
  const res = new Float32Array(total);
  for (let i = 0; i < total; i++) res[i] = out[i] * g;
  return res;
}

/** 되먹임 빗살 필터. out[i] += g × out[i − D]. 금속통 같은 울림이 생긴다. `gain`은 1 미만이어야 발산하지 않는다. */
export function metalComb(x: Float32Array, delay: number, gain: number): Float32Array {
  const out = x.slice();
  for (let i = delay; i < out.length; i++) out[i] += gain * out[i - delay];
  return out;
}

/** 최대값 기준으로 levels 단계로 깎는다. 무음이면 그대로. 값은 `최대값 × 정수 / (levels / 2)`가 된다. */
export function crush(x: Float32Array, levels: number): Float32Array {
  let pk = 0;
  for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  if (pk === 0) return x.slice();
  const half = levels / 2;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (Math.round((x[i] / pk) * half) / half) * pk;
  return out;
}

/**
 * 로봇 음성 효과를 만든다. 결과 길이는 구간 길이 + floor(0.2 × sampleRate)다.
 * `shape`는 낮은 쪽을 받아 꼬리 `tail`샘플만큼 긴 기계 목소리를 돌려준다.
 * 이 함수가 `shape`의 결과에 높은 쪽을 더해 고쳐 쓰므로 `shape`는 새 배열을 돌려줘야 한다.
 */
export function voiceEffect(
  shape: (low: Float32Array, sampleRate: number, tail: number) => Float32Array,
): EffectDef {
  return segmentEffect({
    midLength: (m, sampleRate) => m + tailLength(sampleRate),
    transform(mid, sampleRate) {
      const { low, high } = crossover(mid, sampleRate, EDGE_HZ);
      const y = shape(low, sampleRate, tailLength(sampleRate));
      for (let i = 0; i < high.length; i++) y[i] += SIBILANCE * high[i];
      return matchPeak(fitLevel(leveler(y, sampleRate, EVEN), mid), mid);
    },
  });
}
