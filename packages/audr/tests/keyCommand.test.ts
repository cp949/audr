import { describe, expect, it } from "vitest";
import { isIgnoredRepeat, resolveShortcutCommand, type KeyEventLike } from "../src/lib/keyCommand";
import { SHORTCUT_HELP, type ShortcutAction, type Shortcut } from "../src/lib/shortcuts";

const press = (key: string, init: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...init,
});

/** 도움말의 키 표기(`Space`, `Z`)를 keydown의 key 값으로 바꾼다 */
const eventKey = (shortcut: Shortcut) =>
  shortcut.key === "Space"
    ? " "
    : shortcut.key.length === 1
      ? shortcut.key.toLowerCase()
      : shortcut.key;

/** Shift를 눌러도 같은 동작이어서 도움말에 Shift 조합을 따로 적지 않는 동작 */
const SHIFT_IGNORED: readonly string[] = ["playStop", "clearSelection"];

describe("resolveShortcutCommand 도움말 목록과의 일치", () => {
  it("도움말에 적힌 모든 키 조합이 그 동작 이름으로 판정된다", () => {
    for (const { action, keys } of SHORTCUT_HELP) {
      for (const shortcut of keys) {
        // 수정자가 있는 조합은 Ctrl과 ⌘ 어느 쪽이든 받아야 한다
        const mods = shortcut.mod ? [{ ctrlKey: true }, { metaKey: true }] : [{}];
        for (const mod of mods) {
          const event = press(eventKey(shortcut), { ...mod, shiftKey: shortcut.shift === true });
          expect(resolveShortcutCommand(event), `${action} ${JSON.stringify(shortcut)}`).toBe(
            action,
          );
        }
      }
    }
  });

  it("키와 수정자의 모든 조합 중 명령으로 판정되는 것은 도움말에 같은 동작으로 적혀 있다", () => {
    const keys = [" ", "Delete", "Backspace", "Escape", "Enter", "a", "c", "v", "y", "z"];
    for (const key of keys) {
      for (let bits = 0; bits < 16; bits++) {
        const event = press(key, {
          ctrlKey: (bits & 1) !== 0,
          metaKey: (bits & 2) !== 0,
          altKey: (bits & 4) !== 0,
          shiftKey: (bits & 8) !== 0,
        });
        const action = resolveShortcutCommand(event);
        if (action === null) continue;
        const mod = event.ctrlKey || event.metaKey;
        const listed = SHORTCUT_HELP.some(
          (entry) =>
            entry.action === action &&
            entry.keys.some(
              (shortcut) =>
                eventKey(shortcut) === key &&
                (shortcut.mod === true) === mod &&
                (SHIFT_IGNORED.includes(action) || (shortcut.shift === true) === event.shiftKey),
            ),
        );
        expect(listed, `${JSON.stringify(event)} → ${action}`).toBe(true);
      }
    }
  });
});

describe("resolveShortcutCommand 처리하지 않는 입력", () => {
  it("Ctrl+Y는 redo가 아니다", () => {
    expect(resolveShortcutCommand(press("y", { ctrlKey: true }))).toBeNull();
  });

  it("Ctrl+Shift+C·V·A는 브라우저 단축키라 처리하지 않는다", () => {
    for (const key of ["c", "v", "a"]) {
      expect(resolveShortcutCommand(press(key, { ctrlKey: true, shiftKey: true }))).toBeNull();
    }
  });

  it("Ctrl·⌘·Alt가 함께 눌린 Space·Delete·Backspace·Escape는 처리하지 않는다", () => {
    for (const key of [" ", "Delete", "Backspace", "Escape"]) {
      for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
        expect(resolveShortcutCommand(press(key, mod))).toBeNull();
      }
    }
  });

  it("Shift는 Space를 막지 않는다", () => {
    expect(resolveShortcutCommand(press(" ", { shiftKey: true }))).toBe("playStop");
  });
});

describe("resolveShortcutCommand 글자 판정", () => {
  it("Caps Lock으로 key가 대문자여도 undo로 판정한다", () => {
    expect(resolveShortcutCommand(press("Z", { ctrlKey: true, code: "KeyZ" }))).toBe("undo");
  });

  it("러시아어 자판처럼 key가 라틴 글자가 아니면 물리 키 위치(code)로 판정한다", () => {
    expect(resolveShortcutCommand(press("я", { ctrlKey: true, code: "KeyZ" }))).toBe("undo");
    expect(resolveShortcutCommand(press("Process", { metaKey: true, code: "KeyC" }))).toBe("copy");
  });

  it("AZERTY는 key를 먼저 따른다: z 글자가 W 위치(KeyW)에 있어도 undo다", () => {
    expect(resolveShortcutCommand(press("z", { ctrlKey: true, code: "KeyW" }))).toBe("undo");
    expect(resolveShortcutCommand(press("w", { ctrlKey: true, code: "KeyZ" }))).toBeNull();
  });

  it("AltGr 문자 입력(Ctrl+Alt)은 비라틴 key여도 처리하지 않는다", () => {
    expect(
      resolveShortcutCommand(press("ż", { ctrlKey: true, altKey: true, code: "KeyZ" })),
    ).toBeNull();
  });

  it("altKey 없이 AltGraph 상태로만 오는 입력도 Alt로 본다", () => {
    const event = press("ż", {
      ctrlKey: true,
      code: "KeyZ",
      getModifierState: (key) => key === "AltGraph",
    });
    expect(resolveShortcutCommand(event)).toBeNull();
  });
});

describe("키를 누르고 있을 때(repeat)", () => {
  const actions = SHORTCUT_HELP.map((entry) => entry.action);
  // 반복하면 재생이 번갈아 시작·정지하거나 붙이기가 누적되는 명령. undo·redo의 연속과 나머지는 반복해도 된다
  const IGNORED: readonly ShortcutAction[] = ["playStop", "paste"];

  it("repeat는 판정을 바꾸지 않는다", () => {
    expect(resolveShortcutCommand(press(" ", { repeat: true }))).toBe("playStop");
    expect(resolveShortcutCommand(press("v", { ctrlKey: true, repeat: true }))).toBe("paste");
  });

  it("반복 입력은 재생·정지와 붙이기만 무시한다", () => {
    for (const action of actions) {
      expect(isIgnoredRepeat(press("x", { repeat: true }), action), action).toBe(
        IGNORED.includes(action),
      );
    }
  });

  it("처음 누른 입력(repeat가 false 또는 없음)은 무시하지 않는다", () => {
    for (const action of actions) {
      expect(isIgnoredRepeat(press("x"), action), action).toBe(false);
      expect(isIgnoredRepeat(press("x", { repeat: false }), action), action).toBe(false);
    }
  });
});
