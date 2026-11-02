type Point = { clientX: number; clientY: number };

/** 마우스와 터치 이벤트(DOM, React 모두)에서 좌표를 읽을 수 있는 최소 모양 */
export type PointerLikeEvent = {
  clientX?: number;
  clientY?: number;
  touches?: ArrayLike<Point>;
  changedTouches?: ArrayLike<Point>;
};

/** 마우스면 clientX/Y, 터치면 첫 번째 터치의 좌표를 돌려준다. */
export function getEventXY(e: PointerLikeEvent): { x: number; y: number } {
  const touch = e.touches?.[0];
  if (touch) {
    return { x: touch.clientX, y: touch.clientY };
  }
  const changed = e.changedTouches?.[0];
  if (changed) {
    return { x: changed.clientX, y: changed.clientY };
  }
  return { x: e.clientX as number, y: e.clientY as number };
}
