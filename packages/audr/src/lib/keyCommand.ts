// keydown 이벤트를 편집 명령으로 바꾸는 판정. 이벤트만 보고 정하는 순수 함수라 DOM 없이 검증한다.
// 어디서 누른 키인지(텍스트 입력, 활성 에디터, 모달)와 명령을 실행할지(undo 가능 여부 등)는 호출한 쪽이 정한다.
// 처리 범위의 근거는 docs/design/02-shortcut-scope.md다.
import type { ShortcutAction } from "./shortcuts";

/** 판정에 쓰는 키 이벤트 필드. KeyboardEvent와 테스트용 객체가 모두 맞는다. */
export type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
> & { repeat?: boolean; getModifierState?: (key: string) => boolean };

/**
 * Ctrl/⌘ 단축키에 쓸 글자(a~z 소문자)를 정한다.
 * Caps Lock이 켜지면 key가 대문자로 들어오므로 소문자로 맞춘다.
 * 러시아어 자판이나 한글 IME("Process")처럼 key가 라틴 글자가 아니면 물리 키 위치(code)로 판정한다.
 * 라틴 자판은 code 대신 key를 따른다. AZERTY는 z가 QWERTY의 W 자리에 있어서다.
 */
function shortcutLetter(event: KeyEventLike): string {
  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;
  const match = /^Key([A-Z])$/.exec(event.code);
  return match ? (match[1] as string).toLowerCase() : key;
}

/**
 * 이 키 입력이 가리키는 명령. 처리하지 않는 입력이면 null이다.
 * null이면 호출한 쪽은 `preventDefault`도 부르지 않고 브라우저 기본 동작에 맡긴다.
 * 돌려주는 값은 도움말 목록(SHORTCUT_HELP)의 동작 이름과 같다.
 */
export function resolveShortcutCommand(event: KeyEventLike): ShortcutAction | null {
  // Ctrl·⌘·Alt(AltGr)가 눌린 조합은 브라우저·OS 단축키나 AltGr 문자 입력이라 처리하지 않는다
  const alt = event.altKey || event.getModifierState?.("AltGraph") === true;
  const mod = event.ctrlKey || event.metaKey;
  if (alt) return null;
  if (!mod) {
    if (event.key === " ") return "playStop";
    if (event.key === "Delete" || event.key === "Backspace") {
      return event.shiftKey ? "keepSelection" : "delete";
    }
    if (event.key === "Escape") return "clearSelection";
    return null;
  }
  const letter = shortcutLetter(event);
  if (event.shiftKey) {
    // Ctrl+Shift+C/V/A는 브라우저 단축키(개발자 도구, 서식 없이 붙여넣기, 탭 검색)라 그대로 둔다
    return letter === "z" ? "redo" : null;
  }
  switch (letter) {
    case "z":
      return "undo";
    case "c":
      return "copy";
    case "v":
      return "paste";
    case "a":
      return "selectAll";
    default:
      return null;
  }
}

/**
 * 누르고 있어서 반복해 오는 keydown(repeat)을 실행하지 않을 명령. 반복마다 부르면 재생이 번갈아
 * 시작·정지하고(Space), 붙이기가 누적된다(Ctrl+V). undo·redo의 연속과 나머지 명령은 반복해도 된다.
 */
const REPEAT_IGNORED: readonly ShortcutAction[] = ["playStop", "paste"];

/**
 * 반복 입력이라 실행하지 않을 명령인지. resolveShortcutCommand의 판정은 바꾸지 않는다.
 * 호출한 쪽은 true여도 `preventDefault`는 불러야 한다. 부르지 않으면 Space 반복마다 페이지가 스크롤된다.
 */
export function isIgnoredRepeat(event: KeyEventLike, command: ShortcutAction): boolean {
  return event.repeat === true && REPEAT_IGNORED.includes(command);
}
