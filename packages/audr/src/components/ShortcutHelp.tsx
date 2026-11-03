// 상단 첫 줄 오른쪽 끝의 단축키 도움말. 작은 `?` 버튼을 누르면 목록이 팝오버로 뜬다. 레이아웃은 밀지 않는다.
import { Fragment, useId, useRef, useState } from "react";
import { keepSpaceForButton, usePopoverDismiss } from "../hooks/usePopoverDismiss";
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

  usePopoverDismiss(open, rootRef, () => setOpen(false));

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
