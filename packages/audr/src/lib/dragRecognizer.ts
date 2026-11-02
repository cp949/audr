// 마우스 이동은 항상 drag로, 터치 이동은 각도로 drag와 세로 스크롤을 구분한다.
import { getEventXY, type PointerLikeEvent } from "./touchUtils";

type Offset = { x: number; y: number };

export type DragRecognizerOptions = {
  onDrag?: (currentOffset: Offset, initialOffset: Offset) => void;
  onDragEnd?: () => void;
  /** 이 각도(0~90)를 넘는 터치 이동은 스크롤로 본다 */
  touchDragAngle?: number;
  /** 이 거리(px) 미만의 이동은 무시한다 */
  distanceThreshold?: number;
};

type GestureState = "unidentified" | "scroll" | "drag";

export class DragRecognizer {
  private readonly onDrag: (currentOffset: Offset, initialOffset: Offset) => void;
  private readonly onDragEnd: () => void;
  private readonly touchDragAngle: number;
  private readonly distanceThreshold: number;

  private initialOffset: Offset | null = null;
  private gestureState: GestureState = "unidentified";

  constructor({
    onDrag = () => {},
    onDragEnd = () => {},
    touchDragAngle = 70,
    distanceThreshold = 3,
  }: DragRecognizerOptions = {}) {
    this.onDrag = onDrag;
    this.onDragEnd = onDragEnd;
    this.touchDragAngle = touchDragAngle;
    this.distanceThreshold = distanceThreshold;
  }

  /** 누른 지점을 기억하고 window 이벤트를 듣기 시작한다. */
  start = (event: PointerLikeEvent): void => {
    this.initialOffset = getEventXY(event);
    this.bindListeners();
  };

  /** drag나 scroll로 판정이 끝났으면 true다. */
  gestureInProgress = (): boolean => {
    return this.gestureState !== "unidentified";
  };

  /** 리스너를 떼고 상태를 처음으로 돌린다. 컴포넌트 unmount 때도 호출한다. */
  reset = (): void => {
    this.unbindListeners();
    this.initialOffset = null;
    this.gestureState = "unidentified";
  };

  private bindListeners(): void {
    window.addEventListener("mouseup", this.handleEnd);
    window.addEventListener("mousemove", this.handleMove);
    window.addEventListener("touchend", this.handleEnd);
    // touchmove must be marked as non-passive, or else it cannot prevent scrolling
    window.addEventListener("touchmove", this.handleMove, { passive: false });
  }

  private unbindListeners(): void {
    window.removeEventListener("mouseup", this.handleEnd);
    window.removeEventListener("mousemove", this.handleMove);
    window.removeEventListener("touchend", this.handleEnd);
    window.removeEventListener("touchmove", this.handleMove);
  }

  private handleMove = (event: MouseEvent | TouchEvent): void => {
    // For gestures identified as vertical scrolls, do not process movement events
    if (this.gestureState === "scroll" || !this.initialOffset) return;

    const currentOffset = getEventXY(event as PointerLikeEvent);

    // Try to identify this gesture if it hasn't been identified already
    if (!this.gestureInProgress()) {
      const dx = currentOffset.x - this.initialOffset.x;
      const dy = currentOffset.y - this.initialOffset.y;
      const dragDistance = Math.sqrt(dx * dx + dy * dy);
      if (dragDistance < this.distanceThreshold) return;

      // For touch moves, additionally check if the angle suggests drag vs. scroll
      if (event.type === "touchmove") {
        // Direction goes from -180 to 180, with 0 toward the right.
        let angle = (Math.atan2(dy, dx) / Math.PI) * 180;
        // Fold over horizontal axis, range now 0 to 180
        angle = Math.abs(angle);
        // Fold over vertical axis, range now 0 to 90
        if (angle > 90) angle = 180 - angle;
        this.gestureState = angle > this.touchDragAngle ? "scroll" : "drag";
      } else {
        // Mouse moves are always considered drags
        this.gestureState = "drag";
      }
    }

    if (this.gestureState === "drag") {
      this.onDrag(currentOffset, this.initialOffset);
      event.preventDefault();
    }
  };

  private handleEnd = (): void => {
    this.reset();
    // Call the callback after reset to make sure if gestureInProgress()
    // is used in response, it get the correct value (i.e. no gesture in progress)
    this.onDragEnd();
  };
}
