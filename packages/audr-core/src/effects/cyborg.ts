// 기계 인간. 높낮이 없이 일정한 음으로 윙윙거리는 기계 목소리다.
// 음높이를 고정하고 소리를 거칠게 깎은 뒤 금속 울림을 더한다.
// 공통 처리(대역 나누기, 쉬익 소리 되돌리기, 음량 맞춤)는 robotVoice.ts의 `voiceEffect`가 맡는다.
import { crush, metalComb, metalDelay, robotize, voiceEffect } from "./robotVoice";
import type { EffectDef } from "./segment";

/** 고정할 음높이(Hz). */
const PITCH = 140;

/** 금속 울림의 되먹임 배율. */
const METAL = 0.45;

/** 깎는 단계 수. 작을수록 거칠다. */
const LEVELS = 64;

/**
 * 기계 인간. 결과 길이는 구간 길이 + floor(0.2 × sampleRate)다.
 * 깎기는 울림보다 먼저 한다. 뒤에 하면 작은 울림 꼬리가 0으로 깎여 끝이 잘린다.
 */
export const cyborg: EffectDef = voiceEffect((low, sampleRate, tail) =>
  metalComb(
    crush(robotize(low, sampleRate, PITCH, tail), LEVELS),
    metalDelay(sampleRate, PITCH),
    METAL,
  ),
);
