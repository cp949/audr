// 무전기. 좁은 대역에 찌그러진 소리를 쓰고, 앞에 "치직", 뒤에 "치직"과 "삑" 소리를 붙인다.
// 배경 잡음, 치직, 신호음의 난수는 시드 고정이라 같은 입력은 같은 결과를 낸다.
import { biquad } from "./biquad";
import { fitLevel, matchPeak, peakOf } from "./level";
import { mulberry32 } from "./random";
import { segmentEffect } from "./segment";
import { softClip } from "./shaper";

const LOW_CUT = 400;
const HIGH_CUT = 3000;

/** 찌그러짐 정도. softClip의 k는 `1 + DRIVE × 5`다. */
const DRIVE = 0.4;

/** 입력에 더하는 배경 잡음의 크기. */
const NOISE = 0.02;

/** 끝 신호음의 크기(기준 음량 `T`의 배율)와 주파수(Hz). */
const BEEP = 0.5;
const BEEP_FREQ = 1200;

/** 입력이 무음일 때 치직과 신호음의 기준 음량. */
const FALLBACK_LEVEL = 0.3;

/** 앞뒤 치직, 간격, 신호음 길이(초). 치직이 줄어드는 시간 상수는 0.015초다. */
const PRE = 0.05;
const POST = 0.05;
const GAP = 0.03;
const BEEP_LENGTH = 0.1;
const HISS_DECAY = 0.015;

/** 신호음 양 끝을 키우고 줄이는 시간(초). */
const BEEP_RAMP = 0.005;

/** 구간 앞뒤에 붙는 샘플 수. plan과 run이 같은 식을 쓴다. */
function addedLength(sampleRate: number): number {
  return (
    Math.floor(PRE * sampleRate) +
    Math.floor(POST * sampleRate) +
    Math.floor(GAP * sampleRate) +
    Math.floor(BEEP_LENGTH * sampleRate)
  );
}

/** 무전기. 결과 길이는 구간 길이 + 2 × floor(0.05 × sr) + floor(0.03 × sr) + floor(0.1 × sr)다. */
export const walkie = segmentEffect({
  transform(mid, sampleRate) {
    const n = mid.length;
    const rnd = mulberry32(55);
    // 치직과 신호음 크기는 입력 최대값에 맞춘다. 입력이 무음이면 0.3(FALLBACK_LEVEL)을 쓴다.
    const level = peakOf(mid) || FALLBACK_LEVEL;

    const noisy = new Float32Array(n);
    for (let i = 0; i < n; i++) noisy[i] = mid[i] + (rnd() * 2 - 1) * NOISE;
    const band = biquad(
      biquad(noisy, sampleRate, "highpass", LOW_CUT),
      sampleRate,
      "lowpass",
      HIGH_CUT,
    );
    const voice = fitLevel(softClip(band, 1 + DRIVE * 5), mid);

    const pre = Math.floor(PRE * sampleRate);
    const post = Math.floor(POST * sampleRate);
    const gap = Math.floor(GAP * sampleRate);
    const beepLen = Math.floor(BEEP_LENGTH * sampleRate);
    const out = new Float32Array(n + addedLength(sampleRate));

    for (let i = 0; i < pre; i++) {
      out[i] = (rnd() * 2 - 1) * 0.5 * level * Math.exp(-i / (HISS_DECAY * sampleRate));
    }
    out.set(voice, pre);
    for (let i = 0; i < post; i++) {
      out[pre + n + i] = (rnd() * 2 - 1) * 0.4 * level * Math.exp(-i / (HISS_DECAY * sampleRate));
    }
    const ramp = Math.floor(BEEP_RAMP * sampleRate);
    for (let i = 0; i < beepLen; i++) {
      const edge = ramp <= 0 ? 1 : Math.min(1, (Math.min(i, beepLen - 1 - i) + 1) / ramp);
      out[pre + n + post + gap + i] =
        Math.sin((2 * Math.PI * BEEP_FREQ * i) / sampleRate) * BEEP * level * edge;
    }
    return matchPeak(out, mid);
  },
  midLength: (m, sampleRate) => m + addedLength(sampleRate),
});
