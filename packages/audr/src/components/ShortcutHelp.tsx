// 도구 줄 오른쪽 끝의 단축키 도움말. 작은 `?` 버튼을 누르면 목록이 팝오버로 뜬다. 레이아웃은 밀지 않는다.
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Messages } from "../i18n";
import { formatShortcut, SHORTCUT_HELP } from "../lib/shortcuts";
import styles from "./sound-editor.module.css";

export type ShortcutHelpProps = {
  messages: Messages;
  /** Apple 플랫폼이면 ⌘ 표기로 보인다 */
  apple: boolean;
};

/**
 * 기본은 닫힌 상태다. 버튼 다시 누르기, Esc, 바깥 누르기로 닫는다.
 * 네이티브 Popover API와 anchor positioning은 Chrome 75에 없어서 직접 만든다.
 * 버튼이 줄 오른쪽 끝에 있으므로 팝오버는 버튼의 오른쪽 가장자리에 맞춘다.
 */
export function ShortcutHelp({ messages, apple }: ShortcutHelpProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    // useSoundEditor는 document의 bubble 단계에서 Esc를 "선택 해제"로 처리한다.
    // capture 단계에서 먼저 받아 전파를 끊으면 팝오버를 닫을 때 선택이 함께 풀리지 않는다.
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  // useSoundEditor는 문서 전체에서 keydown을 듣고 Space를 재생·정지로 가로챈다.
  // 그대로 두면 이 버튼에 포커스가 있을 때 Space가 버튼을 누르지 못하고 재생이 시작된다.
  // 버튼에서 올라가는 Space만 문서까지 보내지 않아 브라우저 기본 동작(버튼 누름)을 살린다.
  const keepSpaceForButton = (event: KeyboardEvent) => {
    if (event.key === " ") event.stopPropagation();
  };

  return (
    <span ref={rootRef} className={styles.shortcutHelp}>
      <button
        type="button"
        className={styles.shortcutToggle}
        aria-label={messages.shortcutsToggle}
        title={messages.shortcutsToggle}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onKeyDown={keepSpaceForButton}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open ? (
        <dl id={listId} className={styles.shortcutList}>
          {SHORTCUT_HELP.map(({ action, keys }) => (
            <Fragment key={action}>
              <dt>{messages.shortcutActions[action]}</dt>
              <dd>{keys.map((shortcut) => formatShortcut(shortcut, apple)).join(" / ")}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
    </span>
  );
}
