import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { applyEffect } from "@cp949/audr-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoundEditor } from "../src/components/SoundEditor";
import { getMessages } from "../src/i18n";
import { VISIBLE_EFFECTS } from "./effectButtons";
import { fakeAudioBuffer, FakeAudioBufferPlayer, ramp } from "./helpers/fakePlayer";

vi.mock("@cp949/audr-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cp949/audr-core")>();
  const { FakeAudioBufferPlayer } = await import("./helpers/fakePlayer");
  return { ...actual, AudioBufferPlayer: FakeAudioBufferPlayer, applyEffect: vi.fn() };
});

const mockedApplyEffect = vi.mocked(applyEffect);
const en = getMessages("en");
/** 화면에 보이는 효과 버튼 18개의 영어 이름(화면 순서) */
const effectLabels = VISIBLE_EFFECTS.map(({ label }) => en[label]);

function setup(overrides: Partial<React.ComponentProps<typeof SoundEditor>> = {}) {
  const onChange = vi.fn();
  const onCopyToNew = vi.fn();
  const onRename = vi.fn();
  const utils = render(
    <SoundEditor
      samples={ramp(1000)}
      sampleRate={44100}
      name="Meow"
      onChange={onChange}
      onCopyToNew={onCopyToNew}
      onRename={onRename}
      {...overrides}
    />,
  );
  return { ...utils, onChange, onCopyToNew, onRename };
}

/** 파형 컨테이너에 마우스로 구간을 끌어 선택한다 (컨테이너 폭은 1000으로 스텁) */
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

describe("SoundEditor 레이아웃", () => {
  it("버튼이 3행 순서(undo·redo / copy·paste·copy to new·delete / 재생 + 효과 18개)에 이어 시간 표시줄의 단축키 버튼으로 나온다", () => {
    setup();
    const names = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names).toEqual([
      en.undo,
      en.redo,
      en.copy,
      en.paste,
      en.copyToNew,
      en.delete,
      en.play,
      ...effectLabels,
      en.shortcutsToggle,
    ]);
  });

  it("음소거 버튼은 보이지 않는다", () => {
    const { unmount } = setup();
    expect(screen.queryByRole("button", { name: en.mute })).toBeNull();
    unmount();
    setup({ locale: "ko" });
    expect(screen.queryByRole("button", { name: getMessages("ko").mute })).toBeNull();
  });

  it("효과 버튼은 9칸 × 2줄 영역에 DOM 순서대로 들어 있다", () => {
    setup();
    const buttons = effectLabels.map((name) => screen.getByRole("button", { name }));
    const grid = buttons[0]?.parentElement as HTMLElement;
    expect(buttons.every((b) => b.parentElement === grid)).toBe(true);
    expect(grid.className).toContain("effectGrid");
    expect(Array.from(grid.children)).toEqual(buttons);
    expect(buttons).toHaveLength(18);
  });

  it("undo, redo, 재생 버튼의 aria-label은 i18n 영어 문자열이고 title은 그 문자열로 시작한다", () => {
    setup();
    for (const label of [en.undo, en.redo, en.play]) {
      const button = screen.getByRole("button", { name: label });
      expect(button.getAttribute("aria-label")).toBe(label);
      expect(button.getAttribute("title")?.startsWith(`${label} (`)).toBe(true);
    }
  });

  it("이름 입력에 name이 들어 있고 Sound 라벨이 붙는다", () => {
    setup({ name: "Meow" });
    expect(screen.getByLabelText(en.sound)).toHaveProperty("value", "Meow");
  });

  it("행은 3개이고 두 번째 행에 파형 SVG가 있다", () => {
    const { container } = setup();
    const rows = container.querySelectorAll('[class*="row"]');
    expect(rows.length).toBe(3);
    expect(rows[1]?.querySelector("svg")).not.toBeNull();
  });

  it("locale ko이면 한국어 문자열을 쓴다", () => {
    setup({ locale: "ko" });
    expect(screen.getByRole("button", { name: "복사" })).toBeTruthy();
    expect(screen.getByRole("button", { name: getMessages("ko").play })).toBeTruthy();
  });

  it("theme을 주면 에디터 루트에 data-audr-theme이 걸리고, 생략하면 걸리지 않는다", () => {
    const { container, rerender } = setup({ theme: "purple" });
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-audr-theme")).toBe("purple");
    rerender(
      <SoundEditor
        samples={ramp(1000)}
        sampleRate={44100}
        name="Meow"
        onChange={vi.fn()}
        onCopyToNew={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    expect(root.hasAttribute("data-audr-theme")).toBe(false);
  });
});

describe("SoundEditor 버튼 상태", () => {
  it("선택이 없으면 Delete가 비활성이고, 선택하면 활성이다", async () => {
    const { container } = setup();
    expect(screen.getByRole("button", { name: en.delete })).toHaveProperty("disabled", true);
    await dragSelect(container, 250, 750);
    expect(screen.getByRole("button", { name: en.delete })).toHaveProperty("disabled", false);
  });

  it("Paste는 copy 전에 비활성이고 Copy 후 활성이다", async () => {
    setup();
    expect(screen.getByRole("button", { name: en.paste })).toHaveProperty("disabled", true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.copy })));
    expect(screen.getByRole("button", { name: en.paste })).toHaveProperty("disabled", false);
  });

  it("Undo와 Redo는 처음에 비활성이다", () => {
    setup();
    expect(screen.getByRole("button", { name: en.undo })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: en.redo })).toHaveProperty("disabled", true);
  });

  it("너무 큰 소리이면 Louder만 비활성이다", () => {
    setup({ samples: new Float32Array(3072).fill(1) });
    expect(screen.getByRole("button", { name: en.louder })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: en.softer })).toHaveProperty("disabled", false);
  });

  it("풀스케일 입력에서 Louder만 비활성이고 나머지 효과 17개는 활성이다", () => {
    setup({ samples: new Float32Array(3072).fill(1) });
    for (const { label } of VISIBLE_EFFECTS) {
      const disabled = screen.getByRole<HTMLButtonElement>("button", { name: en[label] }).disabled;
      expect(disabled, label).toBe(label === "louder");
    }
  });

  it("한국어 로케일이면 효과 버튼 18개의 이름이 한국어 문구다", () => {
    setup({ locale: "ko" });
    const ko = getMessages("ko");
    for (const { label } of VISIBLE_EFFECTS) {
      expect(screen.getByRole("button", { name: ko[label] }), label).toBeTruthy();
    }
  });

  it("조용한 소리이면 Louder가 활성이다", () => {
    setup({ samples: new Float32Array(3072).fill(0.1) });
    expect(screen.getByRole("button", { name: en.louder })).toHaveProperty("disabled", false);
  });

  it("재생 중이면 Play 대신 Stop 버튼이 보인다", async () => {
    setup();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.play })));
    act(() => FakeAudioBufferPlayer.last.onUpdate?.(0.4));
    expect(screen.queryByRole("button", { name: en.play })).toBeNull();
    const stop = screen.getByRole("button", { name: en.stop });
    await act(async () => fireEvent.click(stop));
    expect(screen.getByRole("button", { name: en.play })).toBeTruthy();
  });
});

/**
 * 시간 표시줄. 샘플레이트 1000Hz에 1000샘플이라 전체가 1.00초다.
 * 표시는 화면용이라 aria-live가 없다. 문구와 갱신 시점만 고정한다.
 */
describe("SoundEditor 시간 표시줄", () => {
  const setupOneSecond = (overrides: Partial<React.ComponentProps<typeof SoundEditor>> = {}) =>
    setup({ samples: ramp(1000), sampleRate: 1000, ...overrides });

  it("선택과 재생이 없으면 전체 길이만 보인다", () => {
    setupOneSecond();
    expect(screen.getByText("1.00 s")).toBeTruthy();
    expect(screen.queryByText(/Selection/)).toBeNull();
    expect(screen.queryByText(/Playing/)).toBeNull();
  });

  it("선택하면 시작–끝과 선택 길이를 소수 둘째 자리 초로 보인다", async () => {
    const { container } = setupOneSecond();
    await dragSelect(container, 250, 750);
    expect(screen.getByText("0.25–0.75 s (0.50 s)")).toBeTruthy();
  });

  it("선택 범위는 숫자와 단위만 보이고 보조기기는 앞에 'Selection'을 붙여 읽는다", async () => {
    const { container } = setupOneSecond();
    await dragSelect(container, 250, 750);
    expect(screen.getByText("0.25–0.75 s (0.50 s)").getAttribute("aria-hidden")).toBe("true");
    expect(
      screen.getByText("Selection 0.25–0.75 s (0.50 s)").getAttribute("aria-hidden"),
    ).toBeNull();
  });

  it("전체 길이는 숫자와 단위만 보이고 보조기기는 앞에 '길이'를 붙여 읽는다", () => {
    setupOneSecond();
    const visible = screen.getByText("1.00 s");
    expect(visible.getAttribute("aria-hidden")).toBe("true");
    // 화면에는 보이지 않는 읽기용 문구
    expect(screen.getByText("Length 1.00 s").getAttribute("aria-hidden")).toBeNull();
    expect(screen.queryByText("Length")).toBeNull();
  });

  it("한국어 로케일이면 한국어 문구를 쓴다", async () => {
    const { container } = setupOneSecond({ locale: "ko" });
    expect(screen.getByText("1.00초")).toBeTruthy();
    expect(screen.getByText("길이 1.00초")).toBeTruthy();
    await dragSelect(container, 250, 750);
    expect(screen.getByText("0.25–0.75초 (0.50초)")).toBeTruthy();
    expect(screen.getByText("선택 0.25–0.75초 (0.50초)")).toBeTruthy();
  });

  it("선택 구간의 범위 문구는 파형 상자 안에 있고 시간 표시줄에는 없다", async () => {
    const { container } = setupOneSecond();
    await dragSelect(container, 250, 750);
    const label = screen.getByText("0.25–0.75 s (0.50 s)");
    expect(container.querySelector('[class*="waveformContainer"]')?.contains(label)).toBe(true);
    expect(container.querySelector('[class*="timeReadout"]')?.contains(label)).toBe(false);
  });

  it("적용 범위 문구는 선택 여부와 관계없이 화면에서 숨기고 효과 버튼의 설명으로만 남긴다", async () => {
    const { container } = setupOneSecond();
    const hidden = screen.getByText(en.effectScopeWhole);
    expect(hidden.className).toContain("visuallyHidden");
    // 효과 버튼의 설명이 가리키는 요소라 DOM에는 남는다
    const describedBy = screen
      .getByRole("button", { name: en.faster })
      .getAttribute("aria-describedby");
    expect(describedBy).toBe(hidden.id);
    await dragSelect(container, 250, 750);
    expect(screen.getByText(en.effectScopeSelection).className).toContain("visuallyHidden");
  });

  it.each(["guideHorizontal", "guideVertical"])(
    "파형 상자 안에 보조기기에서 숨긴 가운데 기준선(%s)이 있다",
    (name) => {
      const { container } = setupOneSecond();
      const guide = container.querySelector(`[class*="${name}"]`);
      expect(guide).not.toBeNull();
      expect(guide?.getAttribute("aria-hidden")).toBe("true");
      expect(container.querySelector('[class*="waveformContainer"]')?.contains(guide)).toBe(true);
    },
  );

  it("세로 기준선은 가로 폭의 25%, 50%, 75% 지점에 있다", () => {
    const { container } = setupOneSecond();
    const lefts = Array.from(
      container.querySelectorAll<HTMLElement>('[class*="guideVertical"]'),
    ).map((el) => el.style.left);
    expect(lefts).toEqual(["25%", "50%", "75%"]);
  });

  it("소수점 기호는 locale을 따른다", async () => {
    const { container } = setupOneSecond({ locale: "de" });
    expect(screen.getByText("1,00 s")).toBeTruthy();
    expect(screen.getByText("Length 1,00 s")).toBeTruthy();
    await dragSelect(container, 250, 750);
    expect(screen.getByText("0,25–0,75 s (0,50 s)")).toBeTruthy();
    expect(screen.getByText("Selection 0,25–0,75 s (0,50 s)")).toBeTruthy();
  });

  it("messages로 넘긴 문구가 locale 문구보다 우선하고 나머지는 locale 문구를 쓴다", () => {
    setupOneSecond({
      locale: "ko",
      messages: {
        timeLengthValue: "{seconds} Sek.",
        timeLength: "Dauer {seconds} s",
        play: "Abspielen",
      },
    });
    expect(screen.getByText("1.00 Sek.")).toBeTruthy();
    expect(screen.getByText("Dauer 1.00 s")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abspielen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "복사" })).toBeTruthy();
  });

  it("드래그하는 동안 확정 전 선택도 보이고, 선택이 해제되면 사라진다", async () => {
    const { container } = setupOneSecond();
    const selector = container.querySelector('[class*="selector"]') as HTMLElement;
    await act(async () => {
      fireEvent.mouseDown(selector, { clientX: 100, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 400, clientY: 0 });
    });
    // 마우스를 아직 떼지 않았다
    expect(screen.getByText("Selection 0.10–0.40 s (0.30 s)")).toBeTruthy();
    await act(async () => fireEvent.mouseUp(window, { clientX: 400, clientY: 0 }));
    expect(screen.getByText("Selection 0.10–0.40 s (0.30 s)")).toBeTruthy();
    await act(async () => fireEvent.mouseDown(container.firstElementChild as HTMLElement));
    expect(screen.queryByText(/Selection/)).toBeNull();
  });

  it("빠르게 클릭해 선택을 해제하면 마우스를 뗀 뒤 선택 문구가 남지 않는다", async () => {
    const { container } = setupOneSecond();
    await dragSelect(container, 250, 750);
    const selector = container.querySelector('[class*="selector"]') as HTMLElement;
    // 움직이지 않고 바로 떼면 tooFast·tooShort라 선택 해제로 처리된다
    await act(async () => {
      fireEvent.mouseDown(selector, { clientX: 500, clientY: 0 });
      fireEvent.mouseUp(window, { clientX: 500, clientY: 0 });
    });
    expect(screen.queryByText(/Selection/)).toBeNull();
  });

  it("핸들을 끄는 동안 바뀐 선택을 보이고, 뗀 뒤 확정된 선택을 보인다", async () => {
    const { container } = setupOneSecond();
    await dragSelect(container, 250, 750);
    const [startHandle] = screen.getAllByRole("slider");
    await act(async () => {
      fireEvent.mouseDown(startHandle as HTMLElement, { clientX: 250, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 100, clientY: 0 });
    });
    expect(screen.getByText("Selection 0.10–0.75 s (0.65 s)")).toBeTruthy();
    await act(async () => fireEvent.mouseUp(window, { clientX: 100, clientY: 0 }));
    expect(screen.getByText("Selection 0.10–0.75 s (0.65 s)")).toBeTruthy();
  });

  it("재생 중에만 재생 위치를 보인다", async () => {
    setupOneSecond();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.play })));
    act(() => FakeAudioBufferPlayer.last.onUpdate?.(0.37));
    expect(screen.getByText("Playing 0.37 s")).toBeTruthy();
    act(() => FakeAudioBufferPlayer.last.onUpdate?.(0.5));
    expect(screen.getByText("Playing 0.50 s")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.stop })));
    expect(screen.queryByText(/Playing/)).toBeNull();
  });

  it("편집, 되돌리기 뒤에 전체 길이를 새로 읽는다", async () => {
    const { container } = setupOneSecond();
    await dragSelect(container, 250, 750);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.delete })));
    await waitFor(() => expect(screen.getByText("0.50 s")).toBeTruthy());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.undo })));
    await waitFor(() => expect(screen.getByText("1.00 s")).toBeTruthy());
  });
});

/**
 * 효과 적용 범위 표시. 효과(Faster~Reverse)는 확정된 선택이 있으면 그 구간에, 없으면 소리 전체에 적용된다.
 * 문구는 효과 버튼 18개의 aria-describedby가 가리킨다. 접근 가능한 이름은 바뀌지 않는다.
 */
describe("SoundEditor 효과 적용 범위", () => {
  const scopeOf = (label: string) => {
    const ids = (screen.getByRole("button", { name: label }).getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter(Boolean);
    // 마지막 id가 적용 범위다(Louder는 앞에 비활성 이유가 올 수 있다)
    return document.getElementById(ids.at(-1) as string)?.textContent;
  };

  it("선택이 없으면 소리 전체, 선택하면 선택 구간이다", async () => {
    const { container } = setup({ sampleRate: 1000 });
    expect(screen.getByText(en.effectScopeWhole)).toBeTruthy();
    await dragSelect(container, 250, 750);
    expect(screen.getByText(en.effectScopeSelection)).toBeTruthy();
    expect(screen.queryByText(en.effectScopeWhole)).toBeNull();
  });

  it("한국어 로케일이면 한국어 문구를 쓴다", async () => {
    const ko = getMessages("ko");
    const { container } = setup({ locale: "ko" });
    expect(screen.getByText(ko.effectScopeWhole)).toBeTruthy();
    await dragSelect(container, 250, 750);
    expect(screen.getByText(ko.effectScopeSelection)).toBeTruthy();
  });

  it("지우기로 선택이 사라지면 전체로, undo로 선택이 복원되면 선택 구간으로 바뀐다", async () => {
    const { container } = setup({ sampleRate: 1000 });
    await dragSelect(container, 250, 750);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.delete })));
    await waitFor(() => expect(screen.getByText(en.effectScopeWhole)).toBeTruthy());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.undo })));
    await waitFor(() => expect(screen.getByText(en.effectScopeSelection)).toBeTruthy());
  });

  it("선택 없이 편집한 뒤 선택하고 undo하면 선택이 사라져 전체로 돌아간다", async () => {
    const { container, onChange } = setup({ sampleRate: 1000 });
    // 선택 없이 복사해서 붙이면 끝에 붙고, undo 이력에는 선택 없음이 남는다
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.copy })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.paste })));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    await dragSelect(container, 250, 750);
    expect(screen.getByText(en.effectScopeSelection)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.undo })));
    await waitFor(() => expect(screen.getByText(en.effectScopeWhole)).toBeTruthy());
  });

  it("효과 버튼 18개가 같은 범위 문구를 설명으로 읽고, 선택이 바뀌면 같은 요소의 문구가 따라 바뀐다", async () => {
    // 진폭이 작은 소리를 써서 Louder가 막히지 않게 한다
    const quiet = Float32Array.from({ length: 3000 }, (_, i) => 0.1 * Math.sin(i / 10));
    const { container } = setup({ samples: quiet });
    for (const label of effectLabels) expect(scopeOf(label)).toBe(en.effectScopeWhole);
    await dragSelect(container, 250, 750);
    for (const label of effectLabels) expect(scopeOf(label)).toBe(en.effectScopeSelection);
  });

  it("누른 채 0.5초 넘게 있다가 움직이지 않고 떼면 길이 0 선택이 확정되고, 효과는 전체가 아닌 그 지점에 적용된다", async () => {
    // 새 선택은 누르는 순간 길이 0으로 잡힌다. 느리게 떼면 풀리지 않고 그대로 확정된다
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      const { container } = setup({ sampleRate: 1000 });
      const selector = container.querySelector('[class*="selector"]') as HTMLElement;
      await act(async () => fireEvent.mouseDown(selector, { clientX: 500, clientY: 0 }));
      now.mockReturnValue(600);
      await act(async () => fireEvent.mouseUp(window, { clientX: 500, clientY: 0 }));
      expect(screen.getByText(en.effectScopeSelection)).toBeTruthy();
      expect(container.textContent).toContain("Selection 0.50–0.50 s (0.00 s)");
      mockedApplyEffect.mockImplementation(async (buffer, _name, trimStart, trimEnd) => ({
        buffer,
        trimStart,
        trimEnd,
      }));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: en.faster })));
      await waitFor(() => expect(mockedApplyEffect).toHaveBeenCalledTimes(1));
      expect(mockedApplyEffect.mock.calls[0]?.slice(2)).toEqual([0.5, 0.5]);
    } finally {
      now.mockRestore();
    }
  });

  it("빠르게 클릭해 선택이 풀리면 소리 전체로 돌아간다", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      const { container } = setup({ sampleRate: 1000 });
      await dragSelect(container, 250, 750);
      expect(screen.getByText(en.effectScopeSelection)).toBeTruthy();
      const selector = container.querySelector('[class*="selector"]') as HTMLElement;
      await act(async () => {
        fireEvent.mouseDown(selector, { clientX: 500, clientY: 0 });
        fireEvent.mouseUp(window, { clientX: 500, clientY: 0 });
      });
      expect(screen.getByText(en.effectScopeWhole)).toBeTruthy();
    } finally {
      now.mockRestore();
    }
  });

  it("범위 문구에는 aria-live를 달지 않는다", () => {
    setup();
    const scope = screen.getByText(en.effectScopeWhole);
    expect(scope.closest("[aria-live]")).toBeNull();
    expect(scope.closest('[role="alert"], [role="status"]')).toBeNull();
  });
});

describe("SoundEditor 상호작용", () => {
  it("파형 위를 끌면 선택이 생기고 Delete 버튼으로 지운다", async () => {
    const { container, onChange } = setup();
    await dragSelect(container, 250, 750);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.delete })));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0]?.[0].samples.length).toBe(500);
  });

  it("컨테이너 빈 곳을 누르면 선택이 해제된다", async () => {
    const { container } = setup();
    await dragSelect(container, 250, 750);
    expect(screen.getByRole("button", { name: en.delete })).toHaveProperty("disabled", false);
    const root = container.firstElementChild as HTMLElement;
    await act(async () => fireEvent.mouseDown(root));
    expect(screen.getByRole("button", { name: en.delete })).toHaveProperty("disabled", true);
  });

  it("효과 버튼은 해당 효과 이름으로 applyEffect를 부른다 (Louder는 higher, Softer는 lower)", async () => {
    setup();
    mockedApplyEffect.mockImplementation(async (buffer, _n, s, e) => ({
      buffer,
      trimStart: s,
      trimEnd: e,
    }));
    for (const { label, effect } of VISIBLE_EFFECTS) {
      await act(async () => fireEvent.click(screen.getByRole("button", { name: en[label] })));
      expect(mockedApplyEffect.mock.calls.at(-1)?.[1]).toBe(effect);
    }
    expect(mockedApplyEffect).toHaveBeenCalledTimes(18);
  });

  it("효과가 끝나면 onChange로 새 샘플을 알린다", async () => {
    const { onChange } = setup();
    mockedApplyEffect.mockResolvedValue({
      buffer: fakeAudioBuffer(ramp(600), 44100),
      trimStart: 0,
      trimEnd: 1,
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.faster })));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0]?.[0].samples.length).toBe(600);
  });

  it("Copy to New는 선택 구간을 onCopyToNew로 넘긴다", async () => {
    const { container, onCopyToNew } = setup();
    await dragSelect(container, 250, 750);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.copyToNew })));
    expect(onCopyToNew).toHaveBeenCalledTimes(1);
    expect(onCopyToNew.mock.calls[0]?.[0].samples.length).toBe(500);
  });

  it("이름을 바꾸고 포커스를 잃으면 onRename을 부른다", async () => {
    const { onRename } = setup();
    const input = screen.getByLabelText(en.sound) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Meow2" } });
    expect(onRename).not.toHaveBeenCalled(); // 입력 중에는 부르지 않는다
    expect(input.value).toBe("Meow2");
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith("Meow2");
  });

  it("이름 입력에서 Enter를 누르면 제출한다", () => {
    const { onRename } = setup();
    const input = screen.getByLabelText(en.sound) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Enter" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("Enter");
  });

  it("이름을 바꾸지 않고 blur하면 onRename을 부르지 않는다", () => {
    const { onRename } = setup();
    fireEvent.blur(screen.getByLabelText(en.sound));
    expect(onRename).not.toHaveBeenCalled();
  });

  it("이름 입력 중 Delete 키는 편집을 일으키지 않는다", async () => {
    const { container, onChange } = setup();
    await dragSelect(container, 250, 750);
    const input = screen.getByLabelText(en.sound);
    await act(async () => fireEvent.keyDown(input, { key: "Delete" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("unmount하면 재생기를 멈춘다", () => {
    const { unmount } = setup();
    const player = FakeAudioBufferPlayer.last;
    unmount();
    expect(player.stop).toHaveBeenCalled();
  });
});

describe("SoundEditor 단축키 범위", () => {
  /** body에서 keydown을 보낸다. 기본 동작을 막지 않았으면 true다 */
  async function pressOnBody(key: string, init: KeyboardEventInit = {}) {
    let notPrevented = true;
    await act(async () => {
      notPrevented = fireEvent.keyDown(document.body, { key, ...init });
    });
    return notPrevented;
  }

  const editorRoot = (container: HTMLElement) => container.firstElementChild as HTMLElement;

  it("에디터를 누르기 전에는 Space로 재생하지 않고 페이지 기본 동작도 막지 않는다", async () => {
    setup();
    expect(await pressOnBody(" ")).toBe(true);
    expect(FakeAudioBufferPlayer.last.play).not.toHaveBeenCalled();
  });

  it("에디터 안을 누른 뒤에는 Space로 재생한다", async () => {
    const { container } = setup();
    fireEvent.pointerDown(editorRoot(container));
    expect(await pressOnBody(" ")).toBe(false);
    expect(FakeAudioBufferPlayer.last.play).toHaveBeenCalledTimes(1);
  });

  it("재생 위치가 0이어도 Space가 재생을 다시 시작하지 않고 정지한다", async () => {
    const { container } = setup();
    fireEvent.pointerDown(editorRoot(container));
    await pressOnBody(" ");
    // 처음부터 재생하면 첫 콜백 값이 0이다
    await act(async () => FakeAudioBufferPlayer.last.onUpdate?.(0));
    FakeAudioBufferPlayer.last.stop.mockClear();
    await pressOnBody(" ");
    expect(FakeAudioBufferPlayer.last.play).toHaveBeenCalledTimes(1);
    expect(FakeAudioBufferPlayer.last.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: en.play })).toBeTruthy();
  });

  it("에디터 밖을 누르면 Ctrl+A와 Ctrl+C를 페이지에 돌려준다", async () => {
    const outside = document.createElement("p");
    document.body.appendChild(outside);
    try {
      const { container } = setup();
      fireEvent.pointerDown(editorRoot(container));
      fireEvent.pointerDown(outside);
      expect(await pressOnBody("a", { ctrlKey: true })).toBe(true);
      expect(await pressOnBody("c", { ctrlKey: true })).toBe(true);
      expect(screen.getByRole("button", { name: en.delete })).toHaveProperty("disabled", true);
    } finally {
      outside.remove();
    }
  });

  it("Tab으로 에디터 안 버튼에 포커스가 들어오면 단축키가 동작한다", async () => {
    setup();
    act(() => screen.getByRole("button", { name: en.copyToNew }).focus());
    expect(await pressOnBody("a", { ctrlKey: true })).toBe(false);
    expect(screen.getByRole("button", { name: en.delete })).toHaveProperty("disabled", false);
  });

  it("에디터가 둘이면 마지막으로 누른 에디터만 반응한다", async () => {
    const { container } = setup();
    const second = render(
      <SoundEditor
        samples={ramp(1000)}
        sampleRate={44100}
        name="Second"
        onChange={vi.fn()}
        onCopyToNew={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    const [firstPlayer, secondPlayer] = FakeAudioBufferPlayer.instances;
    fireEvent.pointerDown(editorRoot(container));
    fireEvent.pointerDown(editorRoot(second.container));
    await pressOnBody(" ");
    expect(firstPlayer?.play).not.toHaveBeenCalled();
    expect(secondPlayer?.play).toHaveBeenCalledTimes(1);
  });
});

describe("SoundEditor 재생 버튼", () => {
  it("재생 위치가 0이어도 Play 대신 Stop 버튼을 보여 준다", async () => {
    setup();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.play })));
    await act(async () => FakeAudioBufferPlayer.last.onUpdate?.(0));
    expect(screen.getByRole("button", { name: en.stop })).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.play })).toBeNull();
  });
});

describe("SoundEditor 길이 0 samples", () => {
  it("빈 samples로 렌더해도 에디터가 그려지고 무음 1샘플 재생기를 만들며 onChange는 부르지 않는다", async () => {
    const { container, onChange } = setup({ samples: new Float32Array(0) });
    await act(async () => {});
    expect(container.querySelector('[class*="editorContainer"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: en.play })).toBeTruthy();
    expect(FakeAudioBufferPlayer.last.buffer.length).toBe(1);
    expect(Array.from(FakeAudioBufferPlayer.last.buffer.getChannelData(0))).toEqual([0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("빈 samples에서 Play와 효과 버튼을 눌러도 크래시하지 않는다", async () => {
    const { onChange } = setup({ samples: new Float32Array(0) });
    // 실제 applyEffect는 2샘플 미만이면 입력 버퍼를 그대로 돌려준다
    mockedApplyEffect.mockImplementation(async (buffer, _n, s, e) => ({
      buffer,
      trimStart: s,
      trimEnd: e,
    }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.play })));
    expect(FakeAudioBufferPlayer.last.play).toHaveBeenCalledTimes(1);
    for (const label of [en.faster, en.reverse, en.robot]) {
      await act(async () => fireEvent.click(screen.getByRole("button", { name: label })));
    }
    expect(mockedApplyEffect).toHaveBeenCalledTimes(3);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: en.faster })).toBeTruthy();
  });
});

describe("SoundEditor 접근성", () => {
  it("버튼 아이콘 이미지는 장식이므로 대체 텍스트가 비어 있다", () => {
    const { container } = setup();
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs.length).toBeGreaterThan(10);
    for (const img of imgs) expect(img.getAttribute("alt")).toBe("");
    // 효과 버튼의 이름은 텍스트에서 온다
    const faster = screen.getByRole("button", { name: en.faster });
    expect(within(faster).getByText(en.faster)).toBeTruthy();
  });
});

describe("SoundEditor 키보드 선택 조절", () => {
  it("드래그로 선택한 뒤 핸들에서 방향키로 선택 구간을 조절한다", async () => {
    const { container } = setup();
    await dragSelect(container, 250, 750);
    const start = screen.getByRole("slider", { name: en.selectionStart });
    expect(start.getAttribute("aria-valuenow")).toBe("25");
    await act(async () => fireEvent.keyDown(start, { key: "ArrowRight", shiftKey: true }));
    expect(
      screen.getByRole("slider", { name: en.selectionStart }).getAttribute("aria-valuenow"),
    ).toBe("35");
    expect(
      screen.getByRole("slider", { name: en.selectionEnd }).getAttribute("aria-valuenow"),
    ).toBe("75");
  });

  it("핸들 위치를 소리 길이 기준 초로 읽는다. 샘플이 바뀌면 새 길이를 쓴다", async () => {
    // 44100샘플은 1초다
    const { container, rerender } = setup({ samples: ramp(44100) });
    await dragSelect(container, 250, 750);
    const text = (name: string) =>
      screen.getByRole("slider", { name }).getAttribute("aria-valuetext");
    expect(text(en.selectionStart)).toBe("0.25 seconds");
    expect(text(en.selectionEnd)).toBe("0.75 seconds");
    // 다른 소리(2초)를 내려 주면 선택이 풀리므로 다시 선택한다
    rerender(
      <SoundEditor
        samples={ramp(88200)}
        sampleRate={44100}
        name="Meow"
        onChange={vi.fn()}
        onCopyToNew={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    await dragSelect(container, 250, 750);
    expect(text(en.selectionEnd)).toBe("1.50 seconds");
  });

  it("핸들 이름은 locale을 따른다", async () => {
    const { container } = setup({ locale: "ko" });
    await dragSelect(container, 250, 750);
    expect(screen.getByRole("slider", { name: getMessages("ko").selectionStart })).toBeTruthy();
    expect(screen.getByRole("slider", { name: getMessages("ko").selectionEnd })).toBeTruthy();
    expect(
      screen
        .getByRole("slider", { name: getMessages("ko").selectionEnd })
        .getAttribute("aria-valuetext"),
    ).toMatch(/초$/);
  });
});

describe("SoundEditor onError", () => {
  it("효과가 실패하면 onError에 kind effect와 원인을 넘긴다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("render failed");
    mockedApplyEffect.mockRejectedValue(cause);
    const onError = vi.fn();
    setup({ onError });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.reverse })));
    expect(onError).toHaveBeenCalledWith({ kind: "effect", cause });
  });
});

// 편집 실패를 에디터 안 role="alert"로 보이는 기본 알림. 호스트의 onError 호출과 별개로 동작한다.
describe("SoundEditor 편집 실패 알림", () => {
  /** 효과를 실패시켜 알림을 띄운다 */
  async function failEffect() {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedApplyEffect.mockRejectedValue(new Error("render failed"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.reverse })));
  }

  it("편집이 실패하면 kind에 맞는 문구를 role alert로 보이고 onError도 부른다", async () => {
    const onError = vi.fn();
    setup({ onError });
    expect(screen.queryByRole("alert")).toBeNull();
    await failEffect();
    expect(screen.getByRole("alert").textContent).toBe(en.editErrorEffect);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("같은 종류로 다시 실패하면 알림 요소를 새로 넣어 스크린 리더가 다시 읽게 한다", async () => {
    setup();
    await failEffect();
    const first = screen.getByRole("alert");
    await failEffect();
    const second = screen.getByRole("alert");
    expect(second.textContent).toBe(en.editErrorEffect);
    // 같은 요소의 같은 문구는 바뀐 것이 없어 role="alert"가 다시 낭독되지 않는다
    expect(second).not.toBe(first);
  });

  it("실패 뒤 편집이 성공하면 알림을 지운다", async () => {
    const { container, onChange } = setup();
    await failEffect();
    expect(screen.getByRole("alert")).toBeTruthy();
    // 효과 mock과 무관한 삭제 편집으로 성공시킨다
    await dragSelect(container, 100, 300);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.delete })));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("errorNotice가 false이면 알림을 보이지 않지만 onError는 그대로 부른다", async () => {
    const onError = vi.fn();
    setup({ onError, errorNotice: false });
    await failEffect();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SoundEditor busy 표시", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // ramp는 값이 커서 선택하면 Louder가 tooLoud로 먼저 비활성된다. 진폭이 작은 소리를 쓴다
  const quiet = Float32Array.from({ length: 3000 }, (_, i) => 0.1 * Math.sin(i / 10));
  const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
  const root = (container: HTMLElement) => container.firstElementChild as HTMLElement;

  /** undo, redo, paste, delete가 모두 활성인 상태를 만든다: 복사 후 두 번 지우고 한 번 되돌린다. */
  async function prepareAllEnabled(container: HTMLElement) {
    await dragSelect(container, 100, 200);
    await act(async () => fireEvent.click(button(en.copy)));
    await act(async () => fireEvent.click(button(en.delete)));
    await dragSelect(container, 100, 200);
    await act(async () => fireEvent.click(button(en.delete)));
    await act(async () => fireEvent.click(button(en.undo)));
    await dragSelect(container, 100, 200);
  }

  it("효과가 오래 걸리면 aria-busy를 켜고 편집 버튼 22개를 비활성하며 끝나면 푼다", async () => {
    const { container } = setup({ samples: quiet });
    await prepareAllEnabled(container);
    const editLabels = [en.undo, en.redo, en.paste, en.delete, ...effectLabels];
    expect(editLabels).toHaveLength(22);
    for (const label of editLabels) expect(button(label).disabled, label).toBe(false);
    expect(root(container).getAttribute("aria-busy")).not.toBe("true");

    let release!: () => void;
    mockedApplyEffect.mockImplementation(
      (buffer, _name, s, e) =>
        new Promise((resolve) => (release = () => resolve({ buffer, trimStart: s, trimEnd: e }))),
    );
    await act(async () => fireEvent.click(button(en.reverse)));
    await act(async () => vi.advanceTimersByTimeAsync(200));

    expect(root(container).getAttribute("aria-busy")).toBe("true");
    for (const label of editLabels) expect(button(label).disabled, label).toBe(true);

    await act(async () => release());
    expect(root(container).getAttribute("aria-busy")).not.toBe("true");
    for (const label of editLabels) expect(button(label).disabled, label).toBe(false);
  });

  it("busy 중에도 복사, Copy to New, 재생 버튼은 활성이다", async () => {
    const { container } = setup({ samples: quiet });
    mockedApplyEffect.mockReturnValue(new Promise(() => {}));
    await act(async () => fireEvent.click(button(en.reverse)));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(root(container).getAttribute("aria-busy")).toBe("true");
    for (const label of [en.copy, en.copyToNew, en.play]) {
      expect(button(label).disabled, label).toBe(false);
    }
  });

  /** 효과 버튼에 포커스를 두고 누른 뒤 busy가 될 때까지 기다린다. 효과를 끝내는 함수를 돌려준다. */
  async function startSlowEffectFromFocusedButton(label: string) {
    let release!: () => void;
    mockedApplyEffect.mockImplementation(
      (buffer, _name, s, e) =>
        new Promise((resolve) => (release = () => resolve({ buffer, trimStart: s, trimEnd: e }))),
    );
    button(label).focus();
    await act(async () => fireEvent.click(button(label)));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(button(label).disabled).toBe(true);
    // 브라우저(Chromium)는 포커스된 버튼이 비활성되면 포커스를 body로 옮긴다. jsdom은 하지 않고
    // 비활성 요소의 blur()도 무시하므로, 임시 버튼에 포커스를 줬다가 지워 body로 보낸다
    const temporary = document.createElement("button");
    document.body.append(temporary);
    temporary.focus();
    temporary.remove();
    expect(document.activeElement).toBe(document.body);
    return () => release();
  }

  it("busy로 비활성되며 잃은 포커스를 busy가 끝나면 누른 버튼으로 되돌린다", async () => {
    setup({ samples: quiet });
    const release = await startSlowEffectFromFocusedButton(en.robot);
    await act(async () => release());
    expect(document.activeElement).toBe(button(en.robot));
  });

  it("busy 동안 다른 곳으로 포커스를 옮겼으면 되돌리지 않는다", async () => {
    setup({ samples: quiet });
    const release = await startSlowEffectFromFocusedButton(en.robot);
    button(en.copy).focus();
    await act(async () => release());
    expect(document.activeElement).toBe(button(en.copy));
  });

  it("busy로 비활성된 Louder에는 너무 크다는 이유를 붙이지 않는다", async () => {
    setup({ samples: quiet });
    mockedApplyEffect.mockReturnValue(new Promise(() => {}));
    await act(async () => fireEvent.click(button(en.reverse)));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    const louder = button(en.louder);
    expect(louder.disabled).toBe(true);
    expect(louder.getAttribute("title")).not.toBe(en.tooLoudHint);
    // 이유 설명은 없고 적용 범위 설명만 남는다
    const describedBy = louder.getAttribute("aria-describedby") as string;
    expect(describedBy.split(" ")).toHaveLength(1);
    expect(document.getElementById(describedBy)?.textContent).toBe(en.effectScopeWhole);
  });
});

describe("SoundEditor 소리 전환(soundId)", () => {
  /** 같은 콜백으로 soundId, samples, name만 바꿔 다시 그린다. */
  const switchTo = (
    rerender: (ui: React.ReactElement) => void,
    callbacks: { onChange: () => void; onCopyToNew: () => void; onRename: () => void },
    soundId: number,
    name: string,
  ) =>
    rerender(
      <SoundEditor
        soundId={soundId}
        samples={ramp(500)}
        sampleRate={44100}
        name={name}
        onChange={callbacks.onChange}
        onCopyToNew={callbacks.onCopyToNew}
        onRename={callbacks.onRename}
      />,
    );

  it("이름 입력 중 soundId가 바뀌면 입력하던 이름을 버리고 새 소리의 onRename으로 제출하지 않는다", async () => {
    const { rerender, ...callbacks } = setup({ soundId: 1 });
    const input = screen.getByLabelText(en.sound) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Typed" } });
    await act(async () => switchTo(rerender, callbacks, 2, "Bark"));
    const current = screen.getByLabelText(en.sound) as HTMLInputElement;
    expect(current.value).toBe("Bark");
    fireEvent.blur(current);
    expect(callbacks.onRename).not.toHaveBeenCalled();
  });

  it("선택을 끄는 중 soundId가 바뀌면 끌던 선택을 새 소리에 적용하지 않는다", async () => {
    const { container, rerender, ...callbacks } = setup({ soundId: 1 });
    const selector = container.querySelector('[class*="selector"]') as HTMLElement;
    await act(async () => {
      fireEvent.mouseDown(selector, { clientX: 100, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 400, clientY: 0 });
    });
    expect(screen.getByText(/^Selection/)).toBeTruthy();
    await act(async () => switchTo(rerender, callbacks, 2, "Bark"));
    expect(screen.queryByText(/^Selection/)).toBeNull();
    await act(async () => fireEvent.mouseUp(window, { clientX: 400, clientY: 0 }));
    expect(screen.queryByText(/^Selection/)).toBeNull();
    expect(screen.getByText(en.effectScopeWhole)).toBeTruthy();
    // 처음 소리로 돌아가도 끄던 임시 선택이 다시 보이지 않는다
    await act(async () => switchTo(rerender, callbacks, 1, "Meow"));
    expect(screen.queryByText(/^Selection/)).toBeNull();
  });

  it("soundId 없이 samples가 바뀌어도 끌던 선택을 새 소리에 적용하지 않는다", async () => {
    const { container, rerender, ...callbacks } = setup();
    const selector = container.querySelector('[class*="selector"]') as HTMLElement;
    await act(async () => {
      fireEvent.mouseDown(selector, { clientX: 100, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 400, clientY: 0 });
    });
    expect(screen.getByText(/^Selection/)).toBeTruthy();

    await act(async () =>
      rerender(
        <SoundEditor
          samples={ramp(500)}
          sampleRate={44100}
          name="Meow"
          onChange={callbacks.onChange}
          onCopyToNew={callbacks.onCopyToNew}
          onRename={callbacks.onRename}
        />,
      ),
    );
    expect(screen.queryByText(/^Selection/)).toBeNull();
    await act(async () => fireEvent.mouseUp(window, { clientX: 400, clientY: 0 }));

    expect(screen.queryByText(/^Selection/)).toBeNull();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.getByText(en.effectScopeWhole)).toBeTruthy();
  });
});
