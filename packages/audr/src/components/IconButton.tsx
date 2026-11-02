import { useId, type ReactNode } from "react";
import styles from "./icon-button.module.css";

export type IconButtonProps = {
  className?: string;
  disabled?: boolean;
  img: string;
  title: ReactNode;
  /** 호버 툴팁(title 속성). 접근 가능한 이름은 `title` 내용 그대로 두고 단축키 안내만 싣는다. */
  tooltip?: string;
  /** aria-keyshortcuts 값 */
  keyShortcuts?: string;
  /**
   * 비활성인 이유. `disabled`일 때만 쓴다.
   * 스크린 리더용 숨김 설명(aria-describedby)과 마우스용 툴팁(title)으로 함께 알린다.
   */
  disabledReason?: string;
  /** 버튼 바깥에 있는 설명 요소의 id. 비활성 이유가 있으면 그 뒤에 이어 붙여 함께 읽힌다 */
  describedBy?: string;
  onClick: () => void;
};

export function IconButton({
  img,
  disabled,
  className,
  title,
  tooltip,
  keyShortcuts,
  disabledReason,
  describedBy,
  onClick,
}: IconButtonProps) {
  const reasonId = useId();
  // 이유가 없는 비활성 버튼은 pointer-events를 끈 채로 둔다
  const reason = disabled ? disabledReason : undefined;
  const describedByIds = [reason ? reasonId : null, describedBy].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={[
        styles.container,
        className,
        disabled ? styles.disabled : null,
        reason ? styles.disabledWithReason : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={disabled}
      title={reason ?? tooltip}
      aria-keyshortcuts={keyShortcuts}
      aria-describedby={describedByIds || undefined}
    >
      <img draggable={false} src={img} alt="" />
      <div className={styles.title}>{title}</div>
      {reason && (
        // 버튼 안에 있어서 aria-hidden이 없으면 접근 가능한 이름에 섞인다.
        // aria-describedby는 숨겨진 요소도 참조하므로 설명으로는 그대로 읽힌다.
        <span id={reasonId} className={styles.visuallyHidden} aria-hidden="true">
          {reason}
        </span>
      )}
    </button>
  );
}
