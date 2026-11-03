// effectsLayout: "expanded"(기본) / "minimized"(버튼 하나 + 팝오버) / "overflow"(한 줄 + ⋯ 팝오버)의 열기·닫기와 포커스.
// jsdom에는 레이아웃이 없으므로 "overflow"의 줄 수는 offsetTop 대역으로 흉내 낸다.
// 실제 폭에서 줄이 나뉘는 모습은 apps/demo/e2e/effects.spec.ts가 본다. 규칙은 docs/design/05-effect-panel-layout.md를 따른다.
import { applyEffect } from "@cp949/audr-core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_OVERFLOW_BELOW } from "../src/components/EffectPanel";
import { SoundEditor } from "../src/components/SoundEditor";
import { getMessages } from "../src/i18n";
import { FakeAudioBufferPlayer, ramp } from "./helpers/fakePlayer";

vi.mock("@cp949/audr-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cp949/audr-core")>();
  const { FakeAudioBufferPlayer } = await import("./helpers/fakePlayer");
  return { ...actual, AudioBufferPlayer: FakeAudioBufferPlayer, applyEffect: vi.fn() };
});

const mockedApplyEffect = vi.mocked(applyEffect);
const en = getMessages("en");

function setup(effectsLayout?: "expanded" | "minimized" | "overflow" | "auto") {
  return render(
    <SoundEditor
      samples={ramp(1000)}
      sampleRate={1000}
      name="Meow"
      onChange={vi.fn()}
      onCopyToNew={vi.fn()}
      onRename={vi.fn()}
      effectsLayout={effectsLayout}
    />,
  );
}

const effectsButton = () => screen.getByRole("button", { name: new RegExp(`^${en.effects}`) });
const queryEffectsButton = () =>
  screen.queryByRole("button", { name: new RegExp(`^${en.effects}`) });
const moreButton = () => screen.getByRole("button", { name: en.moreEffects });
const louder = () => screen.queryByRole("button", { name: en.louder });

/** 한 번 누른 효과가 끝나지 않게 둬서 호출만 확인한다 */
function pendingEffect() {
  mockedApplyEffect.mockReturnValue(new Promise(() => {}));
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

describe("effectsLayout 기본값과 expanded", () => {
  it("생략하면 효과 버튼 19개가 바로 보이고 Effects 버튼과 더보기 버튼은 없다", () => {
    setup();
    const group = screen.getByRole("group", { name: en.effects });
    expect(within(group).getAllByRole("button")).toHaveLength(19);
    expect(queryEffectsButton()).toBeNull();
    expect(screen.queryByRole("button", { name: en.moreEffects })).toBeNull();
  });
});

describe("effectsLayout minimized", () => {
  it("처음에는 Effects 버튼만 있고 효과 버튼은 없다", () => {
    setup("minimized");
    expect(effectsButton().getAttribute("aria-expanded")).toBe("false");
    expect(effectsButton().hasAttribute("aria-controls")).toBe(false);
    expect(louder()).toBeNull();
    expect(screen.queryByRole("group", { name: en.effects })).toBeNull();
  });

  it("누르면 팝오버에 효과 버튼 19개가 나오고 aria-controls가 그 상자를 가리킨다", () => {
    setup("minimized");
    fireEvent.click(effectsButton());
    expect(effectsButton().getAttribute("aria-expanded")).toBe("true");
    const group = screen.getByRole("group", { name: en.effects });
    expect(group.id).toBe(effectsButton().getAttribute("aria-controls"));
    expect(within(group).getAllByRole("button")).toHaveLength(19);
  });

  it("효과를 적용하면 효과가 호출되고 팝오버가 닫히며 포커스가 Effects 버튼으로 돌아온다", async () => {
    pendingEffect();
    setup("minimized");
    fireEvent.click(effectsButton());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.reverse })));
    expect(mockedApplyEffect).toHaveBeenCalledTimes(1);
    expect(effectsButton().getAttribute("aria-expanded")).toBe("false");
    expect(louder()).toBeNull();
    expect(document.activeElement).toBe(effectsButton());
  });

  it("Esc로 닫으면 포커스가 Effects 버튼으로 돌아온다", () => {
    setup("minimized");
    fireEvent.click(effectsButton());
    screen.getByRole("button", { name: en.reverse }).focus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    expect(effectsButton().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(effectsButton());
  });

  it("바깥을 누르면 닫히고 안쪽을 누르는 것은 닫지 않는다", () => {
    setup("minimized");
    fireEvent.click(effectsButton());
    fireEvent.pointerDown(screen.getByRole("group", { name: en.effects }));
    expect(effectsButton().getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(effectsButton().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("effectsLayout overflow", () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");

  /** 효과 상자의 자식 중 앞 `firstRow`개만 첫 줄(offsetTop 0)에 있고 나머지는 둘째 줄이다 */
  function stubRows(firstRow: number) {
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get(this: HTMLElement) {
        const index = Array.from(this.parentElement?.children ?? []).indexOf(this);
        return index < firstRow ? 0 : 30;
      },
    });
  }

  afterEach(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, "offsetTop", original);
  });

  const clipped = () => document.querySelectorAll("[data-clipped]");

  it("모두 첫 줄에 들어가면 더보기 버튼이 없고 가려진 버튼도 없다", () => {
    setup("overflow");
    expect(screen.queryByRole("button", { name: en.moreEffects })).toBeNull();
    expect(clipped()).toHaveLength(0);
  });

  it("첫 줄에 못 들어간 버튼은 가려지고 더보기 버튼이 생긴다", () => {
    stubRows(5);
    setup("overflow");
    expect(moreButton().getAttribute("aria-expanded")).toBe("false");
    expect(clipped()).toHaveLength(14);
    // 가려진 것은 첫 줄 다음 버튼부터다
    expect(louder()?.hasAttribute("data-clipped")).toBe(false);
    expect(screen.getByRole("button", { name: en.alien }).hasAttribute("data-clipped")).toBe(true);
  });

  it("더보기를 누르면 가려진 버튼이 모두 보이고 다시 누르면 가려진다", () => {
    stubRows(5);
    setup("overflow");
    fireEvent.click(moreButton());
    expect(moreButton().getAttribute("aria-expanded")).toBe("true");
    expect(clipped()).toHaveLength(0);
    fireEvent.click(moreButton());
    expect(clipped()).toHaveLength(14);
  });

  it("효과를 적용하면 닫히고 포커스가 더보기 버튼으로 돌아온다", async () => {
    pendingEffect();
    stubRows(5);
    setup("overflow");
    fireEvent.click(moreButton());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.alien })));
    expect(mockedApplyEffect).toHaveBeenCalledTimes(1);
    expect(moreButton().getAttribute("aria-expanded")).toBe("false");
    expect(clipped()).toHaveLength(14);
    expect(document.activeElement).toBe(moreButton());
  });

  it("Esc로 닫으면 포커스가 더보기 버튼으로 돌아온다", () => {
    stubRows(5);
    setup("overflow");
    fireEvent.click(moreButton());
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(moreButton().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(moreButton());
  });
});

describe("effectsLayout auto", () => {
  const originalTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
  const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");

  /** 모든 요소의 clientWidth를 같은 값으로 돌려 효과 상자 폭을 정한다. 칩은 앞 5개만 첫 줄에 둔다 */
  function stubLayout(width: number) {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => width,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get(this: HTMLElement) {
        const index = Array.from(this.parentElement?.children ?? []).indexOf(this);
        return index < 5 ? 0 : 30;
      },
    });
  }

  afterEach(() => {
    if (originalTop) Object.defineProperty(HTMLElement.prototype, "offsetTop", originalTop);
    if (originalWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalWidth);
  });

  it("폭을 잴 수 없으면(jsdom) 펼친다", () => {
    setup("auto");
    expect(screen.queryByRole("button", { name: en.moreEffects })).toBeNull();
    expect(
      within(screen.getByRole("group", { name: en.effects })).getAllByRole("button"),
    ).toHaveLength(19);
  });

  it("기준 폭 이상이면 펼치고 미만이면 첫 줄만 보이고 더보기 버튼이 생긴다", () => {
    stubLayout(AUTO_OVERFLOW_BELOW);
    const wide = setup("auto");
    expect(screen.queryByRole("button", { name: en.moreEffects })).toBeNull();
    expect(document.querySelectorAll("[data-clipped]")).toHaveLength(0);
    wide.unmount();

    stubLayout(AUTO_OVERFLOW_BELOW - 1);
    setup("auto");
    expect(moreButton().getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelectorAll("[data-clipped]")).toHaveLength(14);
  });
});
