import { useEffect, useLayoutEffect, useRef } from "react";
import type { MouseEvent, TouchEvent } from "react";
import { DragRecognizer } from "../lib/dragRecognizer";
import { MIN_TRIM_LENGTH, steppedEnd, steppedStart } from "../lib/trimKeys";
import styles from "./audio-trimmer.module.css";
import { Playhead } from "./Playhead";
import { SelectionHandle } from "./SelectionHandle";

export type AudioTrimmerProps = {
  /** 재생 위치 (0~1). null이면 재생 중이 아니다 */
  playhead: number | null;
  trimStart: number;
  trimEnd: number;
  onSetTrimStart: (value: number) => void;
  onSetTrimEnd: (value: number) => void;
  /** 시작 핸들의 접근 가능한 이름 */
  startLabel: string;
  /** 끝 핸들의 접근 가능한 이름 */
  endLabel: string;
  /** 핸들 위치(0~1)를 스크린 리더가 읽을 문구로 바꾼다. 없으면 퍼센트만 읽는다 */
  valueText?: (position: number) => string;
};

type PointerEvent = MouseEvent<HTMLElement> | TouchEvent<HTMLElement>;

export function AudioTrimmer({
  playhead,
  trimStart,
  trimEnd,
  onSetTrimStart,
  onSetTrimEnd,
  startLabel,
  endLabel,
  valueText,
}: AudioTrimmerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 드래그 콜백이 항상 최신 props를 읽도록 한다
  const latest = useRef({ trimStart, trimEnd, onSetTrimStart, onSetTrimEnd });
  useLayoutEffect(() => {
    latest.current = { trimStart, trimEnd, onSetTrimStart, onSetTrimEnd };
  });

  const gesture = useRef({ containerSize: 1, initialTrim: 0 });

  // recognizer는 렌더 밖(effect)에서 만들고, unmount 때 window 리스너를 떼어
  // 콜백이 더 이상 불리지 않게 한다.
  const recognizersRef = useRef<{ start: DragRecognizer; end: DragRecognizer } | null>(null);
  useEffect(() => {
    const recognizers = {
      start: new DragRecognizer({
        onDrag: (current, initial) => {
          const dx = (current.x - initial.x) / gesture.current.containerSize;
          const newTrim = Math.max(
            0,
            Math.min(latest.current.trimEnd - MIN_TRIM_LENGTH, gesture.current.initialTrim + dx),
          );
          latest.current.onSetTrimStart(newTrim);
        },
        touchDragAngle: 90,
        distanceThreshold: 0,
      }),
      end: new DragRecognizer({
        onDrag: (current, initial) => {
          const dx = (current.x - initial.x) / gesture.current.containerSize;
          const newTrim = Math.min(
            1,
            Math.max(latest.current.trimStart + MIN_TRIM_LENGTH, gesture.current.initialTrim + dx),
          );
          latest.current.onSetTrimEnd(newTrim);
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

  const handleTrimStartMouseDown = (e: PointerEvent) => {
    gesture.current.containerSize = containerRef.current?.getBoundingClientRect().width ?? 1;
    recognizersRef.current?.start.start(e);
    gesture.current.initialTrim = latest.current.trimStart;
  };

  const handleTrimEndMouseDown = (e: PointerEvent) => {
    gesture.current.containerSize = containerRef.current?.getBoundingClientRect().width ?? 1;
    recognizersRef.current?.end.start(e);
    gesture.current.initialTrim = latest.current.trimEnd;
  };

  const stepStart = (delta: number) => {
    const { trimStart: start, trimEnd: end, onSetTrimStart: set } = latest.current;
    set(steppedStart(start, end, delta));
  };

  const stepEnd = (delta: number) => {
    const { trimStart: start, trimEnd: end, onSetTrimEnd: set } = latest.current;
    set(steppedEnd(start, end, delta));
  };

  return (
    <div className={`${styles.absolute} ${styles.trimmer}`} ref={containerRef}>
      <div
        className={`${styles.absolute} ${styles.trimBackground} ${styles.startTrimBackground}`}
        style={{ width: `${100 * trimStart}%` }}
        onMouseDown={handleTrimStartMouseDown}
        onTouchStart={handleTrimStartMouseDown}
      >
        <div className={`${styles.absolute} ${styles.trimBackgroundMask}`} />
        <SelectionHandle
          handleStyle={styles.leftHandle}
          label={startLabel}
          value={trimStart}
          valueText={valueText?.(trimStart)}
          onStep={stepStart}
        />
      </div>
      {playhead !== null ? <Playhead playbackPosition={playhead} /> : null}
      <div
        className={`${styles.absolute} ${styles.trimBackground} ${styles.endTrimBackground}`}
        style={{ left: `${100 * trimEnd}%`, width: `${100 - 100 * trimEnd}%` }}
        onMouseDown={handleTrimEndMouseDown}
        onTouchStart={handleTrimEndMouseDown}
      >
        <div className={`${styles.absolute} ${styles.trimBackgroundMask}`} />
        <SelectionHandle
          handleStyle={styles.rightHandle}
          label={endLabel}
          value={trimEnd}
          valueText={valueText?.(trimEnd)}
          onStep={stepEnd}
        />
      </div>
    </div>
  );
}
