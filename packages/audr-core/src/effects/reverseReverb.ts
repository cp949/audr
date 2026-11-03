// 거꾸로 울림. 소리가 나기 전에 울림이 먼저 차오르는 영화 같은 소리다.
// 입력을 뒤집어 울림을 입히고 다시 뒤집는다. 뒤집은 소리의 울림 꼬리가 원래 시간으로는 소리 앞에 놓인다.
import { fft } from "./fft";
import { matchPeak } from "./level";
import { mulberry32 } from "./random";
import { segmentEffect } from "./segment";

/** 울림 길이(초). 임펄스 응답 길이이자 결과가 입력보다 늘어나는 길이다. */
const LENGTH = 1.5;

/** 울림이 사라지는 속도(초). 이 시간마다 크기가 1/e로 준다. */
const DECAY = 0.5;

/** 임펄스 응답을 만드는 난수 시드. 같은 입력이 같은 결과를 내게 한다. */
const SEED = 12345;

/**
 * 컨볼버 정규화의 목표 크기. 원래 RMS가 `MIN_POWER` 이상이면 RMS를 이 값(44.1kHz 기준)에 맞춘다.
 * Chrome의 값 10^(−58/20)과 약 0.06dB 차이라 그대로 둔다. 마지막 `matchPeak`가 최대값을 다시 맞춘다.
 */
const GAIN_CALIBRATION = 0.00125;

/** 정규화에서 power의 하한. 거의 무음인 응답을 끝없이 키우지 않는다. */
const MIN_POWER = 0.000125;

/**
 * 시드 고정 소음 × 지수 감쇠로 만든 임펄스 응답. 길이는 `floor(length × sampleRate)`이다.
 * 뒤로 갈수록 어두워지게 1차 저역 통과 계수를 0.6에서 0.08로 줄여 저역만 남긴다.
 * 마지막에 컨볼버와 같은 식으로 정규화한다.
 *
 * 정규화:
 * - `power`는 응답의 RMS다. RMS가 유한하지 않거나 0.000125보다 작으면 0.000125를 쓴다.
 * - 배율은 `(0.00125 / power) × (44100 / sampleRate)`이다.
 */
export function reverbImpulse(sampleRate: number, length: number, decay: number): Float32Array {
  const irLen = Math.floor(length * sampleRate);
  const ir = new Float32Array(irLen);
  const rnd = mulberry32(SEED);

  let y = 0;
  for (let i = 0; i < irLen; i++) {
    const t = i / sampleRate;
    const k = Math.min(1, t / length);
    const a = 0.6 * (1 - k) + 0.08 * k;
    y += a * (rnd() * 2 - 1 - y);
    ir[i] = y * Math.exp(-t / decay);
  }

  let sum = 0;
  for (let i = 0; i < irLen; i++) sum += ir[i] * ir[i];
  const rms = Math.sqrt(sum / irLen);
  const power = Number.isFinite(rms) && rms >= MIN_POWER ? rms : MIN_POWER;
  const scale = (GAIN_CALIBRATION / power) * (44100 / sampleRate);
  for (let i = 0; i < irLen; i++) ir[i] *= scale;
  return ir;
}

/** 블록 FFT 크기의 기본 상한. h가 길면 블록이 h보다 길도록 2배씩 키운다. */
const BLOCK_FFT = 2 ** 18;

/**
 * FFT 컨볼루션. 결과 길이는 `x.length + h.length − 1`이다. 둘 중 하나가 비면 빈 배열이다.
 *
 * overlap-add로 블록마다 변환한다.
 * - FFT 크기 상한은 2^18 이상이면서 `2 × h.length` 이상인 가장 작은 2의 거듭제곱이다.
 * - 결과 길이가 상한 이하이면 결과 길이 이상인 가장 작은 2의 거듭제곱 크기로 한 번에 변환한다.
 * - 그보다 길면 FFT 크기는 상한이고, 입력을 `FFT 크기 − h.length + 1`샘플 블록으로 나눈다.
 * - `h`의 스펙트럼은 한 번만 계산해 모든 블록이 다시 쓴다.
 * - 작업 메모리는 FFT 크기의 `Float64Array` 4개와 꼬리 1개다. 입력 길이와 무관하다.
 *   44.1kHz 울림 응답(66150샘플)에서는 FFT 크기가 2^18이라 약 8.5MB다.
 */
export function convolve(x: Float32Array, h: Float32Array): Float32Array {
  if (x.length === 0 || h.length === 0) return new Float32Array(0);
  const taps = h.length;
  const outLen = x.length + taps - 1;
  let cap = BLOCK_FFT;
  while (cap < 2 * taps) cap <<= 1;
  let size = 1;
  while (size < outLen && size < cap) size <<= 1;
  const block = size - taps + 1;

  const hr = new Float64Array(size);
  const hi = new Float64Array(size);
  hr.set(h);
  fft(hr, hi, false);

  const re = new Float64Array(size);
  const im = new Float64Array(size);
  // 앞 블록 결과 중 다음 블록 자리에 겹치는 꼬리(taps − 1샘플)다.
  const carry = new Float64Array(taps - 1);
  const out = new Float32Array(outLen);
  let start = 0;
  for (; start < x.length; start += block) {
    re.fill(0);
    im.fill(0);
    re.set(x.subarray(start, Math.min(start + block, x.length)));
    fft(re, im, false);
    for (let i = 0; i < size; i++) {
      const r = re[i] * hr[i] - im[i] * hi[i];
      im[i] = re[i] * hi[i] + im[i] * hr[i];
      re[i] = r;
    }
    fft(re, im, true);

    // 첫 블록은 더할 꼬리가 없다. 0을 더하면 −0이 +0으로 바뀌므로 건너뛴다.
    if (start > 0) for (let i = 0; i < taps - 1; i++) re[i] += carry[i];
    const end = Math.min(block, outLen - start);
    for (let i = 0; i < end; i++) out[start + i] = re[i];
    carry.set(re.subarray(block));
  }
  // 마지막 블록의 꼬리를 쓴다. 결과 길이를 넘는 부분은 0이라 버린다.
  const rest = Math.min(taps - 1, outLen - start);
  for (let i = 0; i < rest; i++) out[start + i] = carry[i];
  return out;
}

/** 꼬리 길이(샘플). plan과 run이 같은 식을 쓴다. */
function tailLength(sampleRate: number): number {
  return Math.floor(LENGTH * sampleRate);
}

/**
 * 거꾸로 울림. 결과 길이는 구간 길이 + floor(1.5 × sampleRate)다.
 *
 * 처리 순서:
 * 1. 입력을 뒤집는다.
 * 2. 임펄스 응답을 컨볼루션하고 앞 `구간 길이 + 응답 길이`샘플만 취한다.
 * 3. 울림(wet 1)에 뒤집은 입력을 더한다.
 * 4. 다시 뒤집고 최대값을 입력에 맞춘다.
 *
 * 구간 뒤의 소리는 꼬리 길이만큼 밀린다.
 */
export const reverseReverb = segmentEffect({
  transform(mid, sampleRate) {
    const n = mid.length;
    const irLen = tailLength(sampleRate);
    const reversed = mid.slice().reverse();
    const wet = convolve(reversed, reverbImpulse(sampleRate, LENGTH, DECAY));

    // 컨볼루션 결과는 n + irLen − 1샘플이라 마지막 한 샘플은 0으로 둔다.
    const out = new Float32Array(n + irLen);
    out.set(wet.subarray(0, n + irLen));
    for (let i = 0; i < n; i++) out[i] += reversed[i];
    return matchPeak(out.reverse(), mid);
  },
  midLength: (m, sampleRate) => m + tailLength(sampleRate),
});
