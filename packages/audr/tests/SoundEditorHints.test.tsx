// 효과 버튼 힌트: 단축키 툴팁과 Louder 비활성 이유
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoundEditor } from "../src/components/SoundEditor";
import { getMessages } from "../src/i18n";
import { ariaKeyShortcuts, formatShortcut, isApplePlatform, SHORTCUTS } from "../src/lib/shortcuts";
import { FakeAudioBufferPlayer, ramp } from "./helpers/fakePlayer";

vi.mock("@cp949/audr-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cp949/audr-core")>();
  const { FakeAudioBufferPlayer } = await import("./helpers/fakePlayer");
  return { ...actual, AudioBufferPlayer: FakeAudioBufferPlayer };
});

const en = getMessages("en");

function setup(overrides: Partial<React.ComponentProps<typeof SoundEditor>> = {}) {
  return render(
    <SoundEditor
      samples={ramp(1000)}
      sampleRate={44100}
      name="Meow"
      onChange={vi.fn()}
      onCopyToNew={vi.fn()}
      onRename={vi.fn()}
      {...overrides}
    />,
  );
}

const button = (name: string) => screen.getByRole("button", { name });
const titleOf = (name: string) => button(name).getAttribute("title");

beforeEach(() => {
  FakeAudioBufferPlayer.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("단축키 표기 헬퍼", () => {
  it("Ctrl 표기와 ⌘ 표기를 플랫폼별로 만든다", () => {
    expect(formatShortcut(SHORTCUTS.undo, false)).toBe("Ctrl+Z");
    expect(formatShortcut(SHORTCUTS.redo, false)).toBe("Ctrl+Shift+Z");
    expect(formatShortcut(SHORTCUTS.undo, true)).toBe("⌘Z");
    expect(formatShortcut(SHORTCUTS.redo, true)).toBe("⇧⌘Z");
    expect(formatShortcut(SHORTCUTS.delete, true)).toBe("Delete");
  });

  it("aria-keyshortcuts는 수정자가 있으면 Control과 Meta 조합을 함께 적는다", () => {
    expect(ariaKeyShortcuts(SHORTCUTS.copy)).toBe("Control+C Meta+C");
    expect(ariaKeyShortcuts(SHORTCUTS.redo)).toBe("Control+Shift+Z Meta+Shift+Z");
    expect(ariaKeyShortcuts(SHORTCUTS.playStop)).toBe("Space");
  });

  it("navigator가 없거나 platform을 알 수 없으면 Apple이 아니다", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isApplePlatform()).toBe(false);
    vi.stubGlobal("navigator", {});
    expect(isApplePlatform()).toBe(false);
  });

  it("userAgentData.platform을 platform보다 먼저 본다", () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgentData: { platform: "macOS" } });
    expect(isApplePlatform()).toBe(true);
  });
});

describe("SoundEditor 단축키 툴팁", () => {
  it("Ctrl 플랫폼에서는 title에 Ctrl 표기가 붙는다", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    setup();
    expect(titleOf(en.undo)).toBe("Undo (Ctrl+Z)");
    expect(titleOf(en.redo)).toBe("Redo (Ctrl+Shift+Z)");
    expect(titleOf(en.copy)).toBe("Copy (Ctrl+C)");
    expect(titleOf(en.paste)).toBe("Paste (Ctrl+V)");
    expect(titleOf(en.play)).toBe("Play (Space)");
  });

  it("Mac 플랫폼에서는 ⌘ 표기를 쓴다", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    setup();
    expect(titleOf(en.undo)).toBe("Undo (⌘Z)");
    expect(titleOf(en.redo)).toBe("Redo (⇧⌘Z)");
    expect(titleOf(en.paste)).toBe("Paste (⌘V)");
  });

  it("navigator가 없으면 Ctrl로 둔다", () => {
    vi.stubGlobal("navigator", undefined);
    setup();
    expect(titleOf(en.undo)).toBe("Undo (Ctrl+Z)");
  });

  it("title을 붙여도 getByRole의 이름은 라벨 그대로 찾힌다", () => {
    setup();
    for (const label of [en.undo, en.redo, en.copy, en.paste, en.play]) {
      expect(button(label)).toBeTruthy();
    }
  });

  it("aria-keyshortcuts를 버튼마다 알린다", () => {
    setup();
    const keys = (name: string) => button(name).getAttribute("aria-keyshortcuts");
    expect(keys(en.undo)).toBe("Control+Z Meta+Z");
    expect(keys(en.redo)).toBe("Control+Shift+Z Meta+Shift+Z");
    expect(keys(en.copy)).toBe("Control+C Meta+C");
    expect(keys(en.paste)).toBe("Control+V Meta+V");
    expect(keys(en.play)).toBe("Space");
  });

  it("재생 중 정지 버튼에도 Space 단축키가 붙는다", async () => {
    setup();
    await act(async () => fireEvent.click(button(en.play)));
    act(() => FakeAudioBufferPlayer.last.onUpdate?.(0.4));
    expect(titleOf(en.stop)).toBe("Stop (Space)");
    expect(button(en.stop).getAttribute("aria-keyshortcuts")).toBe("Space");
  });

  it("복사 후 붙이기 활성 상태에서도 title은 같다", async () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    setup();
    await act(async () => fireEvent.click(button(en.copy)));
    expect(button(en.paste)).toHaveProperty("disabled", false);
    expect(titleOf(en.paste)).toBe("Paste (Ctrl+V)");
  });
});

describe("SoundEditor Louder 비활성 이유", () => {
  /** 풀스케일 샘플은 레벨이 약 1.35라 Louder가 막힌다 */
  const loud = () => new Float32Array(3072).fill(1);

  it("tooLoud이면 title과 aria-describedby 숨김 텍스트로 이유를 알린다", () => {
    setup({ samples: loud() });
    const louder = button(en.louder);
    expect(louder).toHaveProperty("disabled", true);
    expect(louder.getAttribute("title")).toBe(en.tooLoudHint);
    // 첫 id가 이유, 뒤 id가 적용 범위다
    const ids = (louder.getAttribute("aria-describedby") as string).split(" ");
    expect(ids).toHaveLength(2);
    const [reasonId, scopeId] = ids;
    expect(document.getElementById(reasonId as string)?.textContent).toBe(en.tooLoudHint);
    expect(document.getElementById(scopeId as string)?.textContent).toBe(en.effectScopeWhole);
  });

  it("이유 문구는 aria-hidden이라 접근 가능한 이름에 섞이지 않는다", () => {
    setup({ samples: loud() });
    // 이름이 "Louder Too loud…"로 바뀌면 문자열 이름 조회(완전 일치)가 실패한다
    expect(screen.getByRole("button", { name: en.louder })).toBeTruthy();
    const [reasonId] = (button(en.louder).getAttribute("aria-describedby") as string).split(" ");
    const hint = document.getElementById(reasonId as string);
    expect(hint?.getAttribute("aria-hidden")).toBe("true");
  });

  it("조용한 소리에서는 이유 설명 요소가 없고 aria-describedby는 적용 범위만 가리킨다", () => {
    const { container } = setup({ samples: new Float32Array(3072).fill(0.1) });
    expect(button(en.louder)).toHaveProperty("disabled", false);
    const describedBy = button(en.louder).getAttribute("aria-describedby") as string;
    expect(describedBy.split(" ")).toHaveLength(1);
    expect(document.getElementById(describedBy)?.textContent).toBe(en.effectScopeWhole);
    expect(button(en.louder).hasAttribute("title")).toBe(false);
    expect(container.textContent).not.toContain(en.tooLoudHint);
  });

  it("이유가 없는 비활성 버튼(붙이기)에는 설명을 붙이지 않는다", () => {
    setup();
    expect(button(en.paste)).toHaveProperty("disabled", true);
    expect(button(en.paste).hasAttribute("aria-describedby")).toBe(false);
  });

  it("한국어 로케일은 한국어 이유를 쓴다", () => {
    const ko = getMessages("ko");
    setup({ samples: loud(), locale: "ko" });
    expect(button(ko.louder).getAttribute("title")).toBe(ko.tooLoudHint);
    expect(ko.tooLoudHint).not.toBe(en.tooLoudHint);
  });
});
