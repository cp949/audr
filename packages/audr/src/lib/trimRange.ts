// trim 비율(0~1)을 샘플 인덱스로 바꾼다. 저장(useRecordDialog.submit)과 화면 표시가 같은 값을 쓰게 한다.

/** trim 구간의 샘플 인덱스. 구간은 `[startIndex, endIndex)`이고 비율에 floor를 적용한다. */
export function trimSampleRange(length: number, trimStart: number, trimEnd: number) {
  return {
    startIndex: Math.floor(trimStart * length),
    endIndex: Math.floor(trimEnd * length),
  };
}

/** 저장될 샘플 수. 구간이 비면 저장 쪽이 무음 1샘플로 대신하므로 최소 1이다. */
export function trimmedSampleCount(length: number, trimStart: number, trimEnd: number): number {
  const { startIndex, endIndex } = trimSampleRange(length, trimStart, trimEnd);
  return Math.max(1, endIndex - startIndex);
}
