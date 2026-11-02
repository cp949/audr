import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioBufferPlayer } from "../src/audioBufferPlayer";

/** 재생에 쓰는 노드만 제공하는 가짜 AudioContext. currentTime은 테스트가 직접 움직인다. */
function fakeContext() {
  const source = {
    onended: null as null | (() => void),
    buffer: null as unknown,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const buffer = (length: number, sampleRate: number) => {
    const data = new Float32Array(length);
    return {
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => data,
    };
  };
  const ctx = {
    currentTime: 0,
    destination: {},
    createBuffer: vi.fn((_c: number, length: number, rate: number) => buffer(length, rate)),
    createBufferSource: vi.fn(() => source),
  };
  return { ctx: ctx as unknown as AudioContext & { currentTime: number }, source };
}

let frames: Array<() => void> = [];
const flushFrame = () => {
  const queued = frames;
  frames = [];
  queued.forEach((f) => f());
};

beforeEach(() => {
  frames = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(0);
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => frames.push(cb));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AudioBufferPlayer", () => {
  it("생성하면 샘플을 모노 AudioBuffer에 복사한다", () => {
    const { ctx } = fakeContext();
    const player = new AudioBufferPlayer(Float32Array.from([0.1, 0.2, 0.3]), 8000, ctx);
    expect(player.buffer.length).toBe(3);
    expect(Array.from(player.buffer.getChannelData(0))).toEqual([
      Float32Array.from([0.1])[0],
      Float32Array.from([0.2])[0],
      Float32Array.from([0.3])[0],
    ]);
  });

  it("play는 trim 구간의 시작 시각과 길이로 source를 시작한다", () => {
    const { ctx, source } = fakeContext();
    const player = new AudioBufferPlayer(new Float32Array(8000), 8000, ctx); // 1초
    player.play(0.25, 0.75, vi.fn(), vi.fn());
    expect(source.start).toHaveBeenCalledWith(0, 0.25, 0.5);
    expect(source.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it("재생 중에는 프레임마다 재생 위치(0~1)를 onUpdate로 알린다", () => {
    const { ctx } = fakeContext();
    const player = new AudioBufferPlayer(new Float32Array(8000), 8000, ctx);
    const onUpdate = vi.fn();
    player.play(0.25, 0.75, onUpdate, vi.fn());
    expect(onUpdate).toHaveBeenLastCalledWith(0.25);
    ctx.currentTime = 0.2; // 컨텍스트 시간으로 0.2초 후
    flushFrame();
    expect(onUpdate).toHaveBeenLastCalledWith(expect.closeTo(0.45, 9));
  });

  it("재생을 시작한 시각이 0이 아니어도 시작 후 경과 시간으로 위치를 계산한다", () => {
    const { ctx } = fakeContext();
    ctx.currentTime = 5;
    const player = new AudioBufferPlayer(new Float32Array(8000), 8000, ctx);
    const onUpdate = vi.fn();
    player.play(0.25, 0.75, onUpdate, vi.fn());
    expect(onUpdate).toHaveBeenLastCalledWith(0.25);
    ctx.currentTime = 5.2;
    flushFrame();
    expect(onUpdate).toHaveBeenLastCalledWith(expect.closeTo(0.45, 9));
  });

  it("컨텍스트 시간이 멈춰 있으면(suspended) 벽시계가 흘러도 재생 위치는 그대로다", () => {
    const { ctx } = fakeContext();
    const player = new AudioBufferPlayer(new Float32Array(8000), 8000, ctx);
    const onUpdate = vi.fn();
    player.play(0.25, 0.75, onUpdate, vi.fn());
    vi.setSystemTime(10_000); // 벽시계는 10초 흘렀지만 컨텍스트 시간은 0
    flushFrame();
    expect(onUpdate).toHaveBeenLastCalledWith(0.25);
    expect(frames.length).toBe(1); // 끝난 것으로 보지 않고 다음 프레임을 계속 요청한다
  });

  it("source가 끝나면 onEnded가 호출된다", () => {
    const { ctx, source } = fakeContext();
    const player = new AudioBufferPlayer(new Float32Array(8000), 8000, ctx);
    const onEnded = vi.fn();
    player.play(0, 1, vi.fn(), onEnded);
    source.onended?.();
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("stop은 onEnded를 호출하지 않고 이후 onUpdate도 멈춘다", () => {
    const { ctx, source } = fakeContext();
    const player = new AudioBufferPlayer(new Float32Array(8000), 8000, ctx);
    const onUpdate = vi.fn();
    const onEnded = vi.fn();
    player.play(0, 1, onUpdate, onEnded);
    const callsBefore = onUpdate.mock.calls.length;
    player.stop();
    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.onended).toBeNull();
    ctx.currentTime = 0.1;
    flushFrame();
    expect(onUpdate.mock.calls.length).toBe(callsBefore);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("stop을 두 번 호출해도 예외가 없다 (Safari는 두 번째 stop에서 던진다)", () => {
    const { ctx, source } = fakeContext();
    const player = new AudioBufferPlayer(new Float32Array(8000), 8000, ctx);
    player.play(0, 1, vi.fn(), vi.fn());
    source.stop
      .mockImplementationOnce(() => undefined)
      .mockImplementation(() => {
        throw new Error("InvalidStateError");
      });
    expect(() => {
      player.stop();
      player.stop();
    }).not.toThrow();
  });

  it("재생 전 stop도 예외가 없다", () => {
    const { ctx } = fakeContext();
    expect(() => new AudioBufferPlayer(new Float32Array(2), 8000, ctx).stop()).not.toThrow();
  });
});
