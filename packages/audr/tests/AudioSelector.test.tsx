import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioSelector } from "../src/components/AudioSelector";

type Trim = [number | null, number | null];

/** 부모가 trim을 들고 있는 상황을 흉내 낸다 (controlled) */
function Harness({
  initial,
  onSetTrim,
  playhead = null,
}: {
  initial: Trim;
  onSetTrim: (s: number | null, e: number | null) => void;
  playhead?: number | null;
}) {
  const [trim, setTrim] = useState<Trim>(initial);
  return (
    <AudioSelector
      playhead={playhead}
      trimStart={trim[0]}
      trimEnd={trim[1]}
      onSetTrim={(s, e) => {
        setTrim([s, e]);
        onSetTrim(s, e);
      }}
      startLabel="선택 시작"
      endLabel="선택 끝"
    />
  );
}

function lastCall(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.calls[fn.mock.calls.length - 1] as [number | null, number | null];
}

function setup(initial: Trim = [null, null], playhead: number | null = null) {
  const onSetTrim = vi.fn();
  const utils = render(<Harness initial={initial} onSetTrim={onSetTrim} playhead={playhead} />);
  const root = utils.container.firstElementChild as HTMLElement;
  return { ...utils, root, onSetTrim };
}

const mouse = (x: number) => ({ clientX: x, clientY: 0 });

beforeEach(() => {
  // 컨테이너는 left 0, width 1000으로 본다
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 100,
    width: 1000,
    height: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AudioSelector 새 선택", () => {
  it("x=250에서 mousedown, x=750까지 mousemove, mouseup하면 마지막 onSetTrim이 (0.25, 0.75)다", () => {
    const { root, onSetTrim } = setup();
    fireEvent.mouseDown(root, mouse(250));
    fireEvent.mouseMove(window, mouse(750));
    fireEvent.mouseUp(window, mouse(750));
    expect(lastCall(onSetTrim)).toEqual([0.25, 0.75]);
  });

  it("x=750에서 시작해 x=250까지 끌면 (0.25, 0.75)로 뒤집혀 나온다", () => {
    const { root, onSetTrim } = setup();
    fireEvent.mouseDown(root, mouse(750));
    fireEvent.mouseMove(window, mouse(250));
    fireEvent.mouseUp(window, mouse(250));
    expect(lastCall(onSetTrim)).toEqual([0.25, 0.75]);
  });

  it("mousedown 즉시 길이 0의 선택을 부모에게 알린다", () => {
    const { root, onSetTrim } = setup();
    fireEvent.mouseDown(root, mouse(500));
    expect(onSetTrim).toHaveBeenCalledWith(0.5, 0.5);
  });

  it("100ms 안에 1% 미만을 끌면 마지막 호출이 (null, null)이다", () => {
    const { root, onSetTrim } = setup();
    fireEvent.mouseDown(root, mouse(500));
    vi.setSystemTime(100);
    fireEvent.mouseMove(window, mouse(505)); // 0.5%
    fireEvent.mouseUp(window, mouse(505));
    expect(lastCall(onSetTrim)).toEqual([null, null]);
  });

  it("600ms 이후 같은 거리를 끌면 선택이 유지된다", () => {
    const { root, onSetTrim } = setup();
    fireEvent.mouseDown(root, mouse(500));
    vi.setSystemTime(600);
    fireEvent.mouseMove(window, mouse(505));
    fireEvent.mouseUp(window, mouse(505));
    const [start, end] = lastCall(onSetTrim);
    expect(start).toBeCloseTo(0.5, 9);
    expect(end).toBeCloseTo(0.505, 9);
  });

  it("빠르더라도 1% 이상 끌면 선택이 유지된다", () => {
    const { root, onSetTrim } = setup();
    fireEvent.mouseDown(root, mouse(500));
    vi.setSystemTime(100);
    fireEvent.mouseMove(window, mouse(520)); // 2%
    fireEvent.mouseUp(window, mouse(520));
    expect(lastCall(onSetTrim)[0]).not.toBeNull();
  });

  it("컨테이너 밖으로 끌어도 0~1로 제한된다", () => {
    const first = setup();
    fireEvent.mouseDown(first.root, mouse(500));
    fireEvent.mouseMove(window, mouse(5000));
    fireEvent.mouseUp(window, mouse(5000));
    expect(lastCall(first.onSetTrim)).toEqual([0.5, 1]);
    first.unmount();

    const second = setup();
    fireEvent.mouseDown(second.root, mouse(500));
    fireEvent.mouseMove(window, mouse(-5000));
    fireEvent.mouseUp(window, mouse(-5000));
    expect(lastCall(second.onSetTrim)).toEqual([0, 0.5]);
  });
});

describe("AudioSelector 핸들 드래그", () => {
  const handles = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('[class*="trimLine"]')) as HTMLElement[];

  it("선택이 있으면 좌우 핸들 2개를 그리고 선택 구간 위치를 %로 맞춘다", () => {
    const { root } = setup([0.25, 0.75]);
    expect(handles(root).length).toBe(2);
    const region = root.firstElementChild as HTMLElement;
    expect(region.style.left).toBe("25%");
    expect(region.style.width).toBe("50%");
  });

  it("선택이 없으면 핸들을 그리지 않는다", () => {
    const { root } = setup([null, null]);
    expect(handles(root).length).toBe(0);
  });

  it("왼쪽 핸들을 끌면 오른쪽이 고정된 채 시작이 갱신된다", () => {
    const { root, onSetTrim } = setup([0.25, 0.75]);
    const [left] = handles(root) as [HTMLElement, HTMLElement];
    fireEvent.mouseDown(left, mouse(250));
    fireEvent.mouseMove(window, mouse(100));
    fireEvent.mouseUp(window, mouse(100));
    expect(onSetTrim).toHaveBeenCalledTimes(1); // 새 선택이 시작되지 않는다
    const [start, end] = lastCall(onSetTrim);
    expect(start).toBeCloseTo(0.1, 9);
    expect(end).toBe(0.75);
  });

  it("오른쪽 핸들을 끌면 왼쪽이 고정된 채 끝이 갱신된다", () => {
    const { root, onSetTrim } = setup([0.25, 0.75]);
    const [, right] = handles(root) as [HTMLElement, HTMLElement];
    fireEvent.mouseDown(right, mouse(750));
    fireEvent.mouseMove(window, mouse(900));
    fireEvent.mouseUp(window, mouse(900));
    const [start, end] = lastCall(onSetTrim);
    expect(start).toBe(0.25);
    expect(end).toBeCloseTo(0.9, 9);
  });

  it("왼쪽 핸들이 오른쪽 끝을 넘으면 서로 뒤집힌다", () => {
    const { root, onSetTrim } = setup([0.25, 0.75]);
    const [left] = handles(root) as [HTMLElement, HTMLElement];
    fireEvent.mouseDown(left, mouse(250));
    fireEvent.mouseMove(window, mouse(900));
    fireEvent.mouseUp(window, mouse(900));
    const [start, end] = lastCall(onSetTrim);
    expect(start).toBe(0.75);
    expect(end).toBeCloseTo(0.9, 9);
  });

  it("핸들을 컨테이너 밖으로 끌어도 0~1로 제한된다", () => {
    const { root, onSetTrim } = setup([0.25, 0.75]);
    const [left, right] = handles(root) as [HTMLElement, HTMLElement];
    fireEvent.mouseDown(left, mouse(250));
    fireEvent.mouseMove(window, mouse(-9999));
    fireEvent.mouseUp(window, mouse(-9999));
    expect(lastCall(onSetTrim)).toEqual([0, 0.75]);

    fireEvent.mouseDown(right, mouse(750));
    fireEvent.mouseMove(window, mouse(9999));
    fireEvent.mouseUp(window, mouse(9999));
    expect(lastCall(onSetTrim)).toEqual([0, 1]);
  });
});

describe("AudioSelector playhead", () => {
  it("playhead가 있으면 퍼센트 위치로 그린다", () => {
    const { root } = setup([null, null], 0.5);
    const playhead = root.querySelector(
      '[class*="playhead"] > div, [class*="playhead"]:not([class*="Container"])',
    ) as HTMLElement;
    expect(playhead.style.transform).toBe("translateX(50%)");
  });

  it("playhead가 0이어도 재생 선을 맨 앞에 그린다", () => {
    const { root } = setup([null, null], 0);
    const playhead = root.querySelector(
      '[class*="playhead"] > div, [class*="playhead"]:not([class*="Container"])',
    ) as HTMLElement | null;
    expect(playhead?.style.transform).toBe("translateX(0%)");
  });

  it("playhead가 null이면 그리지 않는다", () => {
    const { root } = setup([null, null], null);
    expect(root.querySelector('[class*="playhead"]')).toBeNull();
  });
});

describe("AudioSelector unmount", () => {
  it("드래그 중에 unmount되면 이후 window 이벤트로 콜백이 불리지 않는다", () => {
    const { root, onSetTrim, unmount } = setup();
    fireEvent.mouseDown(root, mouse(250));
    const callsBefore = onSetTrim.mock.calls.length;
    unmount();
    act(() => {
      fireEvent.mouseMove(window, mouse(750));
      fireEvent.mouseUp(window, mouse(750));
    });
    expect(onSetTrim.mock.calls.length).toBe(callsBefore);
  });
});

describe("AudioSelector 키보드 조작", () => {
  const key = (el: HTMLElement, k: string, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(el, { key: k, ...init });

  it("선택이 있으면 두 핸들이 이름과 현재 위치(%)를 가진 슬라이더다", () => {
    setup([0.25, 0.75]);
    const start = screen.getByRole("slider", { name: "선택 시작" });
    const end = screen.getByRole("slider", { name: "선택 끝" });
    expect(start.getAttribute("aria-valuenow")).toBe("25");
    expect(end.getAttribute("aria-valuenow")).toBe("75");
    expect(start.getAttribute("aria-valuemin")).toBe("0");
    expect(start.getAttribute("aria-valuemax")).toBe("100");
    expect(start.tabIndex).toBe(0);
  });

  it("선택이 없으면 슬라이더가 없다", () => {
    setup([null, null]);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("시작 핸들에서 →를 누르면 1%, Shift+←는 10% 옮긴다", () => {
    const { onSetTrim } = setup([0.25, 0.75]);
    const start = screen.getByRole("slider", { name: "선택 시작" });
    key(start, "ArrowRight");
    expect(lastCall(onSetTrim)[0]).toBeCloseTo(0.26, 9);
    expect(lastCall(onSetTrim)[1]).toBe(0.75);
    key(screen.getByRole("slider", { name: "선택 시작" }), "ArrowLeft", { shiftKey: true });
    expect(lastCall(onSetTrim)[0]).toBeCloseTo(0.16, 9);
  });

  it("끝 핸들에서 →를 누르면 끝이 1%, Shift+→는 10% 늘어난다", () => {
    const { onSetTrim } = setup([0.25, 0.75]);
    key(screen.getByRole("slider", { name: "선택 끝" }), "ArrowRight");
    expect(lastCall(onSetTrim)[1]).toBeCloseTo(0.76, 9);
    key(screen.getByRole("slider", { name: "선택 끝" }), "ArrowRight", { shiftKey: true });
    expect(lastCall(onSetTrim)[1]).toBeCloseTo(0.86, 9);
    expect(lastCall(onSetTrim)[0]).toBe(0.25);
  });

  it("범위를 넘지 않는다: 시작은 0, 끝은 1에서 멈춘다", () => {
    const { onSetTrim } = setup([0.02, 0.98]);
    key(screen.getByRole("slider", { name: "선택 시작" }), "ArrowLeft", { shiftKey: true });
    expect(lastCall(onSetTrim)[0]).toBe(0);
    key(screen.getByRole("slider", { name: "선택 끝" }), "ArrowRight", { shiftKey: true });
    expect(lastCall(onSetTrim)[1]).toBe(1);
  });

  it("두 핸들은 서로 1% 이내로 다가가지 않고 뒤집히지도 않는다", () => {
    const { onSetTrim } = setup([0.4, 0.5]);
    key(screen.getByRole("slider", { name: "선택 시작" }), "ArrowRight", { shiftKey: true });
    expect(lastCall(onSetTrim)[0]).toBeCloseTo(0.49, 9);
    key(screen.getByRole("slider", { name: "선택 끝" }), "ArrowLeft", { shiftKey: true });
    expect(lastCall(onSetTrim)[1]).toBeCloseTo(0.5, 9);
  });

  it("마우스로 만든 길이 0 선택은 시작을 왼쪽으로, 끝을 오른쪽으로만 넓힐 수 있다", () => {
    const { onSetTrim } = setup([0.5, 0.5]);
    key(screen.getByRole("slider", { name: "선택 시작" }), "ArrowRight");
    expect(lastCall(onSetTrim)[0]).toBe(0.5);
    key(screen.getByRole("slider", { name: "선택 시작" }), "ArrowLeft");
    expect(lastCall(onSetTrim)[0]).toBeCloseTo(0.49, 9);
  });

  it("방향키가 아닌 키는 무시하고, 방향키의 기본 동작(스크롤)은 막는다", () => {
    const { onSetTrim } = setup([0.25, 0.75]);
    const start = screen.getByRole("slider", { name: "선택 시작" });
    expect(fireEvent.keyDown(start, { key: "a" })).toBe(true);
    expect(onSetTrim).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(start, { key: "ArrowRight" })).toBe(false);
  });
});
