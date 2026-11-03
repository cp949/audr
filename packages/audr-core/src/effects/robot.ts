// 로봇. 낮고 묵직한 기계 목소리다.
// 음높이를 낮게 고정하고 금속 울림, 짧은 되돌림, 좁은 대역을 차례로 건다.
// 공통 처리(대역 나누기, 쉬익 소리 되돌리기, 음량 맞춤)는 robotVoice.ts의 `voiceEffect`가 맡는다.
import { biquad } from "./biquad";
import { metalComb, metalDelay, robotize, voiceEffect } from "./robotVoice";
import type { EffectDef } from "./segment";

/** 고정할 음높이(Hz). */
const PITCH = 90;

/** 금속 울림의 되먹임 배율. */
const METAL = 0.3;

/** 짧은 되돌림의 배율. 두 번째 되돌림은 이 값의 0.4배다. */
const ECHO = 0.3;

/** 되돌림 지연(초). */
const ECHO_DELAYS = [0.04, 0.08] as const;

/** 좁은 대역의 highpass·lowpass 경계(Hz). */
const BAND_LOW = 250;
const BAND_HIGH = 5000;

/**
 * 로봇. 결과 길이는 구간 길이 + floor(0.2 × sampleRate)다.
 * 좁은 대역은 기계 목소리에만 건다. 쉬익 소리는 그 뒤에 더한다. 먼저 더하면 5kHz 위가 다시 사라진다.
 */
export const robot: EffectDef = voiceEffect((low, sampleRate, tail) => {
  const y = metalComb(robotize(low, sampleRate, PITCH, tail), metalDelay(sampleRate, PITCH), METAL);
  const d1 = Math.floor(ECHO_DELAYS[0] * sampleRate);
  const d2 = Math.floor(ECHO_DELAYS[1] * sampleRate);
  const e = new Float32Array(y.length);
  for (let i = 0; i < y.length; i++) {
    e[i] = y[i] + (i >= d1 ? ECHO * y[i - d1] : 0) + (i >= d2 ? ECHO * 0.4 * y[i - d2] : 0);
  }
  return biquad(biquad(e, sampleRate, "highpass", BAND_LOW), sampleRate, "lowpass", BAND_HIGH);
});
