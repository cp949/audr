# 05. 효과 버튼 배치(effectsLayout)

`SoundEditor`의 `effectsLayout`(`"expanded"`, `"minimized"`, `"overflow"`)이 효과 버튼 19개를 어떻게 보이는지, 그 구조를 왜 이렇게 만들었는지 적는다.

- 사용자에게 보이는 값과 동작은 `packages/audr/README.md`의 "레이아웃과 폭"이 소유한다.
- 구현은 `packages/audr/src/components/EffectPanel.tsx`, 스타일은 `sound-editor.module.css`의 `effect*` 규칙이다.
- 지원 브라우저 하한은 [ADR-0001](../adr/0001-chrome-75-browser-floor.md)을 따른다.

## 호스트가 고른다

- 값은 prop으로 받는다. 기본값은 `"expanded"`라서 기존 호스트의 모양이 바뀌지 않는다.
- 폭에 따라 자동으로 바꾸지 않는다. 임계값을 라이브러리가 정하면 호스트의 의도와 부딪힌다. 호스트는 `ResizeObserver`로 자기 폭을 이미 안다.

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
