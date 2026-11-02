import { describe, expect, it } from "vitest";
import { applyEffect, planEffect, reverseRange, type EffectName } from "../src/audioEffects";
import { EchoEffect } from "../src/effects/echo";
import { FadeEffect } from "../src/effects/fade";
import { MuteEffect } from "../src/effects/mute";
import { RobotEffect } from "../src/effects/robot";
import { VolumeEffect } from "../src/effects/volume";

describe("planEffect (길이 44100, 44100Hz, 전체 구간)", () => {
  it("faster는 sampleCount 35002, playbackRate 1.2599...다", () => {
    const plan = planEffect(44100, 44100, "faster", 0, 1);
    expect(plan.sampleCount).toBe(35002);
    expect(plan.playbackRate).toBeCloseTo(1.2599210498948732, 12);
  });

  it("slower는 sampleCount 55562다", () => {
    expect(planEffect(44100, 44100, "slower", 0, 1).sampleCount).toBe(55562);
  });

  it("echo는 꼬리 0.75초를 더해 sampleCount 77175다", () => {
    expect(planEffect(44100, 44100, "echo", 0, 1).sampleCount).toBe(77175);
  });

  it("mute는 sampleCount 44100, playbackRate 1이다", () => {
    const plan = planEffect(44100, 44100, "mute", 0, 1);
    expect(plan.sampleCount).toBe(44100);
    expect(plan.playbackRate).toBe(1);
  });

  it("길이를 바꾸지 않는 효과는 전체 구간 trim을 0~1로 유지한다", () => {
    const names: EffectName[] = ["robot", "reverse", "higher", "lower", "fade in", "fade out"];
    for (const name of names) {
      const plan = planEffect(44100, 44100, name, 0, 1);
      expect(plan.sampleCount).toBe(44100);
      expect(plan.adjustedTrimStart).toBe(0);
      expect(plan.adjustedTrimEnd).toBeCloseTo(1, 9);
    }
  });

  it("구간 [0.5, 1]의 faster는 sampleCount 39551이고 trim이 조정된다", () => {
    const plan = planEffect(44100, 44100, "faster", 0.5, 1);
    expect(plan.sampleCount).toBe(39551);
    expect(plan.adjustedTrimStart).toBeCloseTo(0.5575080276, 9);
    expect(plan.adjustedTrimEnd).toBeCloseTo(1, 9);
  });
});

describe("reverseRange", () => {
  it("[1,2,3,4,5,6]의 1/6~5/6 구간을 뒤집고 입력은 바꾸지 않는다", () => {
    const input = Float32Array.from([1, 2, 3, 4, 5, 6]);
    const result = reverseRange(input, 1 / 6, 5 / 6);
    expect(Array.from(result)).toEqual([1, 5, 4, 3, 2, 6]);
    expect(Array.from(input)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("전체 구간을 뒤집는다", () => {
    expect(Array.from(reverseRange(Float32Array.from([1, 2, 3]), 0, 1))).toEqual([3, 2, 1]);
  });
});

describe("applyEffect", () => {
  it("길이 1 버퍼는 거부하지 않고 원본 그대로 돌려준다", async () => {
    const buffer = { length: 1, sampleRate: 44100 } as unknown as AudioBuffer;
    const result = await applyEffect(buffer, "faster", 0.2, 0.8);
    expect(result.buffer).toBe(buffer);
    expect(result.trimStart).toBe(0.2);
    expect(result.trimEnd).toBe(0.8);
  });
});

/** AudioParam 호출을 기록하는 가짜 */
function fakeParam() {
  const calls: Array<[string, ...number[]]> = [];
  return {
    calls,
    value: 0,
    setValueAtTime(v: number, t: number) {
      calls.push(["set", v, t]);
    },
    linearRampToValueAtTime(v: number, t: number) {
      calls.push(["linear", v, t]);
    },
    exponentialRampToValueAtTime(v: number, t: number) {
      calls.push(["exp", v, t]);
    },
  };
}

/** 효과 그래프 구성에 쓰는 노드만 흉내 낸 가짜 컨텍스트 */
function fakeContext() {
  const gains: Array<ReturnType<typeof fakeParam>> = [];
  const ctx = {
    createGain() {
      const gain = fakeParam();
      gains.push(gain);
      return { gain, connect() {} };
    },
    createDelay: () => ({ delayTime: fakeParam(), connect() {} }),
    createDynamicsCompressor: () => ({
      threshold: fakeParam(),
      knee: fakeParam(),
      ratio: fakeParam(),
      attack: fakeParam(),
      release: fakeParam(),
      connect() {},
    }),
    createWaveShaper: () => ({ curve: null as Float32Array | null, connect() {} }),
    createOscillator: () => ({ frequency: fakeParam(), start() {}, connect() {} }),
    createBiquadFilter: () => ({
      type: "",
      frequency: fakeParam(),
      gain: fakeParam(),
      connect() {},
    }),
  };
  return { ctx: ctx as unknown as OfflineAudioContext, gains };
}

describe("효과 노드 그래프", () => {
  it("VolumeEffect는 시작 전 0.01초부터 목표 볼륨까지 지수 ramp하고 끝에서 1로 되돌린다", () => {
    const { ctx, gains } = fakeContext();
    new VolumeEffect(ctx, 1.25, 1, 2);
    // 입력, 출력 gain 다음에 효과 gain이 세 번째다
    expect(gains[2]?.calls).toEqual([
      ["set", 1, 0.99],
      ["exp", 1.25, 1],
      ["set", 1.25, 2],
      ["exp", 1, 2.01],
    ]);
  });

  it("VolumeEffect의 시작 시각이 0.01초 미만이면 ramp 시작을 0으로 제한한다", () => {
    const { ctx, gains } = fakeContext();
    new VolumeEffect(ctx, 0.75, 0.005, 1);
    expect(gains[2]?.calls[0]).toEqual(["set", 1, 0]);
  });

  it("FadeEffect(fade in)는 시작에서 0, 끝에서 1로 linear ramp한다", () => {
    const { ctx, gains } = fakeContext();
    new FadeEffect(ctx, true, 1, 2);
    expect(gains[2]?.calls).toEqual([
      ["set", 1, 0],
      ["set", 0, 1],
      ["linear", 1, 2],
      ["set", 1, 2],
    ]);
  });

  it("FadeEffect(fade out)는 시작에서 1, 끝에서 0으로 linear ramp한다", () => {
    const { ctx, gains } = fakeContext();
    new FadeEffect(ctx, false, 1, 2);
    expect(gains[2]?.calls).toEqual([
      ["set", 1, 0],
      ["set", 1, 1],
      ["linear", 0, 2],
      ["set", 1, 2],
    ]);
  });

  it("MuteEffect는 구간 앞뒤 0.001초에 gain을 ramp한다", () => {
    const { ctx, gains } = fakeContext();
    new MuteEffect(ctx, 1, 2);
    expect(gains[2]?.calls).toEqual([
      ["set", 1, 0.999],
      ["linear", 0, 1],
      ["set", 0, 2],
      ["linear", 1, 2.001],
    ]);
  });

  it("EchoEffect와 RobotEffect는 input과 output을 노출한다", () => {
    const { ctx } = fakeContext();
    for (const effect of [new EchoEffect(ctx, 0, 1), new RobotEffect(ctx, 0, 1)]) {
      expect(effect.input).toBeDefined();
      expect(effect.output).toBeDefined();
      expect(effect.input).not.toBe(effect.output);
    }
    expect(EchoEffect.TAIL_SECONDS).toBe(0.75);
    expect(EchoEffect.DELAY_TIME).toBe(0.25);
  });
});
