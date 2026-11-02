// 녹음이 사라지는 동작(닫기, 다시 녹음) 앞에서 묻는 확인 UI. RecordDialog의 body 안쪽에 덮어 그린다.
import { useId, useLayoutEffect, useRef } from "react";
import type { Messages } from "../i18n";
import styles from "./record-dialog.module.css";

/** 무엇이 녹음을 버리게 하는지. 설명 문구만 다르다. */
export type DiscardReason = "close" | "reRecord";

export type DiscardConfirmProps = {
  messages: Messages;
  reason: DiscardReason;
  /** 돌아가기. 녹음을 그대로 두고 확인창만 닫는다 */
  onKeep: () => void;
  /** 버리기 */
  onDiscard: () => void;
};

/**
 * 열리면 안전한 버튼(돌아가기)에 포커스를 둔다. 실수로 Enter나 Space를 눌러도 녹음이 남게 하려는 것이다.
 * 포커스를 열기 전 자리로 돌리는 일은 여는 쪽이 맡는다. 버리기로 대화상자가 사라질 때는 돌릴 곳이 없기 때문이다.
 * Esc는 Modal이 받아 여는 쪽에서 처리하므로 여기서 키 입력을 다루지 않는다.
 */
export function DiscardConfirm({ messages: m, reason, onKeep, onDiscard }: DiscardConfirmProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const keepRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    keepRef.current?.focus();
  }, []);

  return (
    <div
      className={styles.discardConfirm}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div id={titleId} className={styles.discardTitle}>
        {m.discardTitle}
      </div>
      <p id={descriptionId} className={styles.discardDescription}>
        {reason === "close" ? m.discardOnClose : m.discardOnReRecord}
      </p>
      <div className={styles.discardButtons}>
        <button type="button" className={styles.keepButton} ref={keepRef} onClick={onKeep}>
          {m.discardKeep}
        </button>
        <button type="button" className={styles.discardButton} onClick={onDiscard}>
          {m.discardConfirm}
        </button>
      </div>
    </div>
  );
}
