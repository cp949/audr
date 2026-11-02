// 시간 표시줄 안의 단축키 도움말. 버튼으로 목록을 펼치고 접는다. 모달이나 포털은 쓰지 않는다.
import { Fragment, useId, useState, type KeyboardEvent } from "react";
import type { Messages } from "../i18n";
import { formatShortcut, SHORTCUT_HELP } from "../lib/shortcuts";
import styles from "./sound-editor.module.css";

export type ShortcutHelpProps = {
  messages: Messages;
  /** Apple 플랫폼이면 ⌘ 표기로 보인다 */
  apple: boolean;
};

/** 기본은 접힌 상태다. 시간 표시줄(flex 줄바꿈 컨테이너) 안에서 버튼과 목록을 형제로 낸다. */
export function ShortcutHelp({ messages, apple }: ShortcutHelpProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  // useSoundEditor는 문서 전체에서 keydown을 듣고 Space를 재생·정지로 가로챈다.
  // 그대로 두면 이 버튼에 포커스가 있을 때 Space가 버튼을 누르지 못하고 재생이 시작된다.
  // 버튼에서 올라가는 Space만 문서까지 보내지 않아 브라우저 기본 동작(버튼 누름)을 살린다.
  const keepSpaceForButton = (event: KeyboardEvent) => {
    if (event.key === " ") event.stopPropagation();
  };

  return (
    <>
      <button
        type="button"
        className={styles.shortcutToggle}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onKeyDown={keepSpaceForButton}
        onClick={() => setOpen((value) => !value)}
      >
        {messages.shortcutsToggle}
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
    </>
  );
}
