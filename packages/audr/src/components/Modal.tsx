// overlay, 제목, 닫기 버튼만 가진 단순 모달이다(react-modal, redux 없음).
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import closeIcon from "../assets/icons/record-modal/icon--close.svg";
import type { AudrTheme } from "../theme";
import styles from "./modal.module.css";

export type ModalProps = {
  /** 헤더에 보이는 제목이며 dialog의 접근 가능한 이름이다 */
  title: string;
  /** 닫기 버튼의 접근 가능한 이름 */
  closeLabel: string;
  className?: string;
  /** 오버레이에 걸어 모달 전체가 테마 변수를 물려받게 한다 */
  theme?: AudrTheme;
  /** 닫기 버튼, Esc, 배경 클릭에서 호출한다 */
  onRequestClose: () => void;
  children: ReactNode;
};

/** Tab으로 이동할 수 있는 요소 선택자. 비활성(disabled)과 tabindex="-1"은 뺀다. */
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab 순환. 모달 밖으로 포커스가 나가지 않게 처음과 끝을 이어 준다. */
function trapTab(e: KeyboardEvent, content: HTMLElement): void {
  const items = Array.from(content.querySelectorAll<HTMLElement>(TABBABLE));
  const first = items[0];
  const last = items[items.length - 1];
  // 포커스 가능한 요소가 없으면 컨테이너에 머문다
  if (!first || !last) {
    e.preventDefault();
    content.focus();
    return;
  }
  const active = document.activeElement;
  const outside = !(active instanceof Node) || !content.contains(active);
  if (e.shiftKey) {
    if (outside || active === first || active === content) {
      e.preventDefault();
      last.focus();
    }
  } else if (outside || active === last) {
    e.preventDefault();
    first.focus();
  }
}

export function Modal({
  title,
  closeLabel,
  className,
  theme,
  onRequestClose,
  children,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  // 배경에서 누르기 시작한 클릭만 닫기로 본다 (안쪽에서 끌어 배경에서 놓는 경우는 제외)
  const pressedOnOverlay = useRef(false);
  const closeRef = useRef(onRequestClose);
  useEffect(() => {
    closeRef.current = onRequestClose;
  });

  useEffect(() => {
    // 닫을 때 돌아갈 요소. 포커스를 옮기기 전에 잡아야 한다.
    const opener = document.activeElement;
    const content = contentRef.current;
    content?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      // 누르고 있을 때 오는 반복 입력은 무시한다. 닫기 요청이 확인창을 열고 닫기를 되풀이하게 된다
      if (e.key === "Escape" && !e.repeat) closeRef.current();
      if (e.key === "Tab" && content) trapTab(e, content);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // 열기 전 요소가 DOM에서 사라졌으면 복귀하지 않는다
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return createPortal(
    <div
      className={styles.modalOverlay}
      data-audr-theme={theme}
      onMouseDown={(e) => {
        pressedOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnOverlay.current) onRequestClose();
        pressedOnOverlay.current = false;
      }}
    >
      <div
        className={[styles.modalContent, className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={contentRef}
      >
        <div className={styles.body}>
          <div className={styles.header}>
            <div className={`${styles.headerItem} ${styles.headerItemTitle}`}>{title}</div>
            <div className={`${styles.headerItem} ${styles.headerItemClose}`}>
              <button
                type="button"
                aria-label={closeLabel}
                className={styles.closeButton}
                onClick={onRequestClose}
              >
                <img className={styles.closeIcon} src={closeIcon} draggable={false} alt="" />
              </button>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
