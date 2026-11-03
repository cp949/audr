// 단축키 도움말 팝오버: 열기·닫기, 목록과 handleKeyDown 대조, 에디터 상태와 간섭 없음
import { applyEffect } from "@cp949/audr-core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoundEditor } from "../src/components/SoundEditor";
import { getMessages } from "../src/i18n";
import { formatShortcut, SHORTCUT_HELP, type Shortcut } from "../src/lib/shortcuts";
import { FakeAudioBufferPlayer, ramp } from "./helpers/fakePlayer";

vi.mock("@cp949/audr-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cp949/audr-core")>();
  const { FakeAudioBufferPlayer } = await import("./helpers/fakePlayer");
  return { ...actual, AudioBufferPlayer: FakeAudioBufferPlayer, applyEffect: vi.fn() };
});

const mockedApplyEffect = vi.mocked(applyEffect);
const en = getMessages("en");

function setup(overrides: Partial<React.ComponentProps<typeof SoundEditor>> = {}) {
  return render(
    <SoundEditor
      samples={ramp(1000)}
      sampleRate={1000}
      name="Meow"
      onChange={vi.fn()}
      onCopyToNew={vi.fn()}
      onRename={vi.fn()}
      {...overrides}
    />,
  );
}

const toggle = () => screen.getByRole("button", { name: en.shortcutsToggle });
const editorRoot = (container: HTMLElement) => container.firstElementChild as HTMLElement;

/** 파형에 마우스로 구간을 끌어 선택한다 (컨테이너 폭은 1000으로 스텁) */
async function dragSelect(container: HTMLElement, from: number, to: number) {
  const selector = container.querySelector('[class*="selector"]') as HTMLElement;
  await act(async () => {
    fireEvent.mouseDown(selector, { clientX: from, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: to, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: to, clientY: 0 });
  });
}

beforeEach(() => {
  FakeAudioBufferPlayer.reset();
  mockedApplyEffect.mockReset();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 160,
    width: 1000,
    height: 160,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SoundEditor 단축키 도움말 팝오버 열기·닫기", () => {
  it("처음에는 닫혀 있고 목록이 없다", () => {
    setup();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().hasAttribute("aria-controls")).toBe(false);
    expect(document.querySelector("dl")).toBeNull();
  });

  it("버튼을 누르면 열려 aria-expanded와 aria-controls가 목록을 가리키고, 다시 누르면 닫힌다", () => {
    setup();
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const list = document.getElementById(toggle().getAttribute("aria-controls") as string);
    expect(list?.tagName).toBe("DL");
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("dl")).toBeNull();
  });

  it("목록은 동작 이름과 키를 짝지어 보이고 한국어 로케일이면 한국어 문구를 쓴다", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    setup({ locale: "ko" });
    fireEvent.click(screen.getByRole("button", { name: "단축키" }));
    const list = document.querySelector("dl") as HTMLElement;
    const terms = within(list).getAllByRole("term");
    expect(terms).toHaveLength(SHORTCUT_HELP.length);
    expect(terms[0]?.textContent).toBe("재생 / 멈추기");
    expect(terms[0]?.nextElementSibling?.textContent).toBe("Space");
    expect(list.textContent).toContain("Delete / Backspace");
    expect(list.textContent).toContain("Ctrl+Shift+Z");
  });

  it("Mac에서는 수정자를 ⌘와 ⇧로 보인다", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    setup();
    fireEvent.click(toggle());
    const text = (document.querySelector("dl") as HTMLElement).textContent as string;
    expect(text).toContain("⇧⌘Z");
    expect(text).toContain("⌘A");
    expect(text).toContain("⇧Delete / ⇧Backspace");
    expect(text).not.toContain("Ctrl");
  });

  it("편집 실패 알림이 떠도 열린 목록은 그대로다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedApplyEffect.mockRejectedValue(new Error("render failed"));
    setup();
    fireEvent.click(toggle());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.reverse })));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("dl")).not.toBeNull();
  });

  it("버튼은 시간 표시줄이 아니라 도구 줄에 있다", () => {
    const { container } = setup();
    const row = container.querySelector('[class*="row"]') as HTMLElement;
    expect(row.contains(toggle())).toBe(true);
  });

  it("바깥을 누르면 닫히고, 목록 안을 누르면 열린 채로 둔다", () => {
    setup();
    fireEvent.click(toggle());
    fireEvent.pointerDown(document.querySelector("dl") as HTMLElement);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("dl")).toBeNull();
  });
});

describe("SoundEditor 단축키 도움말과 handleKeyDown 대조", () => {
  /** 목록의 키 조합을 실제 키 이벤트 값으로 바꾼다. 수정자가 있으면 Ctrl과 ⌘를 모두 만든다 */
  function eventInits(shortcut: Shortcut): KeyboardEventInit[] {
    const key =
      shortcut.key === "Space"
        ? " "
        : shortcut.key.length === 1
          ? shortcut.key.toLowerCase()
          : shortcut.key;
    const base = { key, shiftKey: Boolean(shortcut.shift) };
    return shortcut.mod
      ? [
          { ...base, ctrlKey: true },
          { ...base, metaKey: true },
        ]
      : [base];
  }

  const cases = SHORTCUT_HELP.flatMap(({ action, keys }) =>
    keys.flatMap((shortcut) =>
      eventInits(shortcut).map((init) => ({
        name: `${action}: ${formatShortcut(shortcut, init.metaKey === true)}`,
        init,
      })),
    ),
  );

  /** 선택이 있고 undo·redo·paste가 가능한 상태로 만든다 */
  async function prepare() {
    const { container } = setup();
    // 편집 두 번 뒤 한 번 되돌려 undo와 redo가 모두 가능하게 하고, 복사로 클립보드를 채운 뒤 다시 선택한다
    const click = async (name: string) => {
      await act(async () => fireEvent.click(screen.getByRole("button", { name })));
    };
    await dragSelect(container, 250, 750);
    await click(en.copy);
    await click(en.delete);
    await dragSelect(container, 250, 750);
    await click(en.delete);
    await click(en.undo);
    await dragSelect(container, 250, 750);
    fireEvent.pointerDown(editorRoot(container));
  }

  it.each(cases)("목록의 $name 은(는) handleKeyDown이 처리한다", async ({ init }) => {
    await prepare();
    let notPrevented = true;
    await act(async () => {
      notPrevented = fireEvent.keyDown(document.body, init);
    });
    // 처리한 키는 preventDefault를 부른다. 처리하지 않으면 브라우저 기본 동작으로 돌아간다
    expect(notPrevented).toBe(false);
  });

  it("목록에 없는 Ctrl+Y와 Ctrl+Shift+C는 처리하지 않는다", async () => {
    await prepare();
    let ctrlY = false;
    let ctrlShiftC = false;
    await act(async () => {
      ctrlY = fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
      ctrlShiftC = fireEvent.keyDown(document.body, { key: "c", ctrlKey: true, shiftKey: true });
    });
    expect(ctrlY).toBe(true);
    expect(ctrlShiftC).toBe(true);
  });
});

describe("SoundEditor 단축키 도움말과 에디터 상태", () => {
  it("버튼을 눌러도 선택은 유지되고 재생은 시작하지 않는다", async () => {
    const { container } = setup();
    await dragSelect(container, 250, 750);
    fireEvent.mouseDown(toggle());
    fireEvent.click(toggle());
    expect(screen.getByText("Selection 0.25–0.75 s (0.50 s)")).toBeTruthy();
    expect(screen.getByRole("button", { name: en.delete })).toHaveProperty("disabled", false);
    expect(FakeAudioBufferPlayer.last.play).not.toHaveBeenCalled();
  });

  it("재생 중에 버튼을 눌러도 재생은 계속된다", async () => {
    setup();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.play })));
    await act(async () => FakeAudioBufferPlayer.last.onUpdate?.(0.2));
    // play()가 시작 전에 부른 stop()은 센 값에서 뺀다
    FakeAudioBufferPlayer.last.stop.mockClear();
    fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: en.stop })).toBeTruthy();
    expect(FakeAudioBufferPlayer.last.stop).not.toHaveBeenCalled();
  });

  it("버튼에 포커스가 있을 때 Space는 재생이 아니라 버튼을 누른다", async () => {
    const user = userEvent.setup();
    setup();
    act(() => toggle().focus());
    await user.keyboard(" ");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(FakeAudioBufferPlayer.last.play).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("목록이 열린 채 Esc를 누르면 목록만 닫고 선택은 유지하며, 한 번 더 누르면 선택을 해제한다", async () => {
    const { container } = setup();
    await dragSelect(container, 250, 750);
    fireEvent.pointerDown(editorRoot(container));
    fireEvent.click(toggle());
    await act(async () => fireEvent.keyDown(document.body, { key: "Escape" }));
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText(/Selection 0/)).toBeTruthy();
    await act(async () => fireEvent.keyDown(document.body, { key: "Escape" }));
    expect(screen.queryByText(/Selection 0/)).toBeNull();
  });
});
