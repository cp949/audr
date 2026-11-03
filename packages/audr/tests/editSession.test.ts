// EditSession의 interface 제약을 검증한다.
// React, DOM, 모듈 대체 없이 생성자에 주입한 가짜 재생기와 효과로 돌린다.
// 규칙과 이유는 docs/design/01-sound-editor-edit-flow.md를 따른다.
import { downsampleIfNeeded, resample } from "@cp949/audr-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUSY_DELAY_MS,
  EditSession,
  type EditSessionDeps,
  type EditSessionProps,
} from "../src/lib/editSession";
import { fakeAudioBuffer, FakeAudioBufferPlayer, ramp } from "./helpers/fakePlayer";

beforeEach(() => {
  FakeAudioBufferPlayer.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 비동기 편집이 끝나도록 마이크로태스크와 매크로태스크를 한 번 비운다. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * 효과 렌더링을 release나 fail을 부를 때까지 붙잡아 둔다.
 * 결과는 첫 샘플에 1을 더한 사본이다.
 */
function heldEffect() {
  let release!: () => void;
  let fail!: (e: Error) => void;
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  const applyEffect = vi.fn(
    async (buffer: AudioBuffer, _name: string, trimStart: number, trimEnd: number) => {
      await gate;
      const out = Float32Array.from(buffer.getChannelData(0));
      out[0] = (out[0] as number) + 1;
      return { buffer: fakeAudioBuffer(out, buffer.sampleRate), trimStart, trimEnd };
    },
  ) as unknown as EditSessionDeps["applyEffect"];
  return { applyEffect, release, fail };
}

function createDeps(applyEffect: EditSessionDeps["applyEffect"]): EditSessionDeps {
  return { AudioBufferPlayer: FakeAudioBufferPlayer, applyEffect, resample, downsampleIfNeeded };
}

function createProps(overrides: Partial<EditSessionProps> = {}) {
  const onChange = vi.fn();
  const onCopyToNew = vi.fn();
  const onError = vi.fn();
  const props: EditSessionProps = {
    samples: ramp(100),
    sampleRate: 44100,
    onChange,
    onCopyToNew,
    onError,
    ...overrides,
  };
  return { props, onChange, onCopyToNew, onError };
}

/** 훅이 첫 커밋에서 하는 순서대로 입력 반영 1단계, 붙임, 입력 반영 2단계를 호출한다. */
function mount(session: EditSession, props: EditSessionProps, onBusyStart?: () => void) {
  session.syncProps(props);
  session.attach(onBusyStart);
  session.applyInput(props.samples, props.sampleRate);
}

const lastCall = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1]?.[0] as { samples: Float32Array; sampleRate: number };

describe("EditSession 스냅샷 참조", () => {
  it("값이 바뀌지 않는 호출은 같은 스냅샷을 유지하고 구독자를 부르지 않는다", () => {
    const { props } = createProps();
    const session = new EditSession(props, createDeps(heldEffect().applyEffect));
    mount(session, props);
    const listener = vi.fn();
    session.subscribe(listener);
    const before = session.getSnapshot();

    session.updateTrim(null, null);
    session.stop();

    expect(session.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("재생 위치만 바뀌면 새 스냅샷이지만 바뀌지 않은 필드는 같은 참조다", () => {
    const { props } = createProps();
    const session = new EditSession(props, createDeps(heldEffect().applyEffect));
    mount(session, props);
    session.updateTrim(0.25, 0.75);
    const before = session.getSnapshot();

    session.play();
    FakeAudioBufferPlayer.last.onUpdate?.(0.4);
    const during = session.getSnapshot();

    expect(during).not.toBe(before);
    expect(during.playhead).toBe(0.4);
    // Waveform이 memo라서 chunkLevels 참조가 바뀌면 재생 중 프레임마다 파형을 다시 그린다
    expect(during.chunkLevels).toBe(before.chunkLevels);
    expect(during.trim).toBe(before.trim);
    expect(during.editError).toBe(before.editError);
  });
});

describe("EditSession 붙임과 뗌", () => {
  it("붙임과 뗌을 반복해도 이력과 복사본이 유지된다", async () => {
    const { props, onChange } = createProps();
    const session = new EditSession(props, createDeps(heldEffect().applyEffect));
    mount(session, props);
    session.updateTrim(0.5, 1);
    session.deleteSelection();
    await flush();
    session.updateTrim(0, 0.2);
    session.copy();
    await flush();
    expect(session.getSnapshot()).toMatchObject({ canUndo: true, canPaste: true });

    for (let i = 0; i < 2; i++) {
      session.detach();
      session.attach();
    }

    expect(session.getSnapshot()).toMatchObject({ canUndo: true, canPaste: true });
    session.undo();
    await flush();
    expect(lastCall(onChange).samples.length).toBe(100);
    // 복사본은 삭제 뒤 50샘플의 앞 20%(10샘플)이고, undo가 복원한 선택(0.5~1)을 이것으로 교체한다
    session.paste();
    await flush();
    expect(lastCall(onChange).samples.length).toBe(50 + 10);
  });

  it("뗀 동안 도착한 편집 결과는 버린다", async () => {
    const { props, onChange } = createProps();
    const effect = heldEffect();
    const session = new EditSession(props, createDeps(effect.applyEffect));
    mount(session, props);
    session.effect("faster");
    await flush();

    session.detach();
    effect.release();
    await flush();

    expect(onChange).not.toHaveBeenCalled();
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it("뗀 동안 도착한 오류는 알리지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { props, onError } = createProps();
    const effect = heldEffect();
    const session = new EditSession(props, createDeps(effect.applyEffect));
    mount(session, props);
    session.effect("faster");
    await flush();

    session.detach();
    effect.fail(new Error("render failed"));
    await flush();

    expect(onError).not.toHaveBeenCalled();
    expect(session.getSnapshot().editError).toBeNull();
  });

  it("다시 붙은 뒤 도착한 결과는 세대가 같으면 반영한다", async () => {
    const { props, onChange } = createProps();
    const effect = heldEffect();
    const session = new EditSession(props, createDeps(effect.applyEffect));
    mount(session, props);
    session.effect("faster");
    await flush();

    session.detach();
    session.attach();
    effect.release();
    await flush();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastCall(onChange).samples[0]).toBe(1);
  });
});

describe("EditSession busy 시작 알림", () => {
  it("알림이 스냅샷 변경보다 먼저 온다", async () => {
    vi.useFakeTimers();
    const { props } = createProps();
    const effect = heldEffect();
    const session = new EditSession(props, createDeps(effect.applyEffect));
    const order: string[] = [];
    // 훅은 이 시점에 document.activeElement를 기억한다. busy가 켜진 뒤에는 이미 포커스를 잃는다
    mount(session, props, () => order.push(`알림 busy=${session.getSnapshot().busy}`));
    session.subscribe(() => order.push(`스냅샷 busy=${session.getSnapshot().busy}`));

    session.effect("faster");
    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS - 1);
    expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(order).toEqual(["알림 busy=false", "스냅샷 busy=true"]);
    effect.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().busy).toBe(false);
  });
});

describe("EditSession 입력 반영 1단계", () => {
  it("2단계 없이 1단계만 호출돼도 soundId 전환 전에 시작한 편집 결과는 버린다", async () => {
    const before = createProps({ soundId: "a" });
    const effect = heldEffect();
    const session = new EditSession(before.props, createDeps(effect.applyEffect));
    mount(session, before.props);
    session.effect("faster");
    await flush();

    // 커밋 직후, passive effect(applyInput)가 돌기 전에 이전 소리의 편집이 끝나는 틈이다
    const after = createProps({ samples: ramp(300), soundId: "b" });
    session.syncProps(after.props);
    effect.release();
    await flush();

    expect(before.onChange).not.toHaveBeenCalled();
    expect(after.onChange).not.toHaveBeenCalled();
    expect(session.getSnapshot().canUndo).toBe(false);
  });
});

describe("EditSession 생성", () => {
  it("생성과 붙임, 1단계만으로는 재생기를 만들지 않고 타이머를 걸지 않는다", () => {
    vi.useFakeTimers();
    const { props } = createProps();
    const deps = createDeps(heldEffect().applyEffect);

    // StrictMode가 state 초기화 함수를 두 번 부르는 경우를 흉내 낸다
    new EditSession(props, deps);
    const session = new EditSession(props, deps);
    session.syncProps(props);
    session.attach();

    expect(FakeAudioBufferPlayer.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);

    // 재생기는 첫 입력 반영 2단계에서 만든다
    session.applyInput(props.samples, props.sampleRate);
    expect(FakeAudioBufferPlayer.instances).toHaveLength(1);
  });
});

/** 호스트가 새 props를 내려 준 커밋에서 훅이 하는 순서대로 1단계, 2단계를 부른다. */
function rerender(session: EditSession, props: EditSessionProps) {
  session.syncProps(props);
  session.applyInput(props.samples, props.sampleRate);
}

describe("EditSession 소리 전환 횟수", () => {
  const switchCount = (session: EditSession) => session.getSnapshot().switchCount;

  describe("늘지 않는다", () => {
    it("첫 입력 반영은 0으로 둔다", () => {
      const { props } = createProps({ soundId: "a" });
      const session = new EditSession(props, createDeps(heldEffect().applyEffect));

      mount(session, props);

      expect(switchCount(session)).toBe(0);
    });

    it("같은 입력으로 입력 반영이 다시 불려도 그대로다", () => {
      const { props } = createProps({ soundId: "a" });
      const session = new EditSession(props, createDeps(heldEffect().applyEffect));
      mount(session, props);

      // StrictMode가 effect를 정리하고 다시 실행하는 경우다
      session.detach();
      session.attach();
      session.applyInput(props.samples, props.sampleRate);

      expect(switchCount(session)).toBe(0);
    });

    it("내용이 같은 samples가 새 참조로 와도 그대로다", () => {
      const { props } = createProps({ soundId: "a" });
      const session = new EditSession(props, createDeps(heldEffect().applyEffect));
      mount(session, props);

      rerender(session, { ...props, samples: Float32Array.from(props.samples) });

      expect(switchCount(session)).toBe(0);
    });

    it("방금 내보낸 배열이 돌아와도 이력을 유지하고, 편집·undo·redo의 결과 반영까지 그대로다", async () => {
      const effect = heldEffect();
      const { props, onChange } = createProps({ soundId: "a" });
      const session = new EditSession(props, createDeps(effect.applyEffect));
      mount(session, props);
      session.updateTrim(0.5, 1);
      session.deleteSelection();
      await flush();
      expect(switchCount(session)).toBe(0);
      let current = { ...props, samples: lastCall(onChange).samples };
      rerender(session, current);
      expect(switchCount(session)).toBe(0);
      expect(session.getSnapshot().canUndo).toBe(true);

      session.undo();
      await flush();
      expect(switchCount(session)).toBe(0);
      current = { ...current, samples: lastCall(onChange).samples };
      rerender(session, current);
      expect(switchCount(session)).toBe(0);

      session.redo();
      await flush();
      expect(switchCount(session)).toBe(0);
      current = { ...current, samples: lastCall(onChange).samples };
      rerender(session, current);
      expect(switchCount(session)).toBe(0);
    });
  });

  describe("1씩 는다", () => {
    /** 선택, 이력이 있는 상태를 만든다. 전환이 이를 지우는지 함께 본다. */
    async function editedSession(soundId?: string) {
      const { props, onChange } = createProps({ soundId });
      const session = new EditSession(props, createDeps(heldEffect().applyEffect));
      mount(session, props);
      session.updateTrim(0.5, 1);
      session.deleteSelection();
      await flush();
      session.updateTrim(0.1, 0.4);
      expect(session.getSnapshot()).toMatchObject({ canUndo: true });
      return { session, props: { ...props, samples: lastCall(onChange).samples } };
    }

    it("soundId가 바뀌면 내용이 같아도 늘고 선택이 비워진다", async () => {
      const { session, props } = await editedSession("a");
      rerender(session, props);
      const before = session.getSnapshot();
      expect(before.trim.start).not.toBeNull();

      // 1단계(syncProps)만으로는 늘지 않고, 2단계(applyInput)가 끝나야 는다
      const next = { ...props, soundId: "b" };
      session.syncProps(next);
      expect(switchCount(session)).toBe(0);
      session.applyInput(next.samples, next.sampleRate);

      const after = session.getSnapshot();
      expect(after.switchCount).toBe(1);
      expect(after.trim).toEqual({ start: null, end: null });
      expect(after.canUndo).toBe(false);
      expect(after.chunkLevels).not.toBe(before.chunkLevels);
    });

    it("soundId가 같아도 내용이 다르면 늘고 선택이 비워진다", async () => {
      const { session, props } = await editedSession("a");
      const before = session.getSnapshot();
      expect(before.trim.start).not.toBeNull();

      rerender(session, { ...props, samples: ramp(300) });

      const after = session.getSnapshot();
      expect(after.switchCount).toBe(1);
      expect(after.trim).toEqual({ start: null, end: null });
      expect(after.canUndo).toBe(false);
      expect(after.chunkLevels).not.toBe(before.chunkLevels);
    });

    it("soundId 없이 samples 내용만 바뀌어도 늘고 선택이 비워진다", async () => {
      const { session, props } = await editedSession();
      const before = session.getSnapshot();
      expect(before.trim.start).not.toBeNull();

      rerender(session, { ...props, samples: ramp(300) });

      const after = session.getSnapshot();
      expect(after.switchCount).toBe(1);
      expect(after.trim).toEqual({ start: null, end: null });
      expect(after.canUndo).toBe(false);
      expect(after.chunkLevels).not.toBe(before.chunkLevels);
    });

    it("soundId와 samples 내용이 함께 바뀌어도 2가 아니라 1이다", async () => {
      const { session, props } = await editedSession("a");

      rerender(session, { ...props, soundId: "b", samples: ramp(300) });

      expect(switchCount(session)).toBe(1);
    });

    it("전환할 때마다 1씩 쌓는다", async () => {
      const { session, props } = await editedSession("a");

      rerender(session, { ...props, soundId: "b" });
      rerender(session, { ...props, soundId: "c", samples: ramp(300) });
      rerender(session, { ...props, soundId: "c", samples: ramp(200) });

      expect(switchCount(session)).toBe(3);
    });
  });
});

describe("EditSession 호스트 onChange 예외", () => {
  const thrown = new Error("host failed");

  /** 100샘플 소리에서 뒤 절반을 지워 이력을 하나 만든다. onChange는 정상으로 끝난다. */
  async function afterDelete() {
    const { props, onChange, onError } = createProps();
    const session = new EditSession(props, createDeps(heldEffect().applyEffect));
    mount(session, props);
    session.updateTrim(0.5, 1);
    session.deleteSelection();
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    return { session, onChange, onError };
  }

  it("지우기 뒤 onChange가 던져도 반영 실패로 알리지 않고 선택 해제까지 이어간다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { props, onChange, onError } = createProps();
    onChange.mockImplementation(() => {
      throw thrown;
    });
    const session = new EditSession(props, createDeps(heldEffect().applyEffect));
    mount(session, props);
    session.updateTrim(0.5, 1);

    session.deleteSelection();
    await flush();

    // 소리는 이미 새 소리로 바뀌었으므로 apply 오류가 아니다
    expect(onError).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      editError: null,
      canUndo: true,
      trim: { start: null, end: null },
    });
    expect(FakeAudioBufferPlayer.last.buffer.length).toBe(50);
    expect(consoleError).toHaveBeenCalledWith("onChange 콜백이 예외를 던졌다", thrown);
  });

  it("undo 뒤 onChange가 던져도 선택을 복원한다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { session, onChange, onError } = await afterDelete();
    onChange.mockImplementation(() => {
      throw thrown;
    });

    session.undo();
    await flush();

    expect(onError).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({
      editError: null,
      canRedo: true,
      trim: { start: 0.5, end: 1 },
    });
    expect(FakeAudioBufferPlayer.last.buffer.length).toBe(100);
    expect(consoleError).toHaveBeenCalledWith("onChange 콜백이 예외를 던졌다", thrown);
  });
});

describe("EditSession undo와 redo의 재생", () => {
  it("undo와 redo는 소리를 재생하지 않는다", async () => {
    const { props } = createProps();
    const session = new EditSession(props, createDeps(heldEffect().applyEffect));
    mount(session, props);
    session.updateTrim(0.5, 1);
    session.deleteSelection();
    await flush();

    session.undo();
    await flush();
    session.redo();
    await flush();

    expect(FakeAudioBufferPlayer.last.play).not.toHaveBeenCalled();
  });
});

describe("EditSession 원래대로", () => {
  /** 두 번 지워 100 → 50 → 25샘플로 만든 세션 */
  async function afterTwoDeletes() {
    const { props, onChange } = createProps();
    const session = new EditSession(props, createDeps(heldEffect().applyEffect));
    mount(session, props);
    for (let i = 0; i < 2; i++) {
      session.updateTrim(0.5, 1);
      session.deleteSelection();
      await flush();
    }
    return { session, props, onChange };
  }

  it("소리를 받은 직후에는 돌아갈 수 없고 편집하면 돌아갈 수 있다", async () => {
    const { props } = createProps();
    const session = new EditSession(props, createDeps(heldEffect().applyEffect));
    mount(session, props);
    expect(session.getSnapshot().canRevert).toBe(false);

    session.updateTrim(0.5, 1);
    session.deleteSelection();
    await flush();

    expect(session.getSnapshot().canRevert).toBe(true);
  });

  it("여러 번 편집한 소리를 한 번에 받은 직후의 내용으로 되돌리고 선택을 지우며 재생하지 않는다", async () => {
    const { session, onChange } = await afterTwoDeletes();
    session.updateTrim(0.1, 0.2);

    session.revert();
    await flush();

    expect(Array.from(lastCall(onChange).samples)).toEqual(Array.from(ramp(100)));
    expect(session.getSnapshot()).toMatchObject({
      canRevert: false,
      trim: { start: null, end: null },
    });
    expect(FakeAudioBufferPlayer.last.play).not.toHaveBeenCalled();
  });

  it("원래대로 뒤 undo는 되돌리기 전 소리를 복원하고 다시 돌아갈 수 있다", async () => {
    const { session, onChange } = await afterTwoDeletes();
    session.revert();
    await flush();

    session.undo();
    await flush();

    expect(lastCall(onChange).samples.length).toBe(25);
    expect(session.getSnapshot().canRevert).toBe(true);
  });

  it("편집을 모두 undo해 받은 직후의 소리로 오면 돌아갈 수 없고, redo하면 다시 돌아갈 수 있다", async () => {
    const { session } = await afterTwoDeletes();

    session.undo();
    await flush();
    expect(session.getSnapshot().canRevert).toBe(true);
    session.undo();
    await flush();
    expect(session.getSnapshot().canRevert).toBe(false);
    session.redo();
    await flush();

    expect(session.getSnapshot().canRevert).toBe(true);
  });

  it("다른 소리로 바뀌면 새 소리를 기준으로 삼는다", async () => {
    const { session, props } = await afterTwoDeletes();
    const next = { ...props, samples: ramp(40), soundId: "b" };

    session.syncProps(next);
    session.applyInput(next.samples, next.sampleRate);

    expect(session.getSnapshot().canRevert).toBe(false);
  });
});

describe("EditSession 효과 시험 모드", () => {
  /** 효과 렌더링이 바로 끝나는 세션. 효과 한 번이 첫 샘플에 1을 더한다 */
  function trySession() {
    const held = heldEffect();
    held.release();
    const { props, onChange } = createProps();
    const session = new EditSession(props, createDeps(held.applyEffect));
    mount(session, props);
    return { session, onChange, applyEffect: held.applyEffect };
  }

  const firstSample = (fn: ReturnType<typeof vi.fn>) => lastCall(fn).samples[0];

  it("기본값은 꺼져 있고 효과가 앞 효과 위에 쌓인다", async () => {
    const { session, onChange } = trySession();
    expect(session.getSnapshot().tryEffects).toBe(false);

    session.effect("higher");
    await flush();
    session.effect("lower");
    await flush();

    expect(firstSample(onChange)).toBe(2);
  });

  it("켜면 새 효과가 직전 효과를 대체하고 undo 한 번이 시험 전으로 돌린다", async () => {
    const { session, onChange } = trySession();
    session.setTryEffects(true);

    session.effect("higher");
    await flush();
    session.effect("lower");
    await flush();
    expect(firstSample(onChange)).toBe(1);

    session.undo();
    await flush();
    expect(firstSample(onChange)).toBe(0);
    expect(session.getSnapshot()).toMatchObject({ canUndo: false, canRevert: false });
  });

  it("효과 사이에 다른 편집이 있으면 대체하지 않고 쌓는다", async () => {
    const { session, onChange } = trySession();
    session.setTryEffects(true);

    session.effect("higher");
    await flush();
    session.updateTrim(0.5, 1);
    session.deleteSelection();
    await flush();
    session.effect("lower");
    await flush();

    expect(firstSample(onChange)).toBe(2);
    session.undo();
    await flush();
    session.undo();
    await flush();
    expect(firstSample(onChange)).toBe(1);
  });

  it("효과 뒤 선택을 바꾸면 대체하지 않고 쌓는다", async () => {
    const { session, onChange } = trySession();
    session.setTryEffects(true);

    session.effect("higher");
    await flush();
    session.updateTrim(0, 0.5);
    session.effect("lower");
    await flush();

    expect(firstSample(onChange)).toBe(2);
  });

  it("효과를 undo한 뒤 다시 누르면 undo 전 효과를 대체하지 않는다", async () => {
    const { session, onChange } = trySession();
    session.setTryEffects(true);

    session.effect("higher");
    await flush();
    session.undo();
    await flush();
    session.effect("lower");
    await flush();

    expect(firstSample(onChange)).toBe(1);
    session.undo();
    await flush();
    expect(firstSample(onChange)).toBe(0);
  });

  it("끄면 이어서 누른 효과가 쌓인다", async () => {
    const { session, onChange } = trySession();
    session.setTryEffects(true);

    session.effect("higher");
    await flush();
    session.setTryEffects(false);
    session.effect("lower");
    await flush();

    expect(firstSample(onChange)).toBe(2);
  });

  it("선택을 건 채 시험하면 선택을 대체한 효과의 결과 선택으로 바꾼다", async () => {
    const { session } = trySession();
    session.setTryEffects(true);
    session.updateTrim(0.25, 0.5);

    session.effect("higher");
    await flush();
    session.effect("lower");
    await flush();

    expect(session.getSnapshot().trim).toEqual({ start: 0.25, end: 0.5 });
    session.undo();
    await flush();
    expect(session.getSnapshot().trim).toEqual({ start: 0.25, end: 0.5 });
  });
});
