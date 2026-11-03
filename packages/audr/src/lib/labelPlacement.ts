// 선택 구간 위에 띄울 글자의 왼쪽 위치를 정한다. 단위는 px이고 좌표계는 파형 안쪽 왼쪽 끝이 0이다.

/**
 * 선택 구간 `[startPx, endPx]` 위에 둘 글자(폭 `labelWidth`)의 왼쪽 끝 위치를 돌려준다.
 * 선택 핸들은 시작선의 왼쪽과 끝선의 오른쪽으로 `clearance`만큼 나와 있어, 글자는 그 바깥이나 두 선 사이에 둔다.
 * - 선택이 글자보다 넓으면 두 선 사이의 가운데에 둔다.
 * - 좁으면 끝 핸들 오른쪽에 둔다. 영역(`areaWidth`)을 넘으면 시작 핸들 왼쪽에 둔다.
 * - 어느 쪽도 맞지 않으면 선택 가운데를 영역 안으로 밀어 둔다. 이때는 핸들과 겹칠 수 있다.
 */
export function placeLabel(
  startPx: number,
  endPx: number,
  labelWidth: number,
  areaWidth: number,
  clearance: number,
): number {
  const selectionWidth = endPx - startPx;
  const centered = startPx + (selectionWidth - labelWidth) / 2;
  if (selectionWidth >= labelWidth) return centered;
  const right = endPx + clearance;
  if (right + labelWidth <= areaWidth) return right;
  const left = startPx - clearance - labelWidth;
  if (left >= 0) return left;
  return Math.min(Math.max(0, centered), Math.max(0, areaWidth - labelWidth));
}

/**
 * 선택 구간 `[startPx, endPx]`의 가운데에 폭 `boxWidth`인 상자를 맞춘 왼쪽 끝 위치를 돌려준다.
 * 영역(`areaWidth`) 안으로 `margin`만큼 띄워 밀어 넣고, 상자가 영역보다 넓으면 왼쪽 여유 위치에 둔다.
 */
export function centerOnRange(
  startPx: number,
  endPx: number,
  boxWidth: number,
  areaWidth: number,
  margin: number,
): number {
  const centered = (startPx + endPx) / 2 - boxWidth / 2;
  const max = Math.max(margin, areaWidth - boxWidth - margin);
  return Math.min(Math.max(margin, centered), max);
}
