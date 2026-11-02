// 드래그 중 값은 useRef에, 화면에 보이는 임시 선택은 useState에 둔다.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent, TouchEvent } from "react";
import { DragRecognizer } from "../lib/dragRecognizer";
import { getEventXY } from "../lib/touchUtils";
import { MIN_TRIM_LENGTH, steppedEnd, steppedStart } from "../lib/trimKeys";
import styles from "./audio-trimmer.module.css";
import { Playhead } from "./Playhead";
import { SelectionHandle } from "./SelectionHandle";

/** 새 선택을 판정하는 시간(ms). 이보다 빠르고 짧으면 선택 해제로 본다 */
const MIN_DURATION = 500;

/** 렌더 함수 밖에서 현재 시각을 읽는다 (이벤트 핸들러에서만 호출) */
const elapsedSince = (startTime: number) => Date.now() - startTime;
const nowMs = () => Date.now();

export type AudioSelectorProps = {
  /** 재생 위치 (0~1). null이면 재생 중이 아니다 */
  playhead: number | null;
  trimStart: number | null;
  trimEnd: number | null;
  onSetTrim: (start: number | null, end: number | null) => void;
  /** 시작 핸들의 접근 가능한 이름 */
  startLabel: string;
  /** 끝 핸들의 접근 가능한 이름 */
  endLabel: string;
  /** 핸들 위치(0~1)를 스크린 리더가 읽을 문구로 바꾼다. 없으면 퍼센트만 읽는다 */
  valueText?: (position: number) => string;
  /**
   * 드래그 중 임시 선택(0~1)을 알린다. 드래그가 끝나면 null로 알린다.
   * 부모가 확정 전의 선택을 화면 정보(시간 표시 등)에 쓸 때 쓴다.
   */
  onPreviewChange?: (range: { start: number; end: number } | null) => void;
};

type Range = { start: number | null; end: number | null };
type PointerEvent = MouseEvent<HTMLElement> | TouchEvent<HTMLElement>;

export function AudioSelector({
  playhead,
  trimStart,
  trimEnd,
  onSetTrim,
  startLabel,
  endLabel,
  valueText,
  onPreviewChange,
}: AudioSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 드래그 중에는 부모에게 알리기 전의 임시 선택을 보여 준다
  const [drag, setDrag] = useState<Range | null>(null);

  // 드래그 콜백이 항상 최신 props를 읽도록 한다
  const latest = useRef({ trimStart, trimEnd, onSetTrim, onPreviewChange });
  useLayoutEffect(() => {
    latest.current = { trimStart, trimEnd, onSetTrim, onPreviewChange };
  });

  const gesture = useRef({
    initialStart: 0,
    initialEnd: 0,
    containerSize: 1,
    clickStartTime: 0,
    last: { start: null, end: null } as Range,
  });

  // recognizer는 렌더 밖(effect)에서 만들고, unmount 때 window 리스너를 떼어
  // 콜백이 더 이상 불리지 않게 한다.
  const recognizersRef = useRef<{ start: DragRecognizer; end: DragRecognizer } | null>(null);
  useEffect(() => {
    const update = (next: Range) => {
      gesture.current.last = next;
      setDrag(next);
      notifyPreview(next);
    };
    const notifyPreview = (range: Range | null) => {
      const preview =
        range && range.start !== null && range.end !== null
          ? { start: range.start, end: range.end }
          : null;
      latest.current.onPreviewChange?.(preview);
    };
    const recognizers = {
      start: new DragRecognizer({
        onDrag: (current, initial) => {
          const g = gesture.current;
          const dx = (current.x - initial.x) / g.containerSize;
          const newTrim = Math.max(0, Math.min(1, g.initialStart + dx));
          if (newTrim > g.initialEnd) {
            update({ start: g.initialEnd, end: newTrim });
          } else {
            update({ start: newTrim, end: g.initialEnd });
          }
        },
        onDragEnd: () => {
          const { start, end } = gesture.current.last;
          latest.current.onSetTrim(start, end);
          setDrag(null);
          notifyPreview(null);
        },
        touchDragAngle: 90,
        distanceThreshold: 0,
      }),
      // 새 선택과 끝 핸들 드래그가 같은 recognizer를 쓴다
      end: new DragRecognizer({
        onDrag: (current, initial) => {
          const g = gesture.current;
          const dx = (current.x - initial.x) / g.containerSize;
          const newTrim = Math.min(1, Math.max(0, g.initialEnd + dx));
          if (newTrim < g.initialStart) {
            update({ start: newTrim, end: g.initialStart });
          } else {
            update({ start: g.initialStart, end: newTrim });
          }
        },
        onDragEnd: () => {
          // If the selection was made quickly (tooFast) and is small (tooShort),
          // deselect instead. This allows click-to-deselect even if you drag
          // a little bit by accident. It also allows very quickly making a
          // selection, as long as it is above a minimum length.
          const { start, end } = gesture.current.last;
          const tooFast = elapsedSince(gesture.current.clickStartTime) < MIN_DURATION;
          const tooShort = (end as number) - (start as number) < MIN_TRIM_LENGTH;
          if (tooFast && tooShort) {
            latest.current.onSetTrim(null, null);
          } else {
            latest.current.onSetTrim(start, end);
          }
          setDrag(null);
          notifyPreview(null);
        },
        touchDragAngle: 90,
        distanceThreshold: 0,
      }),
    };
    recognizersRef.current = recognizers;
    return () => {
      recognizers.start.reset();
      recognizers.end.reset();
      recognizersRef.current = null;
    };
  }, []);

  const readContainer = () =>
    containerRef.current?.getBoundingClientRect() ?? { left: 0, width: 1 };

  const handleNewSelectionMouseDown = (e: PointerEvent) => {
    const { width, left } = readContainer();
    const g = gesture.current;
    g.initialEnd = (getEventXY(e).x - left) / width;
    g.initialStart = g.initialEnd;
    g.last = { start: g.initialStart, end: g.initialEnd };
    latest.current.onSetTrim(g.initialStart, g.initialEnd);
    setDrag(g.last);
    latest.current.onPreviewChange?.(g.last as { start: number; end: number });

    g.clickStartTime = nowMs();
    g.containerSize = width;
    recognizersRef.current?.end.start(e);

    e.preventDefault();
  };

  const handleTrimStartMouseDown = (e: PointerEvent) => {
    const g = gesture.current;
    g.containerSize = readContainer().width;
    recognizersRef.current?.start.start(e);
    g.initialStart = latest.current.trimStart as number;
    g.initialEnd = latest.current.trimEnd as number;
    g.last = { start: g.initialStart, end: g.initialEnd };
    e.stopPropagation();
    e.preventDefault();
  };

  const handleTrimEndMouseDown = (e: PointerEvent) => {
    const g = gesture.current;
    g.containerSize = readContainer().width;
    recognizersRef.current?.end.start(e);
    g.initialEnd = latest.current.trimEnd as number;
    g.initialStart = latest.current.trimStart as number;
    g.last = { start: g.initialStart, end: g.initialEnd };
    e.stopPropagation();
    e.preventDefault();
  };

  // 키보드는 부모가 가진 확정된 선택을 옮긴다. 핸들이 포커스를 가진 동안에는 드래그 중이 아니다.
  const stepStart = (delta: number) => {
    const { trimStart: start, trimEnd: end, onSetTrim: set } = latest.current;
    if (start === null || end === null) return;
    set(steppedStart(start, end, delta), end);
  };

  const stepEnd = (delta: number) => {
    const { trimStart: start, trimEnd: end, onSetTrim: set } = latest.current;
    if (start === null || end === null) return;
    set(start, steppedEnd(start, end, delta));
  };

  const shown: Range = drag ?? { start: trimStart, end: trimEnd };

  return (
    <div
      className={`${styles.absolute} ${styles.selector}`}
      ref={containerRef}
      onMouseDown={handleNewSelectionMouseDown}
      onTouchStart={handleNewSelectionMouseDown}
    >
      {shown.start === null || shown.end === null ? null : (
        <div
          className={styles.absolute}
          style={{
            left: `${shown.start * 100}%`,
            width: `${100 * (shown.end - shown.start)}%`,
          }}
        >
          <div className={`${styles.absolute} ${styles.selectionBackground}`} />
          <SelectionHandle
            handleStyle={styles.leftHandle}
            onMouseDown={handleTrimStartMouseDown}
            label={startLabel}
            value={shown.start}
            valueText={valueText?.(shown.start)}
            onStep={stepStart}
          />
          <SelectionHandle
            handleStyle={styles.rightHandle}
            onMouseDown={handleTrimEndMouseDown}
            label={endLabel}
            value={shown.end}
            valueText={valueText?.(shown.end)}
            onStep={stepEnd}
          />
        </div>
      )}
      {playhead !== null ? <Playhead playbackPosition={playhead} /> : null}
    </div>
  );
}
