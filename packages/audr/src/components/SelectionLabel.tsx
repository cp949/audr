import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { placeLabel } from "../lib/labelPlacement";
import styles from "./selection-label.module.css";

/** 선택 핸들 한 개의 폭(px). audio-trimmer.module.css의 `.trimHandle` 폭과 같게 둔다 */
const HANDLE_WIDTH = 30;

export type SelectionLabelProps = {
  /** 선택 구간(0~1). 파형 폭에 대한 비율이다 */
  start: number;
  end: number;
  /** 화면에 보이는 문구(숫자와 단위) */
  text: string;
  /** 보조기기가 읽는 문구. 화면에는 보이지 않는다 */
  readText: string;
};

/**
 * 선택 구간의 시간 범위를 파형 바로 위에 보인다. 부모(파형 상자)의 안쪽 왼쪽 끝이 좌표 0이다.
 * 위치는 글자 폭을 재서 정한다(`placeLabel`). 파형과 선택 영역을 가리지 않고 입력도 받지 않는다.
 */
export function SelectionLabel({ start, end, text, readText }: SelectionLabelProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [left, setLeft] = useState(0);

  const update = useCallback(() => {
    const label = ref.current;
    const area = label?.parentElement;
    if (!label || !area) return;
    const width = area.clientWidth;
    const next = placeLabel(start * width, end * width, label.offsetWidth, width, HANDLE_WIDTH);
    // 같은 값이면 상태를 바꾸지 않아 다시 그리지 않는다
    setLeft((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
  }, [start, end]);

  // 그리기 전에 재서 첫 프레임에 엉뚱한 자리에 보이지 않게 한다
  useLayoutEffect(update, [update, text]);

  // 파형 상자 폭이 바뀌면(호스트 창 크기 변경 등) 다시 잰다
  useLayoutEffect(() => {
    const area = ref.current?.parentElement;
    if (!area || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(area);
    return () => observer.disconnect();
  }, [update]);

  return (
    <span ref={ref} className={styles.label} style={{ left }}>
      <span aria-hidden="true">{text}</span>
      <span className={styles.visuallyHidden}>{readText}</span>
    </span>
  );
}
