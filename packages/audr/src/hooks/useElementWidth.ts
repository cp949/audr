import { useCallback, useRef, useState } from "react";

/**
 * 요소의 안쪽 폭(clientWidth)을 재서 돌려준다. 폭이 바뀌면(호스트 창 크기 변경 등) 다시 잰다.
 * 레이아웃이 없거나(폭 0) 아직 잴 수 없으면 `fallback`을 쓴다.
 * 돌려주는 두 번째 값은 요소에 거는 콜백 ref다. 요소가 붙을 때 바로 재므로 첫 그리기 전에 폭이 정해진다.
 */
export function useElementWidth(fallback: number) {
  const [width, setWidth] = useState(fallback);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback(
    (element: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!element) return;
      const measure = () => {
        const next = Math.floor(element.clientWidth);
        // 같은 값이면 React가 다시 그리지 않는다
        setWidth(next > 0 ? next : fallback);
      };
      measure();
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      observerRef.current = observer;
    },
    [fallback],
  );

  return [width, ref] as const;
}
