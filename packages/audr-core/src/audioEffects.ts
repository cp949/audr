// 효과는 `effects/`의 정의(EffectDef)를 이름으로 찾아 실행한다.
// 구간 규칙과 길이 계산은 effects/segment.ts, 설계 배경은 docs/design/04-effect-engine.md에 있다.
import { echo } from "./effects/echoTrail";
import { fadeIn, fadeOut } from "./effects/fadeCurve";
import { louder, mute, softer } from "./effects/gain";
import { reverse } from "./effects/reverse";
import { robotLegacy } from "./effects/robot";
import type { EffectDef } from "./effects/segment";
import { faster, slower } from "./effects/speed";

export { reverseRange } from "./effects/reverse";

/** 효과 이름. 화면의 Louder는 "higher", Softer는 "lower"다. */
export type EffectName =
  | "robot"
  | "reverse"
  | "higher"
  | "lower"
  | "faster"
  | "slower"
  | "echo"
  | "fade in"
  | "fade out"
  | "mute";

export type EffectPlan = {
  sampleCount: number;
  playbackRate: number;
  adjustedTrimStart: number;
  adjustedTrimEnd: number;
};

const EFFECTS: Record<EffectName, EffectDef> = {
  robot: robotLegacy,
  reverse,
  higher: louder,
  lower: softer,
  faster,
  slower,
  echo,
  "fade in": fadeIn,
  "fade out": fadeOut,
  mute,
};

/** 0~1 비율 구간을 샘플 인덱스 [시작, 끝)로 바꾼다. 시작과 끝이 뒤집혀 들어와도 순서를 바로잡는다. */
function sampleBounds(length: number, trimStart: number, trimEnd: number): [number, number] {
  return [
    Math.floor(Math.min(trimStart, trimEnd) * length),
    Math.floor(Math.max(trimStart, trimEnd) * length),
  ];
}

/** 결과 길이로 나눈 구간 비율. 빈 소리는 0으로 둔다. */
function toTrim(position: number, length: number): number {
  return length > 0 ? position / length : 0;
}

/**
 * 효과 적용 후 샘플 수, 재생 비율, 조정된 trim(0~1)을 계산한다.
 * 길이가 바뀌는 효과가 있어서, 렌더링하기 전에도 결과 구간을 알 수 있어야 한다.
 */
export function planEffect(
  length: number,
  sampleRate: number,
  name: EffectName,
  trimStart: number,
  trimEnd: number,
): EffectPlan {
  const def = EFFECTS[name];
  const [start, end] = sampleBounds(length, trimStart, trimEnd);
  const plan = def.plan(length, sampleRate, start, end);
  return {
    sampleCount: plan.length,
    playbackRate: def.rate ?? 1,
    adjustedTrimStart: toTrim(plan.start, plan.length),
    adjustedTrimEnd: toTrim(plan.end, plan.length),
  };
}

/**
 * 샘플 배열에 효과를 적용한 새 배열과 조정된 trim(0~1)을 돌려준다. 입력 배열은 바꾸지 않는다.
 * AudioBuffer를 만들지 않아 `applyEffect`보다 가볍고, 그래프를 쓰지 않는 효과는 node에서 시험할 수 있다.
 */
export async function runEffect(
  name: EffectName,
  samples: Float32Array,
  sampleRate: number,
  trimStart: number,
  trimEnd: number,
): Promise<{ samples: Float32Array; trimStart: number; trimEnd: number }> {
  const [start, end] = sampleBounds(samples.length, trimStart, trimEnd);
  const result = await EFFECTS[name].run(samples, sampleRate, start, end);
  const length = result.samples.length;
  return {
    samples: result.samples,
    trimStart: toTrim(result.start, length),
    trimEnd: toTrim(result.end, length),
  };
}

/**
 * 효과를 적용한 새 버퍼와 조정된 trim(0~1)을 돌려준다. 입력 버퍼는 바꾸지 않는다.
 * 길이 2 미만이면 효과를 걸 수 없어 입력을 그대로 돌려준다. 호출자는 `result.buffer === buffer`로 알아본다.
 */
export async function applyEffect(
  buffer: AudioBuffer,
  name: EffectName,
  trimStart: number,
  trimEnd: number,
): Promise<{ buffer: AudioBuffer; trimStart: number; trimEnd: number }> {
  if (buffer.length < 2) {
    return { buffer, trimStart, trimEnd };
  }
  const result = await runEffect(
    name,
    buffer.getChannelData(0),
    buffer.sampleRate,
    trimStart,
    trimEnd,
  );
  const rendered = new AudioBuffer({
    length: result.samples.length,
    sampleRate: buffer.sampleRate,
    numberOfChannels: 1,
  });
  rendered.getChannelData(0).set(result.samples);
  return { buffer: rendered, trimStart: result.trimStart, trimEnd: result.trimEnd };
}
