import { afterEach, describe, expect, it, vi } from "vitest";
import { DragRecognizer } from "../src/lib/dragRecognizer";

/** jsdom에서 touches를 직접 넣은 touch 이벤트를 window로 보낸다 */
function dispatchTouch(type: "touchmove" | "touchend", x: number, y: number) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "touches", { value: [{ clientX: x, clientY: y }] });
  window.dispatchEvent(event);
  return event;
}

function dispatchMouse(type: "mousemove" | "mouseup", x: number, y: number) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe("DragRecognizer", () => {
  let recognizer: DragRecognizer | undefined;

  afterEach(() => {
    recognizer?.reset();
  });

  it("distanceThreshold가 3일 때 2px 이동은 onDrag를 부르지 않는다", () => {
    const onDrag = vi.fn();
    recognizer = new DragRecognizer({ onDrag, distanceThreshold: 3 });
    recognizer.start({ clientX: 0, clientY: 0 });
    dispatchMouse("mousemove", 2, 0);
    expect(onDrag).not.toHaveBeenCalled();
    expect(recognizer.gestureInProgress()).toBe(false);
  });

  it("기본 distanceThreshold(3)를 넘는 이동은 onDrag에 현재 좌표와 시작 좌표를 넘긴다", () => {
    const onDrag = vi.fn();
    recognizer = new DragRecognizer({ onDrag });
    recognizer.start({ clientX: 10, clientY: 20 });
    dispatchMouse("mousemove", 15, 20);
    expect(onDrag).toHaveBeenCalledWith({ x: 15, y: 20 }, { x: 10, y: 20 });
    expect(recognizer.gestureInProgress()).toBe(true);
  });

  it("drag로 판정한 mousemove는 preventDefault된다", () => {
    recognizer = new DragRecognizer({ onDrag: vi.fn(), distanceThreshold: 0 });
    recognizer.start({ clientX: 0, clientY: 0 });
    expect(dispatchMouse("mousemove", 10, 0).defaultPrevented).toBe(true);
  });

  it("touch에서 각도가 touchDragAngle을 넘으면 스크롤로 보고 onDrag를 부르지 않는다", () => {
    const onDrag = vi.fn();
    recognizer = new DragRecognizer({ onDrag, touchDragAngle: 70, distanceThreshold: 3 });
    recognizer.start({ clientX: 0, clientY: 0 });
    dispatchTouch("touchmove", 1, 20); // 세로에 가까운 이동, 각도 약 87도
    expect(onDrag).not.toHaveBeenCalled();
    // 스크롤로 판정된 뒤에는 가로 이동이 와도 처리하지 않는다
    dispatchTouch("touchmove", 100, 20);
    expect(onDrag).not.toHaveBeenCalled();
    expect(recognizer.gestureInProgress()).toBe(true);
  });

  it("touch에서 각도가 touchDragAngle 이하면 drag로 본다", () => {
    const onDrag = vi.fn();
    recognizer = new DragRecognizer({ onDrag, touchDragAngle: 70, distanceThreshold: 3 });
    recognizer.start({ clientX: 0, clientY: 0 });
    dispatchTouch("touchmove", 20, 5); // 각도 약 14도
    expect(onDrag).toHaveBeenCalledTimes(1);
  });

  it("start에 touch 이벤트를 주면 touches[0] 좌표를 시작점으로 쓴다", () => {
    const onDrag = vi.fn();
    recognizer = new DragRecognizer({ onDrag, distanceThreshold: 0 });
    recognizer.start({ touches: [{ clientX: 7, clientY: 9 }] } as unknown as MouseEvent);
    dispatchMouse("mousemove", 17, 9);
    expect(onDrag).toHaveBeenCalledWith({ x: 17, y: 9 }, { x: 7, y: 9 });
  });

  it("mouseup이면 onDragEnd를 부르고 gesture 상태와 리스너를 정리한다", () => {
    const onDrag = vi.fn();
    const onDragEnd = vi.fn(() => {
      // reset 뒤에 콜백이 불려야 gestureInProgress()가 false로 보인다
      expect(recognizer?.gestureInProgress()).toBe(false);
    });
    recognizer = new DragRecognizer({ onDrag, onDragEnd, distanceThreshold: 0 });
    recognizer.start({ clientX: 0, clientY: 0 });
    dispatchMouse("mousemove", 10, 0);
    dispatchMouse("mouseup", 10, 0);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    onDrag.mockClear();
    dispatchMouse("mousemove", 50, 0);
    expect(onDrag).not.toHaveBeenCalled();
  });

  it("reset하면 이후 이동과 종료 이벤트를 무시한다", () => {
    const onDrag = vi.fn();
    const onDragEnd = vi.fn();
    recognizer = new DragRecognizer({ onDrag, onDragEnd, distanceThreshold: 0 });
    recognizer.start({ clientX: 0, clientY: 0 });
    recognizer.reset();
    dispatchMouse("mousemove", 10, 0);
    dispatchMouse("mouseup", 10, 0);
    expect(onDrag).not.toHaveBeenCalled();
    expect(onDragEnd).not.toHaveBeenCalled();
  });
});
