// 선택·trim 핸들을 키보드로 옮기는 계산. 위치는 모두 0~1(전체 길이 대비 비율)이다.

/** 선택·trim 구간이 이보다 짧아지지 않게 한다 (전체의 1%) */
export const MIN_TRIM_LENGTH = 0.01;
/** 방향키 한 번의 이동량 (전체의 1%) */
const STEP = 0.01;
/** Shift+방향키 한 번의 이동량 (전체의 10%) */
const LARGE_STEP = 0.1;

/** 핸들에서 누른 키를 이동량으로 바꾼다. ←/→가 아니면 null이다. */
export function trimKeyDelta(event: { key: string; shiftKey: boolean }): number | null {
  const step = event.shiftKey ? LARGE_STEP : STEP;
  if (event.key === "ArrowLeft") return -step;
  if (event.key === "ArrowRight") return step;
  return null;
}

/**
 * 시작 핸들을 delta만큼 옮긴 새 위치. 끝 핸들 앞 MIN_TRIM_LENGTH까지만 간다.
 * 마우스로 만든 길이 0 선택은 이미 최소 길이보다 짧다. 이 경우 오른쪽으로는 못 가고 왼쪽으로만 간다.
 */
export function steppedStart(start: number, end: number, delta: number): number {
  const upper = Math.max(start, end - MIN_TRIM_LENGTH);
  return Math.min(upper, Math.max(0, start + delta));
}

/** 끝 핸들을 delta만큼 옮긴 새 위치. 시작 핸들 뒤 MIN_TRIM_LENGTH까지만 간다. */
export function steppedEnd(start: number, end: number, delta: number): number {
  const lower = Math.min(end, start + MIN_TRIM_LENGTH);
  return Math.max(lower, Math.min(1, end + delta));
}
