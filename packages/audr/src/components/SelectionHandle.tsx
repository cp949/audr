// 키보드 조작: onStep을 주면 슬라이더로 동작한다(←/→ 1%, Shift+←/→ 10%).
import type { KeyboardEvent, MouseEvent, TouchEvent } from "react";
import handleIcon from "../assets/icons/audio-trimmer/icon--handle.svg";
import { trimKeyDelta } from "../lib/trimKeys";
import styles from "./audio-trimmer.module.css";

export type SelectionHandleProps = {
  /** 부모 CSS Module의 leftHandle, rightHandle 같은 위치 클래스 */
  handleStyle?: string;
  onMouseDown?: (e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => void;
  /** 슬라이더의 접근 가능한 이름. onStep과 함께 준다 */
  label?: string;
  /** 현재 위치 (0~1). 스크린 리더에 퍼센트로 알린다 */
  value?: number;
  /** 위치를 읽는 문구(예: "1.25 seconds"). 주면 퍼센트 대신 스크린 리더가 이 문구를 읽는다 */
  valueText?: string;
  /** 키보드로 옮길 때 호출한다. delta는 0~1 단위(예: 0.01) */
  onStep?: (delta: number) => void;
};

export function SelectionHandle({
  handleStyle,
  onMouseDown,
  label,
  value,
  valueText,
  onStep,
}: SelectionHandleProps) {
  const keyboard = onStep
    ? {
        role: "slider",
        tabIndex: 0,
        "aria-label": label,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.round((value ?? 0) * 100),
        "aria-valuetext": valueText,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          const delta = trimKeyDelta(e);
          if (delta === null) return;
          // 화면 스크롤을 막고 핸들만 옮긴다
          e.preventDefault();
          onStep(delta);
        },
      }
    : {};
  return (
    <div
      className={[styles.trimLine, handleStyle].filter(Boolean).join(" ")}
      onMouseDown={onMouseDown}
      onTouchStart={onMouseDown}
      {...keyboard}
    >
      <div className={`${styles.trimHandle} ${styles.topTrimHandle}`}>
        <img src={handleIcon} draggable={false} alt="" />
      </div>
      <div className={`${styles.trimHandle} ${styles.bottomTrimHandle}`}>
        <img src={handleIcon} draggable={false} alt="" />
      </div>
    </div>
  );
}
