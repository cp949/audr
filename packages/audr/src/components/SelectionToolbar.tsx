import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { centerOnRange } from "../lib/labelPlacement";
import styles from "./selection-toolbar.module.css";

/** 막대와 파형 상자 가장자리 사이의 여유(px) */
const EDGE_MARGIN = 4;

export type SelectionToolbarProps = {
  /** 선택 구간(0~1). 파형 폭에 대한 비율이다 */
  start: number;
  end: number;
  /** 묶음의 접근 가능한 이름 */
  label: string;
  /** 선택 구간에만 쓰는 버튼들 */
  children: ReactNode;
};

/**
 * 선택 구간 위에 떠서 선택에만 쓰는 작업(삭제, 선택만 남기기) 버튼을 모은 막대.
 * 부모(파형 상자)의 안쪽 왼쪽 끝이 좌표 0이다. 막대 폭을 재서 선택 가운데에 맞추고 파형 상자 밖으로 나가지 않게 민다.
 */
export function SelectionToolbar({ start, end, label, children }: SelectionToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(EDGE_MARGIN);

  const update = useCallback(() => {
    const bar = ref.current;
    const area = bar?.parentElement;
    if (!bar || !area) return;
    const width = area.clientWidth;
    const next = centerOnRange(start * width, end * width, bar.offsetWidth, width, EDGE_MARGIN);
    // 같은 값이면 상태를 바꾸지 않아 다시 그리지 않는다
    setLeft((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
  }, [start, end]);

  // 그리기 전에 재서 첫 프레임에 엉뚱한 자리에 보이지 않게 한다
  useLayoutEffect(update, [update]);

  // 파형 상자 폭이 바뀌면(호스트 창 크기 변경 등) 다시 잰다
  useLayoutEffect(() => {
    const area = ref.current?.parentElement;
    if (!area || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(area);
    return () => observer.disconnect();
  }, [update]);

  return (
    <div ref={ref} role="group" aria-label={label} className={styles.toolbar} style={{ left }}>
      {children}
    </div>
  );
}
