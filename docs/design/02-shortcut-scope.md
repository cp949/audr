# 02. SoundEditor 단축키 처리 범위

`useSoundEditor`의 `handleKeyDown`과 `resolveShortcutCommand`가 어떤 입력을 처리하고 어떤 입력을 호스트 페이지와 브라우저에 돌려주는지 적는다.

- 사용자에게 보이는 키 목록과 동작은 `packages/audr/README.md`의 "SoundEditor" 단축키 문단과 "단축키 도움말"이 소유한다.
- 키 처리 뒤의 편집 흐름은 [01-sound-editor-edit-flow.md](./01-sound-editor-edit-flow.md)가 다룬다.
- 키 판정은 `packages/audr/src/lib/keyCommand.ts`, 표시용 목록은 `packages/audr/src/lib/shortcuts.ts`, 도움말 UI는 `packages/audr/src/components/ShortcutHelp.tsx`에 있다.

## 처리 순서

`handleKeyDown`은 아래 순서로 걸러 낸다. 앞에서 걸리면 `preventDefault`도 부르지 않고 브라우저 기본 동작에 맡긴다.

1. 텍스트 입력 중이면(`isTextEntryTarget`) 무시한다.
2. 루트를 연결했는데 이 에디터가 활성이 아니면 무시한다.
3. 다른 모달이 위에 있으면(`isBlockedByModal`) 무시한다.
4. `resolveShortcutCommand`가 키 이벤트를 명령으로 판정한다. 판정이 null이면 `preventDefault`도 부르지 않고 돌려준다. 명령이면 훅이 실행한다.

## document에서 듣고 활성 에디터만 처리한다

keydown 리스너는 `document`에 하나 건다. 리스너는 `keyHandlerRef`를 거쳐 매 렌더의 최신 `handleKeyDown`을 부른다. 리스너를 다시 달지 않는다.

`document`에서 듣는 이유:

- busy로 포커스된 버튼이 비활성되면 포커스가 `body`로 간다. 이때도 Space, Delete가 동작해야 한다. 에디터 요소에 리스너를 걸면 놓친다.

`document`에서 듣는 대가와 대응:

- 호스트 페이지의 Space 스크롤, `Ctrl+A`, `Ctrl+C`까지 가로챈다.
- 에디터가 둘이면 둘 다 반응한다.
- 그래서 `activeRef`로 "마지막으로 누르거나 포커스한 곳이 이 에디터 안인가"를 기록하고, 활성일 때만 처리한다.

`activeRef`를 갱신하는 방식:

- `document`의 `pointerdown`과 `focusin`을 capture 단계에서 듣는다. 이벤트 대상이 에디터 루트 안이면 true, 밖이면 false다.
- capture로 듣는 이유: 내부 요소가 전파를 멈춰도 놓치지 않으려는 것이다.
- `blur`는 듣지 않는다. 포커스가 `body`로 빠지는 경우(비활성된 버튼 등)에 활성 상태를 바꾸지 않으려는 것이다. 에디터 밖의 포커스 가능 요소로 옮기면 `focusin`이, 밖을 누르면 `pointerdown`이 false로 만든다.
- 초기값은 false다. 페이지를 연 직후에는 에디터를 한 번 누르거나 포커스해야 단축키가 동작한다.

예외:

- `setContainer`로 루트를 연결하지 않고 훅만 쓰면 활성 검사를 건너뛴다. 문서 전체에서 처리한다.

## 텍스트 입력 제외: `isTextEntryTarget`

- `input`, `textarea`, `select`, `contenteditable` 요소에서 일어난 keydown은 처리하지 않는다. `input`은 type을 보지 않는다. 체크박스, range도 제외된다.
- `document`에서 듣기 때문에 호스트 페이지의 입력까지 걸러야 한다. 에디터 안의 이름 입력도 같은 검사로 걸린다.
- 판단은 `event.target`으로 한다.

## 모달 제외: `isBlockedByModal`

- `aria-modal="true"`인 요소가 문서에 있고 그 안에 이 에디터가 없으면 처리하지 않는다. 기본 동작도 막지 않는다. 모달 안 버튼의 Space와 Enter가 그대로 동작해야 하기 때문이다.
- 이벤트 대상 대신 문서에서 찾는다. 모달이 열린 채 포커스가 `body`로 빠져도 막아야 해서다.
- 에디터를 담은 모달은 제외한다. 에디터가 모달 안에 있으면 처리한다.
- 루트를 연결하지 않은 경우(`containerRef`가 null)는 모든 `aria-modal="true"`가 막는다.
- 이 저장소에서 `aria-modal="true"`를 다는 컴포넌트는 `Modal`(녹음 창)과 `DiscardConfirm`이다.
- 한계 1: `aria-modal`이 없는 오버레이는 알 수 없다. 호스트의 모달은 `aria-modal="true"`를 달아야 한다.
- 한계 2: 요소의 표시 여부는 보지 않는다. 숨겨졌지만 문서에 남은 `aria-modal="true"` 요소가 있으면 계속 막는다.

## 글자 판정: `shortcutLetter`

`Ctrl`/`⌘` 조합의 글자(a~z 소문자)를 정한다. 판정 순서:

1. `event.key`를 소문자로 바꿔 a~z 한 글자면 그 글자를 쓴다.
2. 아니면 `event.code`가 `KeyA`~`KeyZ`일 때 그 글자를 쓴다.
3. 둘 다 아니면 `key`를 소문자로 돌려준다. 어떤 단축키와도 맞지 않는다.

각 규칙이 막는 문제:

- Caps Lock: `key`가 대문자(`Z`)로 온다. 소문자로 맞추지 않으면 `Ctrl+Z`가 안 걸린다.
- 비라틴 자판: 러시아어 자판에서 Z 위치의 키는 `key`가 `я`다. 한글 IME가 처리 중이면 `key`가 `Process`다. 이때는 물리 키 위치(`code`)로 판정한다.
- AZERTY: z가 QWERTY의 W 위치에 있다. `code`를 먼저 보면 AZERTY 사용자의 `Ctrl+Z`가 틀어진다. 그래서 라틴 글자는 `key`를 먼저 따르고, `code`는 라틴 글자가 없을 때만 쓴다.

Space, Delete, Backspace, Escape는 `event.key`로 직접 판정한다. Space는 `" "`다.

## 수정자 키 제외

`Ctrl`, `⌘`, `Alt` 중 하나라도 눌린 Space, Delete, Backspace, Escape는 처리하지 않는다. `preventDefault`도 부르지 않는다. `Shift`는 제외 조건이 아니다. `Shift+Delete`·`Shift+Backspace`는 선택만 남기기이고, `Shift+Space`는 재생·정지다.

글자 단축키(`Ctrl`/`⌘` 조합)는 `Alt`가 함께 눌리면 처리하지 않는다.

`Alt` 판정은 `event.altKey`와 `event.getModifierState?.("AltGraph")` 중 하나라도 참이면 `Alt`가 눌린 것으로 본다. Linux 등에서는 AltGr가 `altKey` 없이 `AltGraph` 상태로만 오기 때문이다.

수정자를 제외하는 이유:

- 다른 단축키 보호: 수정자를 함께 누른 조합은 호스트 페이지, 브라우저 확장, OS가 단축키로 쓸 수 있다. 에디터가 처리하면 `preventDefault`로 그 동작을 막는다. 사용자가 의도하지 않은 삭제·재생도 일어난다.
- 텍스트 편집 단축키(`Ctrl+Delete` 단어 삭제 등)는 이 절과 관계없다. 텍스트 입력 요소의 keydown은 `isTextEntryTarget`이 먼저 거른다.
- AltGr 문자 입력 보호: Windows의 AltGr는 `Ctrl`+`Alt`로 들어온다. 폴란드어 자판의 AltGr+Z는 `ż`를 입력한다. 이때 `key`가 라틴 글자가 아니므로 `shortcutLetter`는 `code`로 `z`를 돌려준다. 제외하지 않으면 undo로 처리된다. AltGr+C(`ć`), AltGr+A(`ą`)도 같다.

## Ctrl/Cmd+Shift 조합

`Ctrl`/`⌘`와 `Shift`를 함께 누른 글자 키는 `Z`(redo)만 처리하고 나머지는 그대로 둔다. Space, Delete, Backspace, Escape는 `Ctrl`/`⌘`가 눌리면 처리하지 않으므로 이 절의 대상이 아니다(위 "수정자 키 제외").

- `Ctrl+Shift+C`는 개발자 도구 요소 검사, `Ctrl+Shift+V`는 서식 없이 붙여넣기, `Ctrl+Shift+A`는 탭 검색이다. 브라우저 단축키를 가로채지 않으려는 것이다.
- 그래서 `Ctrl+Shift+C`, `V`, `A`는 `preventDefault`를 부르지 않고 `return`한다.
- `Ctrl+Y`는 처리하지 않는다. redo는 `Ctrl+Shift+Z`뿐이다.

## 키 반복(repeat)

키를 누르고 있으면 브라우저가 `repeat: true`인 keydown을 계속 보낸다. 재생·정지(Space)와 붙이기(`Ctrl`/`⌘`+V)는 반복 입력을 실행하지 않는다. 처음 누른 한 번만 동작한다.

- 반복마다 실행하면 Space는 재생과 정지를 번갈아 부르고, 붙이기는 누른 시간만큼 누적된다. Chromium에서 반복 10번이 재생·정지를 번갈아 일으키고, 선택이 없을 때 붙이기를 11번 적용해 소리를 2초에서 12초로 늘리는 것을 확인했다. 합성 키 반복(Playwright)으로 본 결과이고 OS의 자동 반복과 다를 수 있다.
- Undo·Redo는 반복을 막지 않는다. 누르고 있으면 이력이 계속 되돌려지는 것은 의도한 동작이다. Delete·Backspace는 첫 입력이 선택을 지워 반복이 저절로 효과가 없다. 복사와 전체 선택은 반복해도 결과가 같다.
- 판정(`resolveShortcutCommand`)은 `repeat`와 무관하게 같은 명령을 돌려주고, 무시할 명령은 `isIgnoredRepeat`(`keyCommand.ts`)가 정한다. 훅은 무시하는 경우에도 `preventDefault`를 부른다. 판정을 `null`로 만들면 `preventDefault`가 빠져 Space 반복마다 호스트 페이지가 스크롤된다.
- 무시할 명령을 바꾸면 `keyCommand.test.ts`의 `IGNORED` 목록도 고친다.

## 판정과 도움말의 일치

키 판정(`resolveShortcutCommand`, `keyCommand.ts`)과 도움말(`SHORTCUT_HELP`, `shortcuts.ts`)은 분리되어 있다. 판정이 `key`, `code`, 수정자를 섞어 이벤트를 직접 분기하므로, 표를 읽어 판정하게 만들지 않았다. 둘이 어긋나도 타입은 막지 못한다.

판정 함수는 이벤트만 보고 `ShortcutAction | null`을 돌려준다. 텍스트 입력, 활성 에디터, 모달 검사와 실행 가능 여부(`canUndo` 등)는 호출한 훅이 정한다. 그래서 판정과 도움말의 대조를 DOM과 React 없이 한다.

`SHORTCUTS`(`undo`, `redo`, `copy`, `paste`, `delete`, `playStop`)는 도움말 목록과 버튼의 툴팁, `aria-keyshortcuts`가 함께 쓴다. 같은 정의를 쓰는 곳은 어긋나지 않는다.

일치 확인:

- `packages/audr/tests/keyCommand.test.ts`가 정방향과 역방향을 모두 대조한다.
  - 정방향: `SHORTCUT_HELP`의 모든 키 조합이 그 동작 이름으로 판정된다. 수정자가 있으면 `Ctrl`과 `⌘`를 모두 누른다.
  - 역방향: 키 10개와 수정자 16가지의 모든 조합 중 명령으로 판정되는 것은 도움말에 같은 동작으로 적혀 있다. 동작 이름이 어긋난 경우도 잡는다.
  - `Shift`를 눌러도 같은 동작인 재생·정지와 선택 해제는 `Shift` 조합을 도움말에 따로 적지 않는다. 테스트가 이 두 동작을 `Shift` 비교에서 뺀다.
- `packages/audr/tests/SoundEditorShortcutHelp.test.tsx`는 훅이 판정 결과를 실제로 실행하는지 확인한다.
- 대조하는 키 목록 밖의 키는 잡지 못한다. 판정에 새 키를 더하면 테스트의 키 목록에도 더한다.

규칙:

- 판정에 키를 더하거나 바꾸면 `SHORTCUT_HELP`, `Messages.shortcutActions`(영어, 한국어), 이 문서의 해당 절을 함께 고친다.

## ShortcutHelp 팝오버의 Space와 Esc

`ShortcutHelp`는 상단 첫 줄 오른쪽 끝의 `?` 버튼과 팝오버 목록이다. 팝오버는 네이티브 Popover API 없이 직접 만든다(Chrome 75 floor).

Space:

- `document`의 Space 처리는 `preventDefault`를 부른다. 도움말 버튼에 포커스가 있을 때 그대로 두면 버튼이 눌리지 않고 재생이 시작된다.
- 버튼의 `onKeyDown`이 Space만 `stopPropagation`한다. React 19는 이벤트를 루트 컨테이너에서 받으므로 `document` 리스너까지 올라가지 않는다.
- 이 예외는 도움말 버튼에만 있다. 다른 버튼에 포커스가 있을 때의 Space는 재생·정지로 가로채인다.

Esc:

- `useSoundEditor`는 `document`의 bubble 단계에서 Esc를 "선택 해제"로 처리한다. 팝오버를 Esc로 닫을 때 선택까지 풀리면 안 된다.
- 팝오버가 열려 있는 동안만 `document`의 capture 단계에 keydown 리스너를 달아 Esc를 먼저 받고 `stopPropagation`한다. bubble 단계의 훅 리스너는 호출되지 않는다.
- 팝오버가 닫혀 있으면 리스너가 없어 Esc는 선택 해제로 동작한다.
- 바깥 누르기 닫기도 같은 방식으로 `pointerdown`을 capture 단계에서 듣는다.
