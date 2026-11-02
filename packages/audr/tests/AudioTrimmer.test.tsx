import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioTrimmer } from "../src/components/AudioTrimmer";

const mouse = (x: number) => ({ clientX: x, clientY: 0 });

function setup(trimStart = 0.2, trimEnd = 0.8, playhead: number | null = null) {
  const onSetTrimStart = vi.fn();
  const onSetTrimEnd = vi.fn();
  const utils = render(
    <AudioTrimmer
      playhead={playhead}
      trimStart={trimStart}
      trimEnd={trimEnd}
      onSetTrimStart={onSetTrimStart}
      onSetTrimEnd={onSetTrimEnd}
      startLabel="자르기 시작"
      endLabel="자르기 끝"
    />,
  );
  const root = utils.container.firstElementChild as HTMLElement;
  const startArea = root.querySelector('[class*="startTrimBackground"]') as HTMLElement;
  const endArea = root.querySelector('[class*="endTrimBackground"]') as HTMLElement;
  return { ...utils, root, startArea, endArea, onSetTrimStart, onSetTrimEnd };
}

function lastArg(fn: ReturnType<typeof vi.fn>): number {
  return fn.mock.calls[fn.mock.calls.length - 1]?.[0] as number;
}

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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AudioTrimmer", () => {
  it("시작·끝 바깥 영역을 trim 값에 맞춰 %로 그린다", () => {
    const { startArea, endArea } = setup(0.2, 0.8);
    expect(startArea.style.width).toBe("20%");
    expect(endArea.style.left).toBe("80%");
    expect(endArea.style.width).toBe("20%");
  });

  it("시작 영역을 끌면 onSetTrimStart를 호출한다", () => {
    const { startArea, onSetTrimStart } = setup(0.2, 0.8);
    fireEvent.mouseDown(startArea, mouse(200));
    fireEvent.mouseMove(window, mouse(300));
    fireEvent.mouseUp(window, mouse(300));
    expect(lastArg(onSetTrimStart)).toBeCloseTo(0.3, 9);
  });

  it("시작 핸들을 trimEnd - 0.01보다 크게 끌어도 trimEnd - 0.01 이하를 받는다", () => {
    const { startArea, onSetTrimStart } = setup(0.2, 0.8);
    fireEvent.mouseDown(startArea, mouse(200));
    fireEvent.mouseMove(window, mouse(5000));
    fireEvent.mouseUp(window, mouse(5000));
    expect(lastArg(onSetTrimStart)).toBeLessThanOrEqual(0.8 - 0.01 + 1e-12);
    expect(lastArg(onSetTrimStart)).toBeCloseTo(0.79, 9);
  });

  it("시작 핸들을 컨테이너 왼쪽 밖으로 끌면 0이다", () => {
    const { startArea, onSetTrimStart } = setup(0.2, 0.8);
    fireEvent.mouseDown(startArea, mouse(200));
    fireEvent.mouseMove(window, mouse(-5000));
    fireEvent.mouseUp(window, mouse(-5000));
    expect(lastArg(onSetTrimStart)).toBe(0);
  });

  it("끝 핸들은 trimStart + 0.01 이상을 받는다", () => {
    const { endArea, onSetTrimEnd } = setup(0.2, 0.8);
    fireEvent.mouseDown(endArea, mouse(800));
    fireEvent.mouseMove(window, mouse(-5000));
    fireEvent.mouseUp(window, mouse(-5000));
    expect(lastArg(onSetTrimEnd)).toBeGreaterThanOrEqual(0.2 + 0.01 - 1e-12);
    expect(lastArg(onSetTrimEnd)).toBeCloseTo(0.21, 9);
  });

  it("끝 핸들을 컨테이너 오른쪽 밖으로 끌면 1이다", () => {
    const { endArea, onSetTrimEnd } = setup(0.2, 0.8);
    fireEvent.mouseDown(endArea, mouse(800));
    fireEvent.mouseMove(window, mouse(5000));
    fireEvent.mouseUp(window, mouse(5000));
    expect(lastArg(onSetTrimEnd)).toBe(1);
  });

  it("playhead가 있으면 퍼센트 위치로 그린다", () => {
    const { root } = setup(0.2, 0.8, 0.5);
    const playhead = root.querySelector('[class*="playheadContainer"] > div') as HTMLElement;
    expect(playhead.style.transform).toBe("translateX(50%)");
  });

  it("playhead가 0이어도 재생 선을 맨 앞에 그린다", () => {
    const { root } = setup(0, 0.8, 0);
    const playhead = root.querySelector('[class*="playheadContainer"] > div') as HTMLElement | null;
    expect(playhead?.style.transform).toBe("translateX(0%)");
  });

  it("playhead가 null이면 그리지 않는다", () => {
    const { root } = setup(0.2, 0.8, null);
    expect(root.querySelector('[class*="playheadContainer"]')).toBeNull();
  });

  it("드래그 중에 unmount되면 이후 window 이벤트로 콜백이 불리지 않는다", () => {
    const { startArea, onSetTrimStart, unmount } = setup(0.2, 0.8);
    fireEvent.mouseDown(startArea, mouse(200));
    unmount();
    fireEvent.mouseMove(window, mouse(400));
    fireEvent.mouseUp(window, mouse(400));
    expect(onSetTrimStart).not.toHaveBeenCalled();
  });
});

describe("AudioTrimmer 키보드 조작", () => {
  it("두 핸들은 이름과 현재 위치(%)를 가진 슬라이더다", () => {
    setup(0.2, 0.8);
    expect(screen.getByRole("slider", { name: "자르기 시작" }).getAttribute("aria-valuenow")).toBe(
      "20",
    );
    expect(screen.getByRole("slider", { name: "자르기 끝" }).getAttribute("aria-valuenow")).toBe(
      "80",
    );
  });

  it("시작 핸들 →는 1%, Shift+→는 10% 옮긴다", () => {
    const { onSetTrimStart } = setup(0.2, 0.8);
    const start = screen.getByRole("slider", { name: "자르기 시작" });
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(lastArg(onSetTrimStart)).toBeCloseTo(0.21, 9);
    fireEvent.keyDown(start, { key: "ArrowRight", shiftKey: true });
    expect(lastArg(onSetTrimStart)).toBeCloseTo(0.3, 9);
  });

  it("시작은 0과 trimEnd - 0.01 사이로 제한된다", () => {
    const { onSetTrimStart } = setup(0.05, 0.5);
    const start = screen.getByRole("slider", { name: "자르기 시작" });
    fireEvent.keyDown(start, { key: "ArrowLeft", shiftKey: true });
    expect(lastArg(onSetTrimStart)).toBe(0);
    fireEvent.keyDown(start, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(start, { key: "ArrowRight", shiftKey: true });
    expect(lastArg(onSetTrimStart)).toBeLessThanOrEqual(0.49 + 1e-12);
  });

  it("끝은 trimStart + 0.01과 1 사이로 제한된다", () => {
    const { onSetTrimEnd } = setup(0.5, 0.95);
    const end = screen.getByRole("slider", { name: "자르기 끝" });
    fireEvent.keyDown(end, { key: "ArrowRight", shiftKey: true });
    expect(lastArg(onSetTrimEnd)).toBe(1);
    // props를 다시 내려 주지 않으므로 두 번째 입력도 0.95에서 시작한다
    fireEvent.keyDown(end, { key: "ArrowLeft", shiftKey: true });
    expect(lastArg(onSetTrimEnd)).toBeCloseTo(0.85, 9);
  });
});
