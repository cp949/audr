import { describe, expect, it } from "vitest";
import { applyEffect, planEffect, runEffect, type EffectName } from "../src/audioEffects";

const RATE = 44100;

describe("planEffect (길이 44100, 44100Hz, 전체 구간)", () => {
  it("빠르게는 sampleCount 33923, playbackRate 1.3, trim 0~1이다", () => {
    const plan = planEffect(RATE, RATE, "faster", 0, 1);
    expect(plan.sampleCount).toBe(33923);
    expect(plan.playbackRate).toBe(1.3);
    expect(plan.adjustedTrimStart).toBe(0);
    expect(plan.adjustedTrimEnd).toBeCloseTo(1, 9);
  });

  it("느리게는 sampleCount 58800, playbackRate 0.75다", () => {
    const plan = planEffect(RATE, RATE, "slower", 0, 1);
    expect(plan.sampleCount).toBe(58800);
    expect(plan.playbackRate).toBe(0.75);
  });

  it("메아리는 꼬리를 더해 sampleCount 97020이다", () => {
    // 44100 + 4 × floor(0.3 × 44100)
    expect(planEffect(RATE, RATE, "echo", 0, 1).sampleCount).toBe(97020);
  });

  it("길이를 바꾸지 않는 효과는 sampleCount 44100, playbackRate 1, 전체 구간 trim 0~1을 유지한다", () => {
    const names: EffectName[] = [
      "robot",
      "reverse",
      "higher",
      "lower",
      "fade in",
      "fade out",
      "mute",
    ];
    for (const name of names) {
      const plan = planEffect(RATE, RATE, name, 0, 1);
      expect(plan.sampleCount).toBe(RATE);
      expect(plan.playbackRate).toBe(1);
      expect(plan.adjustedTrimStart).toBe(0);
      expect(plan.adjustedTrimEnd).toBeCloseTo(1, 9);
    }
  });

  it("구간 [0.5, 1]의 빠르게는 sampleCount 39011이고 adjustedTrimStart가 22050/39011이다", () => {
    const plan = planEffect(RATE, RATE, "faster", 0.5, 1);
    expect(plan.sampleCount).toBe(39011);
    expect(plan.adjustedTrimStart).toBeCloseTo(22050 / 39011, 12);
    expect(plan.adjustedTrimEnd).toBeCloseTo(1, 12);
  });
});

describe("runEffect (그래프를 쓰지 않는 효과)", () => {
  const names: EffectName[] = [
    "reverse",
    "higher",
    "lower",
    "faster",
    "slower",
    "echo",
    "fade in",
    "fade out",
    "mute",
  ];

  function tone(rate: number): Float32Array {
    return Float32Array.from(
      { length: rate },
      (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate),
    );
  }

  it("모든 효과의 결과 길이와 trim이 planEffect와 같다", async () => {
    for (const rate of [8000, 44100, 48000]) {
      for (const name of names) {
        const plan = planEffect(rate, rate, name, 0.25, 0.75);
        const result = await runEffect(name, tone(rate), rate, 0.25, 0.75);
        expect(result.samples.length, `${name} ${rate}Hz 길이`).toBe(plan.sampleCount);
        expect(result.trimStart, `${name} ${rate}Hz 시작`).toBeCloseTo(plan.adjustedTrimStart, 12);
        expect(result.trimEnd, `${name} ${rate}Hz 끝`).toBeCloseTo(plan.adjustedTrimEnd, 12);
      }
    }
  });

  it("입력 배열을 바꾸지 않는다", async () => {
    for (const name of ["higher", "reverse", "echo"] as const) {
      const input = tone(RATE);
      const copy = input.slice();
      await runEffect(name, input, RATE, 0, 1);
      expect(input, name).toEqual(copy);
    }
  });

  it("구간이 뒤집혀 들어와도(trimStart > trimEnd) 같은 결과다", async () => {
    const input = tone(RATE);
    const forward = await runEffect("higher", input, RATE, 0.25, 0.75);
    const backward = await runEffect("higher", input, RATE, 0.75, 0.25);
    expect(backward).toEqual(forward);
  });

  it("길이 0 선택은 소리를 바꾸지 않고 trim도 그대로 둔다", async () => {
    const input = tone(RATE);
    const result = await runEffect("faster", input, RATE, 0.5, 0.5);
    expect(result.samples).toEqual(input);
    expect(result.trimStart).toBeCloseTo(0.5, 12);
    expect(result.trimEnd).toBeCloseTo(0.5, 12);
  });
});

describe("applyEffect", () => {
  it("길이 1 버퍼는 거부하지 않고 원본 그대로 돌려준다", async () => {
    const buffer = { length: 1, sampleRate: RATE } as unknown as AudioBuffer;
    const result = await applyEffect(buffer, "faster", 0.2, 0.8);
    expect(result.buffer).toBe(buffer);
    expect(result.trimStart).toBe(0.2);
    expect(result.trimEnd).toBe(0.8);
  });
});
