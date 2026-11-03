# 05. 효과 버튼 배치(effectsLayout)

`SoundEditor`의 `effectsLayout`(`"expanded"`, `"minimized"`, `"overflow"`, `"auto"`)이 효과 버튼 19개를 어떻게 보이는지, 그 구조를 왜 이렇게 만들었는지 적는다.

- 사용자에게 보이는 값과 동작은 `packages/audr/README.md`의 "레이아웃과 폭"이 소유한다.
- 구현은 `packages/audr/src/components/EffectPanel.tsx`, 스타일은 `sound-editor.module.css`의 `effect*` 규칙이다.
- 지원 브라우저 하한은 [ADR-0001](../adr/0001-chrome-75-browser-floor.md)을 따른다.

## 호스트가 고른다

- 값은 prop으로 받는다. 기본값은 `"expanded"`라서 기존 호스트의 모양이 바뀌지 않는다.
- 폭에 따라 바꾸는 `"auto"`는 `expanded`와 `overflow` 사이만 오간다. `minimized`는 호스트가 고를 때만 쓴다. 호스트가 자기 폭을 보고 직접 고를 수도 있다.

## minimized

- `Effects` 버튼 하나가 한 줄을 차지한다.
- 팝오버는 열려 있을 때만 그린다. 닫힌 동안 효과 버튼은 DOM에 없다.
- 팝오버는 버튼 아래에서 에디터 폭을 채우고, `position: absolute`라서 레이아웃을 밀지 않는다.

## overflow

한 줄만 보이고 나머지는 팝오버로 둔다. 효과 버튼 전체를 DOM에 한 번만 그리는 것이 핵심이다.

- 접힌 상태는 첫 줄 높이로 자른 상자다. 펼친 상태는 같은 상자를 높이 제한 없이 흰 배경으로 위에 띄운 것이다.
- 버튼을 두 벌 그리지 않는다. 그래서 접근성 트리에 같은 이름의 버튼이 둘 생기지 않고 Tab 순서가 바뀌지 않는다.
- 펼쳐도 첫 줄의 버튼 위치가 움직이지 않도록, 펼친 상자는 padding만큼 밖으로 빼서 겹친다.
- 첫 줄에 들어간 버튼 수는 자식의 `offsetTop`이 첫 버튼과 같은지로 센다. 높이는 첫 버튼의 `offsetHeight`에 위아래 margin(`CHIP_MARGIN_Y`)을 더한다.
- 폭, 글꼴, 문구가 바뀌면 다시 센다. 상자와 버튼마다 `ResizeObserver`를 걸어야 문구가 바뀌어 버튼 하나의 폭이 변할 때도 잡힌다.
- 모두 첫 줄에 들어가면 `⋯` 버튼을 그리지 않는다.

### 첫 줄 밖의 버튼을 숨기는 방법

- 접힌 동안 첫 줄 밖의 버튼에 `data-clipped` 속성을 달고, CSS가 `visibility: hidden`으로 숨긴다.
- `visibility: hidden`은 포커스와 접근성 트리에서 함께 빠진다. 자르기만 하면 Tab이 보이지 않는 버튼으로 간다.
- `inert`는 Chrome 102부터라서 쓰지 않는다.
- 속성은 effect에서 DOM에 직접 단다. 버튼은 `SoundEditor`가 만든 `IconButton`이라 `EffectPanel`이 props를 줄 수 없고, React가 관리하지 않는 속성이라 렌더가 지우지 않는다.

## auto

효과 상자의 폭이 `AUTO_OVERFLOW_BELOW`(560px) 미만이면 `overflow`, 이상이면 `expanded`를 그린다.

- 기준을 폭 하나로 정했다. 영어 문구에서 상자 폭 572px는 3줄, 532px는 4줄이다. 4줄 이상이 되기 전까지 펼친다.
- 줄 수로 정하지 않는다. 줄 수는 펼쳐 봐야 알 수 있고, 모드마다 상자 폭이 달라지면 두 모드 사이를 오가게 된다. 폭은 모드와 무관하다.
- 폭은 두 모드가 공유하는 바깥 `div`에서 잰다(`useElementWidth`). 모드를 바꿔도 잰 폭이 변하지 않는다.
- 모드가 바뀌면 안쪽 컴포넌트가 달라져 효과 버튼을 다시 만든다. 열려 있던 팝오버는 닫힌다.
- 폭을 잴 수 없으면(첫 그리기 전, jsdom, 서버 렌더링) 펼친다.
- 문구가 긴 로케일은 같은 폭에서 줄이 더 늘어난다. 기준은 로케일에 따라 바꾸지 않는다.

## 효과 시험 모드 체크박스의 자리

`EffectPanel`의 `extra`로 받아 레이아웃마다 자리를 정한다. 동작은 [01-sound-editor-edit-flow.md](./01-sound-editor-edit-flow.md)의 "효과 시험 모드"가 다룬다.

- `expanded`, `overflow`: 효과 버튼 묶음 바로 아래 줄이다. `overflow`의 팝오버는 아래 내용 위에 뜨므로 열려 있는 동안 체크박스를 덮는다. 효과를 누르면 팝오버가 닫혀 다시 보인다.
- `minimized`: `Effects` 버튼과 같은 줄이다. 팝오버가 버튼 줄 아래에 뜨므로, 아래 줄에 두면 열 때마다 덮인다. 같은 줄이면 팝오버가 열려도 보이고 눌러도 팝오버가 닫히지 않는다(닫는 조건은 버튼 클릭이다).
- `auto`: 폭에 따라 `expanded`와 `overflow` 중 하나를 그리며 `extra`를 그대로 넘긴다.
- 재생 줄에 두지 않는다. 재생 버튼은 파형 아래 가로 가운데에 있어야 하고(e2e), 체크박스를 같은 줄에 넣으면 밀린다.

## 팝오버 공통

- Esc, 바깥 누르기, 버튼에서 올라오는 Space 처리는 `usePopoverDismiss`와 `keepSpaceForButton`이 맡는다. `ShortcutHelp`도 같은 것을 쓴다.
- Esc는 capture 단계에서 받아 전파를 끊는다. `useSoundEditor`가 document의 bubble 단계에서 Esc를 선택 해제로 처리하므로, 그대로 두면 팝오버를 닫을 때 선택도 풀린다.
- 팝오버 버튼에서 올라오는 Space는 문서까지 보내지 않는다. `useSoundEditor`가 Space를 재생·정지로 가로채므로, 그대로 두면 버튼이 눌리지 않고 재생이 시작된다. 팝오버 안의 효과 버튼은 기존 `expanded`와 같게 이 처리를 하지 않는다.
- 네이티브 Popover API와 anchor positioning은 Chrome 75에 없어서 직접 만든다.
- 효과를 적용하면 닫고 포커스를 여는 버튼으로 돌린다. `minimized`는 누른 버튼이 사라지고, `overflow`는 누른 버튼이 숨겨져 포커스를 잃기 때문이다.
- 바깥을 눌러 닫을 때는 포커스를 건드리지 않는다. 사용자가 다른 곳을 눌렀기 때문이다.

## 지켜야 할 것

- `EffectPanel.tsx`는 `sound-editor.module.css`를 import하므로 `SoundEditor.tsx`에서 `IconButton`보다 뒤에 import한다. 앞에 두면 CSS 로드 순서가 바뀌어 `.effectButton + .effectButton`이 `IconButton`의 `.container + .container`에 진다.
- `EffectPanel`의 자식은 효과 버튼이 상자의 직접 자식이어야 한다. `overflow`가 `children`을 자식 요소로 세기 때문이다.

## 검증 범위

- jsdom에는 레이아웃이 없다. `tests/SoundEditorEffectsLayout.test.tsx`는 `offsetTop` 대역으로 줄을 나누어 열기·닫기·포커스를 확인한다.
- 실제 폭에서 줄이 나뉘는 것, 팝오버가 에디터 안에 들어오는 것, 레이아웃을 밀지 않는 것은 `apps/demo/e2e/effects.spec.ts`의 `effectsLayout` 묶음이 확인한다.
- 스크린 리더로 읽는 순서와 터치 입력은 확인하지 않았다.
