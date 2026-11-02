// 단축키 표기. 어떤 키가 어떤 명령인지는 lib/keyCommand.ts(resolveShortcutCommand)가 정하고, 여기는 화면과 보조기기용 표기만 만든다.
import { useSyncExternalStore } from "react";

/** 키 조합 정의. 수정자는 Ctrl/⌘ 중 어느 쪽이든 resolveShortcutCommand가 받으므로 `mod` 하나로 둔다. */
export type Shortcut = { mod?: boolean; shift?: boolean; key: string };

export const SHORTCUTS = {
  undo: { mod: true, key: "Z" },
  redo: { mod: true, shift: true, key: "Z" },
  copy: { mod: true, key: "C" },
  paste: { mod: true, key: "V" },
  delete: { key: "Delete" },
  playStop: { key: "Space" },
} as const satisfies Record<string, Shortcut>;

/** 도움말에 보이는 동작. `Messages.shortcutActions`의 키와 같다. */
export type ShortcutAction =
  | "playStop"
  | "delete"
  | "keepSelection"
  | "clearSelection"
  | "selectAll"
  | "undo"
  | "redo"
  | "copy"
  | "paste";

/**
 * 단축키 도움말 목록. resolveShortcutCommand가 판정하는 키와 같아야 한다.
 * 판정 함수는 이벤트를 직접 분기해서 이 표를 읽지 않으므로 둘이 어긋나도 타입으로는 막지 못한다.
 * keyCommand.test.ts가 두 방향을 모두 대조한다: 목록의 모든 키가 그 동작으로 판정되는지,
 * 키와 수정자의 모든 조합 중 명령으로 판정되는 것이 목록에 같은 동작으로 있는지.
 * 판정에 키를 더하거나 바꾸면 이 표도 함께 고친다.
 * Ctrl+Y는 처리하지 않으므로 넣지 않는다.
 */
export const SHORTCUT_HELP: readonly { action: ShortcutAction; keys: readonly Shortcut[] }[] = [
  { action: "playStop", keys: [SHORTCUTS.playStop] },
  { action: "delete", keys: [SHORTCUTS.delete, { key: "Backspace" }] },
  {
    action: "keepSelection",
    keys: [
      { shift: true, key: "Delete" },
      { shift: true, key: "Backspace" },
    ],
  },
  { action: "clearSelection", keys: [{ key: "Escape" }] },
  { action: "selectAll", keys: [{ mod: true, key: "A" }] },
  { action: "undo", keys: [SHORTCUTS.undo] },
  { action: "redo", keys: [SHORTCUTS.redo] },
  { action: "copy", keys: [SHORTCUTS.copy] },
  { action: "paste", keys: [SHORTCUTS.paste] },
];

/** macOS·iOS 계열인지 본다. navigator가 없거나 값을 알 수 없으면 false(Ctrl)다. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  // userAgentData는 일부 브라우저에만 있다. 없으면 deprecated인 platform으로 대신한다.
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** 툴팁에 쓰는 표기. Apple은 `⇧⌘Z`, 그 밖에는 `Ctrl+Shift+Z`다. */
export function formatShortcut(shortcut: Shortcut, apple: boolean): string {
  if (apple) {
    return `${shortcut.shift ? "⇧" : ""}${shortcut.mod ? "⌘" : ""}${shortcut.key}`;
  }
  return [shortcut.mod ? "Ctrl" : null, shortcut.shift ? "Shift" : null, shortcut.key]
    .filter(Boolean)
    .join("+");
}

/**
 * aria-keyshortcuts 값. handleKeyDown이 Ctrl과 ⌘를 모두 받으므로 두 조합을 공백으로 함께 적는다.
 */
export function ariaKeyShortcuts(shortcut: Shortcut): string {
  const tail = [shortcut.shift ? "Shift" : null, shortcut.key].filter(Boolean);
  if (!shortcut.mod) return tail.join("+");
  return [
    ["Control", ...tail],
    ["Meta", ...tail],
  ]
    .map((keys) => keys.join("+"))
    .join(" ");
}

const subscribeNoop = () => () => {};

/**
 * 플랫폼 판별 결과를 돌려준다. 서버 렌더에서는 항상 false여서
 * 클라이언트와 속성이 달라도 hydration 경고가 나지 않는다.
 */
export function useIsApplePlatform(): boolean {
  return useSyncExternalStore(subscribeNoop, isApplePlatform, () => false);
}

/** 라벨에 단축키를 붙인 툴팁 문구. 예: `Undo (Ctrl+Z)` */
export function withShortcut(label: string, shortcut: Shortcut, apple: boolean): string {
  return `${label} (${formatShortcut(shortcut, apple)})`;
}
