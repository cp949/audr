import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import {
  applyEffect,
  deleteRange,
  downsampleIfNeeded,
  keepRange,
  pasteClip,
  resample,
} from "@cp949/audr-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUSY_DELAY_MS,
  useSoundEditor,
  type SoundEditorHookProps,
} from "../src/hooks/useSoundEditor";
import { fakeAudioBuffer, FakeAudioBufferPlayer, ramp } from "./helpers/fakePlayer";

vi.mock("@cp949/audr-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cp949/audr-core")>();
  const { FakeAudioBufferPlayer } = await import("./helpers/fakePlayer");
  return {
    ...actual,
    AudioBufferPlayer: FakeAudioBufferPlayer,
    applyEffect: vi.fn(),
    // 기본은 실제 구현이고, 용량 초과 실패를 흉내 낼 때만 거부로 바꾼다
    downsampleIfNeeded: vi.fn(actual.downsampleIfNeeded),
    // 기본은 실제 구현이고, 리샘플 대기 중의 선택 변경을 흉내 낼 때만 붙잡아 둔다
    resample: vi.fn(actual.resample),
  };
});

const mockedApplyEffect = vi.mocked(applyEffect);
const mockedDownsample = vi.mocked(downsampleIfNeeded);
const mockedResample = vi.mocked(resample);
const { resample: actualResample } =
  await vi.importActual<typeof import("@cp949/audr-core")>("@cp949/audr-core");

function setup(
  overrides: { samples?: Float32Array; sampleRate?: number; soundId?: string | number } = {},
) {
  const onChange = vi.fn();
  const onCopyToNew = vi.fn();
  const onRename = vi.fn();
  const onError = vi.fn();
  const initial: SoundEditorHookProps = {
    samples: overrides.samples ?? ramp(1000),
    sampleRate: overrides.sampleRate ?? 44100,
    name: "소리",
    onChange,
    onCopyToNew,
    onRename,
    onError,
    ...(overrides.soundId === undefined ? {} : { soundId: overrides.soundId }),
  };
  const utils = renderHook((props: SoundEditorHookProps) => useSoundEditor(props), {
    initialProps: initial,
  });
  return { ...utils, initial, onChange, onCopyToNew, onRename, onError };
}

/** 문서에 keydown을 보낸다. 비동기 편집이 끝나도록 act로 감싼다. */
async function press(
  key: string,
  init: KeyboardEventInit = {},
  target: Document | Element = document,
) {
  await act(async () => fireEvent.keyDown(target, { key, ...init }));
}

async function select(
  result: { current: ReturnType<typeof useSoundEditor> },
  s: number | null,
  e: number | null,
) {
  await act(async () => result.current.onSetTrim(s, e));
}

const lastOnChange = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1]?.[0] as { samples: Float32Array; sampleRate: number };

beforeEach(() => {
  FakeAudioBufferPlayer.reset();
  mockedApplyEffect.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSoundEditor 삭제", () => {
  it("선택 (0.25, 0.75) 후 Delete하면 deleteRange 결과로 onChange를 부르고 선택이 null이 된다", async () => {
    const { result, onChange } = setup();
    await select(result, 0.25, 0.75);
    await press("Delete");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const emitted = lastOnChange(onChange);
    expect(emitted.samples.length).toBe(500);
    expect(Array.from(emitted.samples)).toEqual(Array.from(deleteRange(ramp(1000), 0.25, 0.75)));
    expect(emitted.sampleRate).toBe(44100);
    await waitFor(() => expect(result.current.trimStart).toBeNull());
    expect(result.current.trimEnd).toBeNull();
  });

  it("Backspace도 Delete처럼 동작한다", async () => {
    const { result, onChange } = setup();
    await select(result, 0, 0.5);
    await press("Backspace");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(lastOnChange(onChange).samples.length).toBe(500);
  });

  it("Shift+Delete는 keepRange 결과로 onChange를 부른다", async () => {
    const { result, onChange } = setup();
    await select(result, 0.25, 0.75);
    await press("Delete", { shiftKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(Array.from(lastOnChange(onChange).samples)).toEqual(
      Array.from(keepRange(ramp(1000), 0.25, 0.75)),
    );
  });

  it("선택이 없으면 Delete와 Shift+Delete는 편집을 일으키지 않는다", async () => {
    const { result, onChange } = setup();
    await press("Delete");
    await press("Delete", { shiftKey: true });
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });

  it("onDelete도 선택 구간을 지운다", async () => {
    const { result, onChange } = setup();
    await select(result, 0.5, 1);
    await act(async () => result.current.onDelete());
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(lastOnChange(onChange).samples.length).toBe(500);
  });

  it("input에 포커스가 있으면 Delete가 편집을 일으키지 않는다", async () => {
    const { result, onChange } = setup();
    await select(result, 0.25, 0.75);
    const input = document.createElement("input");
    document.body.appendChild(input);
    await press("Delete", {}, input);
    input.remove();
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
  });

  // 호스트 페이지의 다른 텍스트 입력 요소에서 누른 키도 가로채면 안 된다
  it.each([
    ["textarea", () => document.createElement("textarea")],
    ["select", () => document.createElement("select")],
    [
      "contenteditable",
      () => {
        const div = document.createElement("div");
        div.contentEditable = "true";
        // jsdom은 isContentEditable을 계산하지 않아 브라우저 값을 흉내 낸다
        Object.defineProperty(div, "isContentEditable", { value: true });
        return div;
      },
    ],
  ])("%s에서 누른 Backspace는 편집을 일으키지 않고 기본 동작도 막지 않는다", async (_, create) => {
    const { result, onChange } = setup();
    await select(result, 0.25, 0.75);
    const field = create();
    document.body.appendChild(field);
    let prevented = true;
    await act(async () => {
      prevented = !fireEvent.keyDown(field, { key: "Backspace" });
    });
    field.remove();
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });
});

describe("useSoundEditor undo/redo", () => {
  it("Ctrl+Z는 이전 samples로 onChange를 부르고 canRedo가 true가 된다", async () => {
    const { result, onChange } = setup();
    await select(result, 0.25, 0.75);
    await press("Delete");
    await waitFor(() => expect(result.current.canUndo).toBe(true));
    expect(result.current.canRedo).toBe(false);

    await press("z", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(Array.from(lastOnChange(onChange).samples)).toEqual(Array.from(ramp(1000)));
    expect(result.current.canRedo).toBe(true);
    expect(result.current.canUndo).toBe(false);
    // undo 뒤에 선택이 복원되고 재생된다
    await waitFor(() => expect(result.current.trimStart).toBe(0.25));
    expect(result.current.trimEnd).toBe(0.75);
    expect(FakeAudioBufferPlayer.last.play).toHaveBeenCalled();
  });

  it("Ctrl+Shift+Z는 되돌린 편집을 다시 적용한다", async () => {
    const { result, onChange } = setup();
    await select(result, 0.25, 0.75);
    await press("Delete");
    await waitFor(() => expect(result.current.canUndo).toBe(true));
    await press("z", { ctrlKey: true });
    await waitFor(() => expect(result.current.canRedo).toBe(true));

    await press("Z", { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(3));
    expect(lastOnChange(onChange).samples.length).toBe(500);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it("Cmd+Z(metaKey)도 undo다", async () => {
    const { result, onChange } = setup();
    await select(result, 0, 0.5);
    await press("Delete");
    await waitFor(() => expect(result.current.canUndo).toBe(true));
    await press("z", { metaKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
  });

  it("이력이 없으면 Ctrl+Z는 아무 일도 하지 않고 기본 동작도 막지 않는다", async () => {
    const { onChange } = setup();
    const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true });
    await act(async () => {
      document.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("100번 편집하면 99번만 되돌릴 수 있다", async () => {
    const { result, onChange } = setup();
    // 매번 끝 1%를 지운다. 편집 뒤 길이를 같은 함수로 미리 계산해 둔다
    const lengths = [1000];
    let simulated = ramp(1000);
    for (let i = 0; i < 100; i++) {
      simulated = deleteRange(simulated, 0.99, 1);
      lengths.push(simulated.length);
    }
    for (let i = 0; i < 100; i++) {
      await select(result, 0.99, 1);
      await act(async () => result.current.onDelete());
      await waitFor(() => expect(onChange).toHaveBeenCalledTimes(i + 1));
    }
    expect(lastOnChange(onChange).samples.length).toBe(lengths[100]);

    let undone = 0;
    while (result.current.canUndo) {
      const before = onChange.mock.calls.length;
      await act(async () => result.current.onUndo());
      await waitFor(() => expect(onChange.mock.calls.length).toBe(before + 1));
      undone++;
      expect(undone).toBeLessThanOrEqual(100);
    }
    expect(undone).toBe(99);
    // 가장 오래된 1단계(길이 1000)는 버려졌으므로 마지막 undo 결과는 첫 편집 직후 길이다
    expect(lastOnChange(onChange).samples.length).toBe(lengths[1]);
    expect(lengths[1]).toBeLessThan(1000);
  });
});

describe("useSoundEditor 선택", () => {
  it("Esc는 선택을 해제하고 재생을 멈춘다", async () => {
    const { result } = setup();
    await select(result, 0.25, 0.75);
    expect(result.current.trimStart).toBe(0.25);
    await press("Escape");
    expect(result.current.trimStart).toBeNull();
    expect(result.current.trimEnd).toBeNull();
    expect(FakeAudioBufferPlayer.last.stop).toHaveBeenCalled();
  });

  it("Ctrl+A는 (0, 1)을 선택한다", async () => {
    const { result } = setup();
    await press("a", { ctrlKey: true });
    expect(result.current.trimStart).toBe(0);
    expect(result.current.trimEnd).toBe(1);
  });

  it("onContainerMouseDown은 컨테이너 자신을 누를 때만 선택을 해제한다", async () => {
    const { result } = setup();
    await select(result, 0.25, 0.75);
    const container = document.createElement("div");
    const child = document.createElement("span");
    container.appendChild(child);
    result.current.setContainer(container);
    act(() => {
      result.current.onContainerMouseDown({ target: child } as unknown as React.MouseEvent);
    });
    expect(result.current.trimStart).toBe(0.25);
    act(() => {
      result.current.onContainerMouseDown({ target: container } as unknown as React.MouseEvent);
    });
    expect(result.current.trimStart).toBeNull();
  });
});

describe("useSoundEditor 명령이 아닌 키", () => {
  // 어떤 키 조합이 명령인지는 keyCommand.test.ts가 덮는다. 여기서는 판정이 null일 때의 배선만 본다
  /** keydown을 보내고 기본 동작을 막았는지 돌려준다 */
  async function dispatchKey(init: KeyboardEventInit) {
    const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
    await act(async () => {
      document.dispatchEvent(event);
    });
    return event.defaultPrevented;
  }

  it("명령으로 판정되지 않은 키는 편집·재생을 하지 않고 기본 동작도 막지 않는다", async () => {
    const { result, onChange } = setup();
    await select(result, 0.25, 0.75);

    const deletePrevented = await dispatchKey({ key: "Delete", ctrlKey: true });
    const playPrevented = await dispatchKey({ key: " ", altKey: true });

    expect(onChange).not.toHaveBeenCalled();
    expect(FakeAudioBufferPlayer.last.play).not.toHaveBeenCalled();
    expect(deletePrevented).toBe(false);
    expect(playPrevented).toBe(false);
  });
});

describe("useSoundEditor 재생", () => {
  it("Space는 재생과 정지를 번갈아 한다", async () => {
    const { result } = setup();
    await press(" ");
    const player = FakeAudioBufferPlayer.last;
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.play.mock.calls[0]?.slice(0, 2)).toEqual([0, 1]);
    act(() => player.onUpdate?.(0.3));
    expect(result.current.playhead).toBe(0.3);
    await press(" ");
    expect(player.stop).toHaveBeenCalled();
    expect(result.current.playhead).toBeNull();
  });

  it("Space를 누르고 있어도(repeat) 다시 시작·정지하지 않고 기본 동작만 막는다", async () => {
    const { result } = setup();
    await press(" ");
    const player = FakeAudioBufferPlayer.last;
    act(() => player.onUpdate?.(0.3));
    const stops = player.stop.mock.calls.length;

    const event = new KeyboardEvent("keydown", { key: " ", repeat: true, cancelable: true });
    await act(async () => {
      document.dispatchEvent(event);
    });

    // 막지 않으면 호스트 페이지가 Space로 스크롤된다
    expect(event.defaultPrevented).toBe(true);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.stop).toHaveBeenCalledTimes(stops);
    expect(result.current.playhead).toBe(0.3);
  });

  it("선택이 있으면 선택 구간만 재생한다", async () => {
    const { result } = setup();
    await select(result, 0.25, 0.75);
    await act(async () => result.current.onPlay());
    expect(FakeAudioBufferPlayer.last.play.mock.calls.at(-1)?.slice(0, 2)).toEqual([0.25, 0.75]);
  });

  it("재생이 끝나면 playhead가 null이 된다", async () => {
    const { result } = setup();
    await act(async () => result.current.onPlay());
    const player = FakeAudioBufferPlayer.last;
    act(() => player.onUpdate?.(0.5));
    expect(result.current.playhead).toBe(0.5);
    act(() => player.onEnded?.());
    expect(result.current.playhead).toBeNull();
  });

  it("unmount하면 재생기를 멈추고 keydown 리스너를 떼어낸다", async () => {
    const { result, unmount, onChange } = setup();
    await select(result, 0.25, 0.75);
    const player = FakeAudioBufferPlayer.last;
    unmount();
    expect(player.stop).toHaveBeenCalled();
    await press("Delete");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("useSoundEditor copy/paste", () => {
  it("canPaste는 copy 전에 false, copy 후 true다", async () => {
    const { result } = setup();
    expect(result.current.canPaste).toBe(false);
    await press("c", { ctrlKey: true });
    expect(result.current.canPaste).toBe(true);
  });

  it("Ctrl+V를 누르고 있어도(repeat) 한 번만 붙인다", async () => {
    const { onChange } = setup({ samples: ramp(100) });
    await press("c", { ctrlKey: true });
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

    await press("v", { ctrlKey: true, repeat: true });
    await press("v", { ctrlKey: true, repeat: true });
    await act(async () => {});

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastOnChange(onChange).samples.length).toBe(200);
  });

  it("선택이 없을 때 copy는 전체를 복사하고 paste는 끝에 붙인다", async () => {
    const { result, onChange } = setup({ samples: ramp(100) });
    await press("c", { ctrlKey: true });
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const emitted = lastOnChange(onChange);
    expect(emitted.samples.length).toBe(200);
    expect(Array.from(emitted.samples)).toEqual([
      ...Array.from(ramp(100)),
      ...Array.from(ramp(100)),
    ]);
    // 선택이 없었으므로 선택은 그대로 없다
    expect(result.current.trimStart).toBeNull();
    expect(FakeAudioBufferPlayer.last.play).toHaveBeenCalled();
  });

  it("선택이 있으면 선택 구간을 붙여 넣은 클립으로 교체하고 그 구간을 선택한다", async () => {
    const { result, onChange } = setup({ samples: ramp(100) });
    await select(result, 0, 0.2);
    await press("c", { ctrlKey: true }); // 앞 20개 복사
    await select(result, 0.5, 1);
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(lastOnChange(onChange).samples.length).toBe(50 + 20);
    await waitFor(() => expect(result.current.trimStart).toBeCloseTo(50 / 70, 9));
    expect(result.current.trimEnd).toBeCloseTo(1, 9);
  });

  it("copy 전에는 Ctrl+V가 아무 일도 하지 않는다", async () => {
    const { onChange } = setup();
    await press("v", { ctrlKey: true });
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
  });

  it("샘플레이트가 다른 클립은 리샘플한 뒤 붙인다", async () => {
    const { result, rerender, initial, onChange } = setup({
      samples: ramp(100),
      sampleRate: 44100,
    });
    await press("c", { ctrlKey: true }); // 44100Hz, 100샘플
    rerender({ ...initial, samples: ramp(40), sampleRate: 22050 }); // 다른 소리(22050Hz)로 바뀜
    await waitFor(() => expect(FakeAudioBufferPlayer.last.buffer.length).toBe(40));
    // 복사본은 소리가 바뀌어도 남는다
    expect(result.current.canPaste).toBe(true);
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const emitted = lastOnChange(onChange);
    expect(emitted.sampleRate).toBe(22050);
    // jsdom에는 OfflineAudioContext가 없어 절반 rate는 dropEveryOtherSample로 처리된다: 100 -> 50
    expect(emitted.samples.length).toBe(40 + 50);
  });

  it("onCopyToNew는 선택 구간을 복사해 바깥에 넘기고 paste도 가능해진다", async () => {
    const { result, onCopyToNew } = setup({ samples: ramp(100) });
    await select(result, 0.25, 0.75);
    await act(async () => result.current.onCopyToNew());
    expect(onCopyToNew).toHaveBeenCalledTimes(1);
    const clip = onCopyToNew.mock.calls[0]?.[0] as { samples: Float32Array; sampleRate: number };
    expect(Array.from(clip.samples)).toEqual(Array.from(ramp(100).slice(25, 75)));
    expect(clip.sampleRate).toBe(44100);
    expect(result.current.canPaste).toBe(true);
  });
});

/**
 * 효과 렌더링을 release()를 부를 때까지 붙잡아 둔다. 결과는 첫 샘플에 1을 더한 사본이다.
 * 붙잡힌 호출은 큐에서 앞 편집이 끝나기를 기다리는 편집을 흉내 내는 데 쓴다.
 */
function holdEffectPlusOne() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  mockedApplyEffect.mockImplementation(async (buffer, _name, trimStart, trimEnd) => {
    await gate;
    const out = Float32Array.from(buffer.getChannelData(0));
    out[0] = (out[0] as number) + 1;
    return { buffer: fakeAudioBuffer(out, 44100), trimStart, trimEnd };
  });
  return async () => {
    await act(async () => release());
  };
}

describe("useSoundEditor 빈 소리 편집", () => {
  /** ramp(100)을 복사한 채 빈 소리로 바꾼다 */
  async function copyThenSwitchToEmpty() {
    const utils = setup({ samples: ramp(100) });
    await press("c", { ctrlKey: true });
    utils.rerender({ ...utils.initial, samples: new Float32Array(0) });
    await act(async () => {});
    return utils;
  }

  it("빈 소리에 붙이면 무음 1샘플 없이 복사본과 같은 길이·내용이 된다", async () => {
    const { onChange } = await copyThenSwitchToEmpty();
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(Array.from(lastOnChange(onChange).samples)).toEqual(Array.from(ramp(100)));
  });

  it("빈 소리에서 전체 선택 후 붙여도 복사본만 남고 붙인 구간 전체가 선택된다", async () => {
    const { result, onChange } = await copyThenSwitchToEmpty();
    await press("a", { ctrlKey: true });
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(Array.from(lastOnChange(onChange).samples)).toEqual(Array.from(ramp(100)));
    await waitFor(() => expect(result.current.trimEnd).toBeCloseTo(1, 9));
    expect(result.current.trimStart).toBeCloseTo(0, 9);
  });

  it("빈 소리에 붙인 뒤 undo하면 길이 0으로 돌아가고 redo하면 다시 붙인 내용이다", async () => {
    const { result, onChange } = await copyThenSwitchToEmpty();
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(result.current.canUndo).toBe(true));
    await press("z", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(lastOnChange(onChange).samples.length).toBe(0);
    await press("z", { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(3));
    expect(Array.from(lastOnChange(onChange).samples)).toEqual(Array.from(ramp(100)));
  });

  it("빈 소리에서 Copy to New는 새 소리를 만들지 않고 기존 복사본을 유지한다", async () => {
    const { result, onCopyToNew, onChange } = await copyThenSwitchToEmpty();
    await act(async () => result.current.onCopyToNew());
    expect(onCopyToNew).not.toHaveBeenCalled();
    // 기존 복사본이 그대로라 붙이면 처음 복사한 내용이 붙는다
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(lastOnChange(onChange).samples.length).toBe(100);
  });

  it("빈 소리에서 Copy는 기존 복사본을 지우지 않는다", async () => {
    const { result, onChange } = await copyThenSwitchToEmpty();
    await press("c", { ctrlKey: true });
    expect(result.current.canPaste).toBe(true);
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(lastOnChange(onChange).samples.length).toBe(100);
  });

  it("복사본이 없을 때 빈 소리에서 Copy해도 붙여넣기는 활성화되지 않는다", async () => {
    const { result } = setup({ samples: new Float32Array(0) });
    await press("c", { ctrlKey: true });
    expect(result.current.canPaste).toBe(false);
  });

  it("무음 1샘플짜리 실제 소리는 빈 소리가 아니므로 Copy to New가 1샘플을 넘긴다", async () => {
    const { result, onCopyToNew } = setup({ samples: new Float32Array(1) });
    await act(async () => result.current.onCopyToNew());
    expect(onCopyToNew).toHaveBeenCalledTimes(1);
    const clip = onCopyToNew.mock.calls[0]?.[0] as { samples: Float32Array };
    expect(clip.samples.length).toBe(1);
  });

  it("soundId 없이 빈 소리를 무음 1샘플 소리로 바꾸면 Copy to New가 1샘플을 넘긴다", async () => {
    const { result, rerender, initial, onCopyToNew } = setup({ samples: new Float32Array(0) });
    rerender({ ...initial, samples: new Float32Array(1) });
    await act(async () => {});
    await act(async () => result.current.onCopyToNew());
    expect(onCopyToNew).toHaveBeenCalledTimes(1);
    const clip = onCopyToNew.mock.calls[0]?.[0] as { samples: Float32Array };
    expect(clip.samples.length).toBe(1);
  });

  it("soundId 없이 무음 1샘플 소리를 빈 소리로 바꾸면 붙이기 결과에 무음이 남지 않는다", async () => {
    const utils = setup({ samples: ramp(100) });
    await press("c", { ctrlKey: true });
    utils.rerender({ ...utils.initial, samples: new Float32Array(1) });
    await act(async () => {});
    utils.rerender({ ...utils.initial, samples: new Float32Array(0) });
    await act(async () => {});
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(utils.onChange).toHaveBeenCalledTimes(1));
    expect(Array.from(lastOnChange(utils.onChange).samples)).toEqual(Array.from(ramp(100)));
  });

  it("샘플이 0개인 좁은 선택의 Copy·Copy to New는 기존 복사본을 지우지 않고 새 소리도 만들지 않는다", async () => {
    const { result, onChange, onCopyToNew } = setup({ samples: ramp(100) });
    await press("c", { ctrlKey: true });
    // 100샘플의 [0.25, 0.255)는 slice(25, 25.5)라 샘플이 0개다
    await select(result, 0.25, 0.255);
    await press("c", { ctrlKey: true });
    await act(async () => result.current.onCopyToNew());
    expect(onCopyToNew).not.toHaveBeenCalled();
    await select(result, null, null);
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(lastOnChange(onChange).samples.length).toBe(200);
  });

  it("빈 소리에서 효과 버튼은 결과를 내보내지 않는다", async () => {
    const { result, onChange } = setup({ samples: new Float32Array(0) });
    // 실제 applyEffect는 2샘플 미만이면 입력 버퍼를 그대로 돌려준다
    mockedApplyEffect.mockImplementation(async (buffer, _n, s, e) => ({
      buffer,
      trimStart: s,
      trimEnd: e,
    }));
    await act(async () => result.current.onEffect("reverse"));
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });
});

describe("useSoundEditor 소리 전환(soundId)", () => {
  it("soundId를 바꾼 뒤 붙이기를 하면 이전 소리에서 복사한 내용이 붙는다", async () => {
    const { result, rerender, initial, onChange } = setup({
      samples: ramp(100),
      soundId: "a",
    });
    await select(result, 0, 0.2);
    await press("c", { ctrlKey: true }); // 앞 20개 복사
    rerender({ ...initial, samples: ramp(300), soundId: "b" });
    await waitFor(() => expect(FakeAudioBufferPlayer.last.buffer.length).toBe(300));
    expect(result.current.canPaste).toBe(true);
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(Array.from(lastOnChange(onChange).samples)).toEqual([
      ...Array.from(ramp(300)),
      ...Array.from(ramp(100).slice(0, 20)),
    ]);
  });

  it("soundId가 바뀌면 내용이 같아도 이력과 선택을 지운다", async () => {
    const { result, rerender, initial, onChange } = setup({ soundId: "a" });
    await select(result, 0.25, 0.75);
    await press("Delete");
    await waitFor(() => expect(result.current.canUndo).toBe(true));
    await select(result, 0.1, 0.2);
    // 방금 내보낸 배열을 그대로 내려 주면 soundId가 같을 때는 같은 소리로 본다
    const emitted = lastOnChange(onChange);
    rerender({ ...initial, samples: emitted.samples, soundId: "b" });
    await waitFor(() => expect(result.current.canUndo).toBe(false));
    expect(result.current.trimStart).toBeNull();
  });

  it("soundId가 같으면 방금 내보낸 배열이 돌아와도 이력을 유지한다", async () => {
    const { result, rerender, initial, onChange } = setup({ soundId: "a" });
    await select(result, 0.25, 0.75);
    await press("Delete");
    await waitFor(() => expect(result.current.canUndo).toBe(true));
    rerender({ ...initial, samples: lastOnChange(onChange).samples });
    await act(async () => {});
    expect(result.current.canUndo).toBe(true);
  });

  it("soundId가 바뀌면 이전 소리의 편집 실패 알림을 지운다", async () => {
    const { result, rerender, initial } = setup({ samples: ramp(100), soundId: "a" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedApplyEffect.mockRejectedValue(new Error("render failed"));
    await act(async () => result.current.onEffect("faster"));
    expect(result.current.editError).not.toBeNull();
    rerender({ ...initial, samples: ramp(100), soundId: "b" });
    await waitFor(() => expect(result.current.editError).toBeNull());
  });

  it("효과 처리 중 soundId를 바꾸면 그 결과를 onChange로 내보내지 않고 새 소리의 이력·선택도 건드리지 않는다", async () => {
    const { result, rerender, initial, onChange } = setup({ soundId: "a" });
    const finish = holdEffectPlusOne();
    await act(async () => result.current.onEffect("higher"));
    rerender({ ...initial, samples: ramp(300), soundId: "b" });
    await waitFor(() => expect(FakeAudioBufferPlayer.last.buffer.length).toBe(300));
    await select(result, 0.2, 0.4);
    const player = FakeAudioBufferPlayer.last;
    await finish();
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.trimStart).toBe(0.2);
    expect(result.current.trimEnd).toBe(0.4);
    expect(FakeAudioBufferPlayer.last).toBe(player);
    expect(player.play).not.toHaveBeenCalled();
  });

  it("전환 전에 큐에 들어간 편집과 Copy to New는 시작하지 않는다", async () => {
    const { result, rerender, initial, onChange, onCopyToNew } = setup({ soundId: "a" });
    const finish = holdEffectPlusOne();
    await act(async () => {
      result.current.onEffect("higher");
      // 앞 효과 뒤에서 기다리는 편집. 시작하면 applyEffect가 한 번 더 불린다
      result.current.onEffect("lower");
      result.current.onCopyToNew();
    });
    rerender({ ...initial, samples: ramp(300), soundId: "b" });
    await finish();
    await act(async () => {});
    expect(mockedApplyEffect).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(onCopyToNew).not.toHaveBeenCalled();
  });

  it("soundId 없이 효과 처리 중 다른 내용의 samples로 바뀌면 그 결과를 onChange로 내보내지 않는다", async () => {
    const { result, rerender, initial, onChange } = setup();
    const finish = holdEffectPlusOne();
    await act(async () => result.current.onEffect("higher"));
    rerender({ ...initial, samples: ramp(300) });
    await waitFor(() => expect(FakeAudioBufferPlayer.last.buffer.length).toBe(300));
    await finish();
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });

  it("샘플레이트가 다른 소리에 붙여도 복사본은 그대로라 원래 샘플레이트 소리에는 원본이 붙는다", async () => {
    const { rerender, initial, onChange } = setup({ samples: ramp(100), soundId: "a" });
    await press("c", { ctrlKey: true }); // 44100Hz, 100샘플 전체
    rerender({ ...initial, samples: ramp(40), sampleRate: 22050, soundId: "b" });
    await waitFor(() => expect(FakeAudioBufferPlayer.last.buffer.length).toBe(40));
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    rerender({ ...initial, samples: ramp(10), soundId: "c" });
    await waitFor(() => expect(FakeAudioBufferPlayer.last.buffer.length).toBe(10));
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    // 22050Hz로 줄인 사본을 다시 늘린 값이 아니라 처음 복사한 샘플이 붙는다
    expect(Array.from(lastOnChange(onChange).samples)).toEqual([
      ...Array.from(ramp(10)),
      ...Array.from(ramp(100)),
    ]);
  });

  it("전환 뒤에 큐에 넣은 편집은 새 소리에 적용된다", async () => {
    const { result, rerender, initial, onChange } = setup({ soundId: "a" });
    const finish = holdEffectPlusOne();
    await act(async () => result.current.onEffect("higher"));
    rerender({ ...initial, samples: ramp(300), soundId: "b" });
    await waitFor(() => expect(FakeAudioBufferPlayer.last.buffer.length).toBe(300));
    await select(result, 0.5, 1);
    await act(async () => result.current.onDelete());
    await finish();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(lastOnChange(onChange).samples.length).toBe(150);
  });
});

describe("useSoundEditor 복사와 편집 큐 순서", () => {
  it.each([
    ["Ctrl+C 단축키", async () => press("c", { ctrlKey: true })],
    [
      "onCopy 버튼",
      async (result: { current: ReturnType<typeof useSoundEditor> }) =>
        act(async () => {
          result.current.onCopy();
        }),
    ],
  ])("효과 처리 중 %s로 복사하면 효과 결과가 복사된다", async (_label, doCopy) => {
    const { result, onChange } = setup({ samples: ramp(100) });
    const finish = holdEffectPlusOne();
    await act(async () => result.current.onEffect("reverse"));
    await doCopy(result);
    // 효과가 끝나기 전에는 복사가 실행되지 않는다
    expect(result.current.canPaste).toBe(false);
    await finish();
    await act(async () => {});
    expect(result.current.canPaste).toBe(true);
    await act(async () => result.current.onPaste());
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    // 효과 결과(첫 샘플 0 -> 1)가 끝에 붙는다. 효과 전 내용이면 0이다
    expect(lastOnChange(onChange).samples[100]).toBe(1);
  });

  it("효과 처리 중 Copy to New는 효과가 끝난 뒤 그 결과로 onCopyToNew를 부른다", async () => {
    const { result, onCopyToNew } = setup({ samples: ramp(100) });
    const finish = holdEffectPlusOne();
    await act(async () => {
      result.current.onEffect("reverse");
      result.current.onCopyToNew();
    });
    expect(onCopyToNew).not.toHaveBeenCalled();
    await finish();
    await act(async () => {});
    expect(onCopyToNew).toHaveBeenCalledTimes(1);
    const clip = onCopyToNew.mock.calls[0]?.[0] as { samples: Float32Array };
    expect(clip.samples[0]).toBe(1);
    expect(result.current.canPaste).toBe(true);
  });
});

describe("useSoundEditor tooLoud", () => {
  it("선택 구간 chunkLevels 최댓값이 1.2를 넘으면 true다", async () => {
    // 풀스케일 샘플 -> 레벨 약 1.35. 청크 1024개씩 3개
    const loud = new Float32Array(3072).fill(1);
    loud.fill(0.001, 0, 1024); // 첫 청크만 조용하다
    const { result } = setup({ samples: loud });
    expect(result.current.chunkLevels.length).toBe(3);
    await select(result, 0, 0.3); // 첫 청크(조용함)만 포함
    expect(result.current.tooLoud).toBe(false);
    await select(result, 0.4, 1);
    expect(result.current.tooLoud).toBe(true);
  });

  it("조용한 소리는 false다", () => {
    const { result } = setup({ samples: new Float32Array(3072).fill(0.1) });
    expect(result.current.tooLoud).toBe(false);
  });
});

describe("useSoundEditor 효과", () => {
  it("선택이 없으면 전체 구간(0, 1)으로 applyEffect를 호출한다", async () => {
    const { result } = setup();
    mockedApplyEffect.mockResolvedValue({
      buffer: fakeAudioBuffer(ramp(500), 44100),
      trimStart: 0,
      trimEnd: 1,
    });
    await act(async () => result.current.onEffect("faster"));
    expect(mockedApplyEffect).toHaveBeenCalledWith(
      FakeAudioBufferPlayer.instances[0]?.buffer,
      "faster",
      0,
      1,
    );
  });

  it('화면에 버튼이 없어도 onEffect("mute")는 mute 효과로 applyEffect를 호출한다', async () => {
    const { result } = setup();
    mockedApplyEffect.mockResolvedValue({
      buffer: fakeAudioBuffer(ramp(500), 44100),
      trimStart: 0,
      trimEnd: 1,
    });
    await act(async () => result.current.onEffect("mute"));
    expect(mockedApplyEffect).toHaveBeenCalledWith(
      FakeAudioBufferPlayer.instances[0]?.buffer,
      "mute",
      0,
      1,
    );
  });

  it("선택이 있으면 선택 구간으로 호출하고, 결과 samples와 조정된 선택으로 갱신하고 재생한다", async () => {
    const { result, onChange } = setup();
    await select(result, 0.5, 1);
    mockedApplyEffect.mockResolvedValue({
      buffer: fakeAudioBuffer(ramp(800), 44100),
      trimStart: 0.6,
      trimEnd: 1,
    });
    await act(async () => result.current.onEffect("faster"));
    expect(mockedApplyEffect).toHaveBeenCalledWith(expect.anything(), "faster", 0.5, 1);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(lastOnChange(onChange).samples.length).toBe(800);
    await waitFor(() => expect(result.current.trimStart).toBe(0.6));
    expect(FakeAudioBufferPlayer.last.play).toHaveBeenCalled();
    expect(result.current.canUndo).toBe(true);
  });

  it("applyEffect가 입력 버퍼를 그대로 돌려주면(길이 1) 편집하지 않는다", async () => {
    const { result, onChange } = setup({ samples: new Float32Array(1) });
    mockedApplyEffect.mockImplementation(async (buffer, _name, trimStart, trimEnd) => ({
      buffer,
      trimStart,
      trimEnd,
    }));
    await act(async () => result.current.onEffect("robot"));
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });

  it("효과 렌더링이 실패하면 크래시 없이 편집하지 않는다", async () => {
    const { result, onChange } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedApplyEffect.mockRejectedValue(new Error("render failed"));
    await act(async () => result.current.onEffect("echo"));
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it("효과 렌더링 중 unmount되면 이후 onChange를 부르지 않는다", async () => {
    const { result, unmount, onChange } = setup();
    let resolve!: (v: Awaited<ReturnType<typeof applyEffect>>) => void;
    mockedApplyEffect.mockReturnValue(new Promise((r) => (resolve = r)));
    await act(async () => result.current.onEffect("reverse"));
    unmount();
    await act(async () => {
      resolve({ buffer: fakeAudioBuffer(ramp(1000), 44100), trimStart: 0, trimEnd: 1 });
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("useSoundEditor 연속 편집", () => {
  /**
   * 첫 샘플에 1을 더하는 가짜 효과. 렌더링이 끝나지 않은 상태를 만들려고 resolve를 밖에서 부른다.
   * inputs에는 각 호출이 받은 입력 버퍼의 첫 샘플을 기록한다.
   */
  function deferredIncrementEffect() {
    const inputs: number[] = [];
    const pending: Array<() => void> = [];
    mockedApplyEffect.mockImplementation((buffer, _name, trimStart, trimEnd) => {
      const out = Float32Array.from(buffer.getChannelData(0));
      inputs.push(out[0] as number);
      out[0] = (out[0] as number) + 1;
      return new Promise((resolve) =>
        pending.push(() => resolve({ buffer: fakeAudioBuffer(out, 44100), trimStart, trimEnd })),
      );
    });
    /** 대기 중인 렌더링을 하나씩 끝낸다. 끝낸 뒤 이어서 시작된 렌더링도 끝낸다. */
    const flush = async () => {
      for (let i = 0; i < 10 && pending.length > 0; i++) {
        await act(async () => {
          pending.shift()?.();
        });
      }
    };
    return { inputs, flush };
  }

  it("효과 렌더링 중에 효과를 다시 누르면 첫 결과에 이어서 적용한다", async () => {
    const { result, onChange } = setup({ samples: new Float32Array(1000) });
    const { inputs, flush } = deferredIncrementEffect();
    await act(async () => {
      result.current.onEffect("higher");
      result.current.onEffect("higher");
    });
    await flush();
    expect(inputs).toEqual([0, 1]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(lastOnChange(onChange).samples[0]).toBe(2);
  });

  it("연속으로 적용한 효과는 undo 한 번에 한 단계씩 되돌린다", async () => {
    const { result, onChange } = setup({ samples: new Float32Array(1000) });
    const { flush } = deferredIncrementEffect();
    await act(async () => {
      result.current.onEffect("higher");
      result.current.onEffect("higher");
    });
    await flush();
    await act(async () => result.current.onUndo());
    await act(async () => result.current.onUndo());
    // 효과 2번, undo 2번이 보낸 첫 샘플 값 순서
    const emitted = onChange.mock.calls.map(
      ([buffer]) => (buffer as { samples: Float32Array }).samples[0],
    );
    expect(emitted).toEqual([1, 2, 1, 0]);
    expect(result.current.canUndo).toBe(false);
  });

  it("효과 렌더링 중에 Delete를 누르면 효과 결과에서 선택 구간을 지운다", async () => {
    const { result, onChange } = setup({ samples: new Float32Array(1000) });
    const { flush } = deferredIncrementEffect();
    await select(result, 0.5, 1);
    await act(async () => result.current.onEffect("higher"));
    await press("Delete");
    await flush();
    const final = lastOnChange(onChange);
    expect(final.samples.length).toBe(500);
    expect(final.samples[0]).toBe(1);
  });
});

describe("useSoundEditor 비동기 편집 중 선택 변경", () => {
  /** 다음 downsampleIfNeeded 호출을 release()를 부를 때까지 붙잡아 둔다. */
  function holdNextDownsample() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockedDownsample.mockImplementationOnce(async (buffer) => {
      await gate;
      return { samples: buffer.samples, sampleRate: buffer.sampleRate };
    });
    return async () => {
      await act(async () => release());
    };
  }

  /** 효과 렌더링을 release()를 부를 때까지 붙잡아 둔다. 결과는 입력을 그대로 돌려준다. */
  function holdEffect() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockedApplyEffect.mockImplementation(async (buffer, _name, trimStart, trimEnd) => {
      await gate;
      const out = Float32Array.from(buffer.getChannelData(0));
      out[0] = (out[0] as number) + 1;
      return { buffer: fakeAudioBuffer(out, 44100), trimStart, trimEnd };
    });
    return async () => {
      await act(async () => release());
    };
  }

  it("효과 렌더링 중에 선택을 바꿔도 undo는 효과를 시작할 때의 선택을 복원한다", async () => {
    const { result } = setup({ samples: new Float32Array(1000) });
    const finish = holdEffect();
    await select(result, 0.2, 0.4);
    await act(async () => result.current.onEffect("higher"));
    await select(result, 0.6, 0.8);
    await finish();
    await act(async () => result.current.onUndo());
    expect(result.current.trimStart).toBe(0.2);
    expect(result.current.trimEnd).toBe(0.4);
  });

  it("선택 없이 시작한 효과가 끝나도 그사이에 만든 선택을 지우지 않는다", async () => {
    const { result } = setup({ samples: new Float32Array(1000) });
    const finish = holdEffect();
    await act(async () => result.current.onEffect("higher"));
    await select(result, 0.6, 0.8);
    await finish();
    expect(result.current.trimStart).toBe(0.6);
    expect(result.current.trimEnd).toBe(0.8);
    // undo는 효과를 시작할 때의 선택 없음 상태를 복원한다
    await act(async () => result.current.onUndo());
    expect(result.current.trimStart).toBeNull();
    expect(result.current.trimEnd).toBeNull();
  });

  it("선택 있이 시작한 효과는 렌더링 중에 선택을 지워도 결과 선택을 적용한다", async () => {
    const { result } = setup({ samples: new Float32Array(1000) });
    const finish = holdEffect();
    await select(result, 0.2, 0.4);
    await act(async () => result.current.onEffect("higher"));
    await select(result, null, null);
    await finish();
    // 가짜 효과는 받은 선택을 그대로 결과 선택으로 돌려준다
    expect(result.current.trimStart).toBe(0.2);
    expect(result.current.trimEnd).toBe(0.4);
  });

  it("삭제 처리 중에 선택을 바꿔도 undo는 삭제한 구간의 선택을 복원한다", async () => {
    const { result } = setup();
    const finish = holdNextDownsample();
    await select(result, 0.2, 0.4);
    await press("Delete");
    await select(result, 0.6, 0.8);
    await finish();
    await waitFor(() => expect(result.current.canUndo).toBe(true));
    await act(async () => result.current.onUndo());
    expect(result.current.trimStart).toBe(0.2);
    expect(result.current.trimEnd).toBe(0.4);
  });

  it("붙이기 처리 중에 선택을 바꿔도 undo는 붙여 넣은 자리의 선택을 복원한다", async () => {
    const { result } = setup();
    await select(result, 0.1, 0.2);
    await act(async () => result.current.onCopy());
    await select(result, 0.5, 0.6);
    const finish = holdNextDownsample();
    await act(async () => result.current.onPaste());
    await select(result, 0.8, 0.9);
    await finish();
    await waitFor(() => expect(result.current.canUndo).toBe(true));
    await act(async () => result.current.onUndo());
    expect(result.current.trimStart).toBe(0.5);
    expect(result.current.trimEnd).toBe(0.6);
  });
});

describe("useSoundEditor 리샘플 대기 중 선택 변경", () => {
  it("붙이기 전 리샘플을 기다리는 동안 선택을 바꿔도 시작할 때의 선택 자리에 붙이고 undo도 그 선택을 복원한다", async () => {
    const { result, rerender, initial, onChange } = setup({
      samples: ramp(100),
      sampleRate: 44100,
    });
    await press("c", { ctrlKey: true }); // 44100Hz, 100샘플 전체
    rerender({ ...initial, samples: ramp(40), sampleRate: 22050 });
    await waitFor(() => expect(FakeAudioBufferPlayer.last.buffer.length).toBe(40));
    await select(result, 0.5, 0.75);

    // 다음 리샘플(클립을 22050Hz로 맞추는 호출)을 붙잡아 둔다
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let resampled: { samples: Float32Array; sampleRate: number } | undefined;
    mockedResample.mockImplementationOnce(async (buffer, rate) => {
      await gate;
      resampled = await actualResample(buffer, rate);
      return resampled;
    });
    await press("v", { ctrlKey: true });
    await select(result, 0, 0.25);
    await act(async () => release());
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

    const target = { samples: ramp(40), sampleRate: 22050 };
    const expected = pasteClip(target, resampled!, 0.5, 0.75);
    expect(Array.from(lastOnChange(onChange).samples)).toEqual(Array.from(expected.samples));
    expect(result.current.trimStart).toBe(expected.trimStart);
    expect(result.current.trimEnd).toBe(expected.trimEnd);

    await act(async () => result.current.onUndo());
    expect(result.current.trimStart).toBe(0.5);
    expect(result.current.trimEnd).toBe(0.75);
  });
});

describe("useSoundEditor 입력 samples 변경", () => {
  it("다른 소리로 바뀌면 이력과 선택을 지우고 새 재생기를 만든다", async () => {
    const { result, rerender, initial } = setup();
    await select(result, 0.25, 0.75);
    await press("Delete");
    await waitFor(() => expect(result.current.canUndo).toBe(true));

    rerender({ ...initial, samples: ramp(300) });
    await waitFor(() => expect(result.current.canUndo).toBe(false));
    expect(result.current.trimStart).toBeNull();
    expect(FakeAudioBufferPlayer.last.buffer.length).toBe(300);
  });

  it("빈 samples로 바뀌어도 예외 없이 무음 1샘플 재생기로 바꾼다", async () => {
    const { result, rerender, initial, onChange } = setup();
    rerender({ ...initial, samples: new Float32Array(0) });
    await act(async () => {});
    expect(FakeAudioBufferPlayer.last.buffer.length).toBe(1);
    expect(result.current.chunkLevels).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("부모가 방금 편집한 결과를 복사해 되돌려 줘도 이력을 지우지 않는다", async () => {
    const { result, rerender, initial, onChange } = setup();
    await select(result, 0.25, 0.75);
    await press("Delete");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const emitted = lastOnChange(onChange);
    // 부모가 같은 내용을 새 배열로 되돌려 주는 경우
    rerender({
      ...initial,
      samples: Float32Array.from(emitted.samples),
      sampleRate: emitted.sampleRate,
    });
    await act(async () => {});
    expect(result.current.canUndo).toBe(true);
  });
});

describe("useSoundEditor 입력 samples 반영 빠른 경로", () => {
  /** 선택 구간을 지워 onChange로 내보낸 결과를 돌려준다. */
  async function editOnce(ctx: ReturnType<typeof setup>) {
    await select(ctx.result, 0.25, 0.75);
    await press("Delete");
    await waitFor(() => expect(ctx.onChange).toHaveBeenCalledTimes(1));
    return lastOnChange(ctx.onChange);
  }

  it("방금 내보낸 배열과 같은 참조가 돌아오면 내용을 비교하지 않는다", async () => {
    const ctx = setup();
    const emitted = await editOnce(ctx);
    const compare = vi.spyOn(FakeAudioBufferPlayer.last.buffer, "getChannelData");
    ctx.rerender({ ...ctx.initial, samples: emitted.samples, sampleRate: emitted.sampleRate });
    await act(async () => {});
    expect(compare).not.toHaveBeenCalled();
    expect(ctx.result.current.canUndo).toBe(true);
  });

  it("같은 내용의 다른 배열이 돌아오면 내용을 비교해 같은 소리로 본다", async () => {
    const ctx = setup();
    const emitted = await editOnce(ctx);
    const players = FakeAudioBufferPlayer.instances.length;
    const compare = vi.spyOn(FakeAudioBufferPlayer.last.buffer, "getChannelData");
    ctx.rerender({
      ...ctx.initial,
      samples: Float32Array.from(emitted.samples),
      sampleRate: emitted.sampleRate,
    });
    await act(async () => {});
    expect(compare).toHaveBeenCalled();
    expect(ctx.result.current.canUndo).toBe(true);
    expect(FakeAudioBufferPlayer.instances.length).toBe(players);
  });

  it("같은 참조라도 샘플레이트가 다르면 다른 소리로 본다", async () => {
    const ctx = setup();
    const emitted = await editOnce(ctx);
    ctx.rerender({ ...ctx.initial, samples: emitted.samples, sampleRate: 48000 });
    await act(async () => {});
    expect(ctx.result.current.canUndo).toBe(false);
    expect(FakeAudioBufferPlayer.last.buffer.sampleRate).toBe(48000);
  });

  it("다른 소리로 바뀐 뒤 이전에 내보낸 배열이 다시 들어와도 건너뛰지 않고 새로 반영한다", async () => {
    const ctx = setup();
    const emitted = await editOnce(ctx);
    ctx.rerender({ ...ctx.initial, samples: emitted.samples, sampleRate: emitted.sampleRate });
    await act(async () => {});
    // 다른 소리로 바뀐다
    ctx.rerender({ ...ctx.initial, samples: ramp(300) });
    await act(async () => {});
    expect(FakeAudioBufferPlayer.last.buffer.length).toBe(300);
    // 이전에 내보낸 배열이 다시 선택된다
    ctx.rerender({ ...ctx.initial, samples: emitted.samples, sampleRate: emitted.sampleRate });
    await act(async () => {});
    expect(FakeAudioBufferPlayer.last.buffer.length).toBe(emitted.samples.length);
    expect(ctx.result.current.canUndo).toBe(false);
  });
});

describe("useSoundEditor onError", () => {
  it("효과 렌더링이 실패하면 kind effect와 원인을 알린다", async () => {
    const { result, onError } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("render failed");
    mockedApplyEffect.mockRejectedValue(cause);
    await act(async () => result.current.onEffect("echo"));
    await act(async () => {});
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({ kind: "effect", cause });
  });

  it("편집 결과가 너무 커서 거부되면 kind apply를 알리고 onChange는 부르지 않는다", async () => {
    const { result, onChange, onError } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("Sound too large to save, refusing to edit");
    mockedDownsample.mockRejectedValueOnce(cause);
    await select(result, 0.25, 0.75);
    await press("Delete");
    await act(async () => {});
    expect(onError).toHaveBeenCalledWith({ kind: "apply", cause });
    expect(onChange).not.toHaveBeenCalled();
    // 실패했으므로 선택이 남아 있다
    expect(result.current.trimStart).toBe(0.25);
  });

  it("복사한 소리의 샘플레이트를 맞추지 못하면 kind paste를 알린다", async () => {
    const { result, rerender, initial, onError } = setup({ sampleRate: 44100 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await press("c", { ctrlKey: true });
    // 다른 샘플레이트의 소리가 들어오면 붙이기 전에 리샘플이 필요하다. jsdom에는 OfflineAudioContext가 없어 실패한다
    rerender({ ...initial, samples: ramp(300), sampleRate: 48000 });
    await act(async () => {});
    await press("v", { ctrlKey: true });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0]?.[0].kind).toBe("paste");
    expect(result.current.canUndo).toBe(false);
  });

  it("성공한 편집에서는 onError를 부르지 않는다", async () => {
    const { result, onChange, onError } = setup();
    await select(result, 0.25, 0.75);
    await press("Delete");
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onError).not.toHaveBeenCalled();
  });

  it("onError가 예외를 던져도 편집 흐름이 깨지지 않는다", async () => {
    const { result, onError } = setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    onError.mockImplementation(() => {
      throw new Error("callback failed");
    });
    mockedApplyEffect.mockRejectedValue(new Error("render failed"));
    await act(async () => result.current.onEffect("echo"));
    await act(async () => {});
    expect(consoleError).toHaveBeenCalledWith("onError 콜백이 예외를 던졌다", expect.any(Error));
  });

  it("unmount된 뒤의 실패는 알리지 않는다", async () => {
    const { result, unmount, onError } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let reject!: (e: Error) => void;
    mockedApplyEffect.mockReturnValue(new Promise((_, r) => (reject = r)));
    await act(async () => result.current.onEffect("reverse"));
    unmount();
    await act(async () => {
      reject(new Error("late failure"));
    });
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("useSoundEditor busy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** 효과 렌더링을 release()를 부를 때까지 붙잡아 둔다. 결과는 입력을 그대로 돌려준다. */
  function holdEffect() {
    const releases: Array<() => void> = [];
    mockedApplyEffect.mockImplementation(
      (buffer, _name, trimStart, trimEnd) =>
        new Promise((resolve) =>
          releases.push(() =>
            resolve({
              buffer: fakeAudioBuffer(buffer.getChannelData(0), 44100),
              trimStart,
              trimEnd,
            }),
          ),
        ),
    );
    return async () => {
      await act(async () => releases.shift()?.());
    };
  }

  const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

  it("편집이 없으면 busy가 아니다", () => {
    const { result } = setup();
    expect(result.current.busy).toBe(false);
  });

  it("편집이 BUSY_DELAY_MS 전에는 busy가 아니고 넘으면 busy가 되며, 끝나면 바로 해제된다", async () => {
    const { result } = setup();
    const release = holdEffect();
    await act(async () => result.current.onEffect("faster"));
    await advance(BUSY_DELAY_MS - 1);
    expect(result.current.busy).toBe(false);
    await advance(1);
    expect(result.current.busy).toBe(true);
    await release();
    expect(result.current.busy).toBe(false);
  });

  it("효과가 실패해도 busy가 해제된다", async () => {
    const { result } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let reject!: (e: Error) => void;
    mockedApplyEffect.mockReturnValue(new Promise((_, r) => (reject = r)));
    await act(async () => result.current.onEffect("faster"));
    await advance(BUSY_DELAY_MS);
    expect(result.current.busy).toBe(true);
    await act(async () => reject(new Error("render failed")));
    expect(result.current.busy).toBe(false);
  });

  it("효과 처리 중 soundId를 바꿔도 결과를 버린 뒤 busy가 해제된다", async () => {
    const { result, rerender, initial, onChange } = setup({ soundId: "a" });
    const release = holdEffect();
    await act(async () => result.current.onEffect("faster"));
    await advance(BUSY_DELAY_MS);
    expect(result.current.busy).toBe(true);
    rerender({ ...initial, samples: ramp(300), soundId: "b" });
    await release();
    expect(result.current.busy).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("복사만 대기해도 busy 타이머는 울리기 전에 정리되어 busy가 되지 않는다", async () => {
    const { result } = setup();
    await act(async () => result.current.onCopy());
    expect(vi.getTimerCount()).toBe(0);
    await advance(BUSY_DELAY_MS * 5);
    expect(result.current.busy).toBe(false);
  });

  it("unmount하면 busy 타이머를 정리한다", async () => {
    const { result, unmount } = setup();
    holdEffect();
    await act(async () => result.current.onEffect("faster"));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("busy 중에도 키보드 단축키는 큐에 쌓이고 순서대로 처리된다", async () => {
    const { result, onChange } = setup();
    const release = holdEffect();
    await select(result, 0.5, 1);
    await act(async () => result.current.onEffect("faster"));
    await advance(BUSY_DELAY_MS);
    expect(result.current.busy).toBe(true);
    await press("Delete");
    await release();
    await act(async () => {});
    // 효과 결과 1회와 그 결과에서 선택을 지운 1회
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(lastOnChange(onChange).samples.length).toBe(500);
    expect(result.current.busy).toBe(false);
  });
});
