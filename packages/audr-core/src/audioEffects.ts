// 효과 계획은 planEffect, reverse 데이터 처리는 reverseRange,
// OfflineAudioContext 렌더링은 applyEffect가 맡는다.
import { EchoEffect } from "./effects/echo";
import { FadeEffect } from "./effects/fade";
import { MuteEffect } from "./effects/mute";
import { RobotEffect } from "./effects/robot";
import { VolumeEffect } from "./effects/volume";

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

/** faster/slower의 음높이 비율 (장3도) */
const PITCH_RATIO = Math.pow(2, 4 / 12);

/** planEffect 결과에 효과 노드가 쓰는 초 단위 구간을 더한 내부 계산 결과 */
type DetailedPlan = EffectPlan & { startSeconds: number; endSeconds: number };

function computePlan(
  length: number,
  sampleRate: number,
  name: EffectName,
  trimStart: number,
  trimEnd: number,
): DetailedPlan {
  const trimStartSeconds = (trimStart * length) / sampleRate;
  const trimEndSeconds = (trimEnd * length) / sampleRate;

  let sampleCount = length;
  const affectedSampleCount = Math.floor((trimEndSeconds - trimStartSeconds) * sampleRate);
  let adjustedAffectedSampleCount = affectedSampleCount;
  const unaffectedSampleCount = sampleCount - affectedSampleCount;

  let playbackRate = 1;
  switch (name) {
    case "echo":
      sampleCount = Math.max(
        sampleCount,
        Math.floor((trimEndSeconds + EchoEffect.TAIL_SECONDS) * sampleRate),
      );
      break;
    case "faster":
      playbackRate = PITCH_RATIO;
      adjustedAffectedSampleCount = Math.floor(affectedSampleCount / playbackRate);
      sampleCount = unaffectedSampleCount + adjustedAffectedSampleCount;
      break;
    case "slower":
      playbackRate = 1 / PITCH_RATIO;
      adjustedAffectedSampleCount = Math.floor(affectedSampleCount / playbackRate);
      sampleCount = unaffectedSampleCount + adjustedAffectedSampleCount;
      break;
  }

  const durationSeconds = sampleCount / sampleRate;
  const adjustedTrimEndSeconds = trimStartSeconds + adjustedAffectedSampleCount / sampleRate;
  return {
    sampleCount,
    playbackRate,
    adjustedTrimStart: trimStartSeconds / durationSeconds,
    adjustedTrimEnd: adjustedTrimEndSeconds / durationSeconds,
    startSeconds: trimStartSeconds,
    endSeconds: adjustedTrimEndSeconds,
  };
}

/**
 * 효과 적용 후 샘플 수, 재생 속도, 조정된 trim(0~1)을 계산한다.
 * 일부 효과는 재생 속도나 샘플 수를 바꾸므로 OfflineAudioContext를 만들기 전에 미리 계산해야 한다.
 */
export function planEffect(
  length: number,
  sampleRate: number,
  name: EffectName,
  trimStart: number,
  trimEnd: number,
): EffectPlan {
  const { sampleCount, playbackRate, adjustedTrimStart, adjustedTrimEnd } = computePlan(
    length,
    sampleRate,
    name,
    trimStart,
    trimEnd,
  );
  return { sampleCount, playbackRate, adjustedTrimStart, adjustedTrimEnd };
}

/** 선택 구간(0~1 비율)의 샘플 순서를 뒤집은 새 배열을 돌려준다. 입력은 바꾸지 않는다. */
export function reverseRange(samples: Float32Array, start: number, end: number): Float32Array {
  const result = new Float32Array(samples.length);
  const startSamples = Math.floor(start * samples.length);
  const endSamples = Math.floor(end * samples.length);
  let counter = 0;
  for (let i = 0; i < samples.length; i++) {
    if (i >= startSamples && i < endSamples) {
      result[i] = samples[endSamples - counter - 1] as number;
      counter++;
    } else {
      result[i] = samples[i] as number;
    }
  }
  return result;
}

type OfflineContextConstructor = new (
  channels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContext;

function createOfflineContext(sampleCount: number, sampleRate: number): OfflineAudioContext {
  const g = globalThis as unknown as {
    OfflineAudioContext?: OfflineContextConstructor;
    webkitOfflineAudioContext?: OfflineContextConstructor;
  };
  if (g.OfflineAudioContext) {
    return new g.OfflineAudioContext(1, sampleCount, sampleRate);
  }
  if (g.webkitOfflineAudioContext) {
    // Need to use webkitOfflineAudioContext, which doesn't support all sample rates.
    // Resample by adjusting sample count to make room and set offline context to desired sample rate.
    const sampleScale = 44100 / sampleRate;
    return new g.webkitOfflineAudioContext(1, sampleScale * sampleCount, 44100);
  }
  throw new Error("OfflineAudioContext를 쓸 수 없다");
}

/**
 * 효과를 적용한 새 버퍼와 조정된 trim(0~1)을 돌려준다. 입력 버퍼는 바꾸지 않는다.
 * OfflineAudioContext가 최소 2샘플을 요구하므로 길이 2 미만이면 입력을 그대로 돌려준다.
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

  const plan = computePlan(buffer.length, buffer.sampleRate, name, trimStart, trimEnd);
  const audioContext = createOfflineContext(plan.sampleCount, buffer.sampleRate);
  const adjustedTrimStartSeconds = plan.startSeconds;
  const adjustedTrimEndSeconds = plan.endSeconds;

  // For the reverse effect we need to manually reverse the data into a new audio buffer
  // to prevent overwriting the original, so that the undo stack works correctly.
  let sourceBuffer = buffer;
  if (name === "reverse") {
    const reversed = audioContext.createBuffer(1, buffer.length, buffer.sampleRate);
    reversed.getChannelData(0).set(reverseRange(buffer.getChannelData(0), trimStart, trimEnd));
    sourceBuffer = reversed;
  }

  const source = audioContext.createBufferSource();
  source.buffer = sourceBuffer;

  // Some effects need to use more nodes and must expose an input and output
  let node: { input: AudioNode; output: AudioNode } | undefined;
  switch (name) {
    case "faster":
    case "slower":
      source.playbackRate.setValueAtTime(plan.playbackRate, adjustedTrimStartSeconds);
      source.playbackRate.setValueAtTime(1.0, adjustedTrimEndSeconds);
      break;
    case "higher":
      node = new VolumeEffect(audioContext, 1.25, adjustedTrimStartSeconds, adjustedTrimEndSeconds);
      break;
    case "lower":
      node = new VolumeEffect(audioContext, 0.75, adjustedTrimStartSeconds, adjustedTrimEndSeconds);
      break;
    case "echo":
      node = new EchoEffect(audioContext, adjustedTrimStartSeconds, adjustedTrimEndSeconds);
      break;
    case "robot":
      node = new RobotEffect(audioContext, adjustedTrimStartSeconds, adjustedTrimEndSeconds);
      break;
    case "fade in":
      node = new FadeEffect(audioContext, true, adjustedTrimStartSeconds, adjustedTrimEndSeconds);
      break;
    case "fade out":
      node = new FadeEffect(audioContext, false, adjustedTrimStartSeconds, adjustedTrimEndSeconds);
      break;
    case "mute":
      node = new MuteEffect(audioContext, adjustedTrimStartSeconds, adjustedTrimEndSeconds);
      break;
  }

  if (node) {
    source.connect(node.input);
    node.output.connect(audioContext.destination);
  } else {
    // No effects nodes are needed, wire directly to the output
    source.connect(audioContext.destination);
  }

  source.start();

  const renderedBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
    // webkit 접두사 구현은 Promise를 돌려주지 않으므로 oncomplete를 먼저 건다
    audioContext.oncomplete = (e) => resolve(e.renderedBuffer);
    const rendering = audioContext.startRendering() as Promise<AudioBuffer> | undefined;
    rendering?.catch(reject);
  });
  return {
    buffer: renderedBuffer,
    trimStart: plan.adjustedTrimStart,
    trimEnd: plan.adjustedTrimEnd,
  };
}
