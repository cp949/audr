// 팝오버 공용 동작: Esc와 바깥 누르기로 닫기, 버튼에서 올라가는 Space 가두기.
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";

/** 팝오버가 닫히는 이유. Esc로 닫을 때만 호출자가 포커스를 되돌린다 */
export type DismissReason = "escape" | "outside";

/**
 * 팝오버가 열려 있는 동안 Esc와 바깥 누르기를 듣고 `onDismiss`를 부른다.
 * `rootRef` 안쪽을 누르는 것은 바깥이 아니다.
 *
 * `useSoundEditor`는 document의 bubble 단계에서 Esc를 "선택 해제"로 처리한다.
 * capture 단계에서 먼저 받아 전파를 끊으면 팝오버를 닫을 때 선택이 함께 풀리지 않는다.
 */
export function usePopoverDismiss(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  onDismiss: (reason: DismissReason) => void,
) {
  // 콜백이 매 렌더 바뀌어도 리스너를 다시 달지 않는다
  const dismissRef = useRef(onDismiss);
  useLayoutEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dismissRef.current("escape");
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      dismissRef.current("outside");
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, rootRef]);
}

/**
 * `useSoundEditor`는 문서 전체에서 keydown을 듣고 Space를 재생·정지로 가로챈다.
 * 그대로 두면 팝오버 버튼에 포커스가 있을 때 Space가 버튼을 누르지 못하고 재생이 시작된다.
 * 버튼에서 올라가는 Space만 문서까지 보내지 않아 브라우저 기본 동작(버튼 누름)을 살린다.
 */
export function keepSpaceForButton(event: KeyboardEvent) {
  if (event.key === " ") event.stopPropagation();
}
