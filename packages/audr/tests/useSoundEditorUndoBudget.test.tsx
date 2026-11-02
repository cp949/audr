import { act, renderHook } from "@testing-library/react";
import { applyEffect, type HistoryBudget } from "@cp949/audr-core";
import { expect, it, vi } from "vitest";
import { useSoundEditor } from "../src/hooks/useSoundEditor";
import { fakeAudioBuffer, ramp } from "./helpers/fakePlayer";

vi.mock("@cp949/audr-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cp949/audr-core")>();
  const { FakeAudioBufferPlayer } = await import("./helpers/fakePlayer");
  // 실제 상한 크기의 samples는 테스트에서 만들기 어려워 상한만 8000바이트로 줄인다.
  // sizeOf는 훅이 넘긴 것을 그대로 쓰므로 훅의 크기 계산도 함께 검증된다
  class SmallBudgetHistory<T> extends actual.History<T> {
    constructor(max?: number, budget?: HistoryBudget<T>) {
      super(max, budget && { ...budget, maxBytes: 8000 });
    }
  }
  return {
    ...actual,
    AudioBufferPlayer: FakeAudioBufferPlayer,
    applyEffect: vi.fn(),
    History: SmallBudgetHistory,
  };
});

it("undo 이력은 크기 합계가 상한을 넘으면 가장 오래된 단계부터 버린다", async () => {
  // 1000샘플 Float32Array는 4000바이트다. 상한 8000바이트면 2단계만 남는다
  vi.mocked(applyEffect).mockImplementation(async () => ({
    buffer: fakeAudioBuffer(ramp(1000), 44100),
    trimStart: 0,
    trimEnd: 1,
  }));
  const { result } = renderHook(() =>
    useSoundEditor({
      samples: ramp(1000),
      sampleRate: 44100,
      name: "소리",
      onChange: vi.fn(),
      onCopyToNew: vi.fn(),
      onRename: vi.fn(),
    }),
  );
  for (let i = 0; i < 3; i++) {
    await act(async () => result.current.onEffect("higher"));
  }
  let undoCount = 0;
  while (result.current.canUndo && undoCount < 10) {
    await act(async () => result.current.onUndo());
    undoCount++;
  }
  expect(undoCount).toBe(2);
});
