// 효과 버튼 상자. `effectsLayout`에 따라 전부 펼치거나, 버튼 하나로 접거나, 한 줄만 보이고 나머지는 팝오버로 둔다.
// 규칙과 이유는 docs/design/05-effect-panel-layout.md를 따른다.
import { useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useElementWidth } from "../hooks/useElementWidth";
import { keepSpaceForButton, usePopoverDismiss } from "../hooks/usePopoverDismiss";
import type { Messages } from "../i18n";
import styles from "./sound-editor.module.css";

/**
 * 효과 버튼을 보이는 방식.
 * - `"expanded"`: 전체를 펼쳐 놓고 폭이 모자라면 줄바꿈한다.
 * - `"minimized"`: `Effects` 버튼 하나만 두고, 누르면 전체가 팝오버로 뜬다.
 * - `"overflow"`: 한 줄만 보이고, 들어가지 못한 효과는 `⋯` 버튼의 팝오버로 뜬다.
 * - `"auto"`: 효과 상자 폭이 `AUTO_OVERFLOW_BELOW`(px) 이상이면 `"expanded"`, 미만이면 `"overflow"`로 바뀐다.
 */
export type EffectsLayout = "expanded" | "minimized" | "overflow" | "auto";

/**
 * `"auto"`가 `"overflow"`로 바뀌는 효과 상자 폭(px). 이 값 미만이면 overflow다.
 * 영어 문구에서 상자 폭 572px는 3줄, 532px는 4줄이다. 4줄 이상이 되기 전까지 펼친다.
 * 문구가 길면 같은 폭에서 줄 수가 늘어나지만 기준은 폭 하나로 고정한다. 폭만으로 정해야 모드가 폭에 대해 안정적이다.
 */
export const AUTO_OVERFLOW_BELOW = 560;

/** 폭을 재기 전(첫 그리기 전)이나 레이아웃이 없을 때(jsdom, 서버 렌더링)는 펼친다 */
const AUTO_FALLBACK_WIDTH = Number.POSITIVE_INFINITY;

export type EffectPanelProps = {
  layout: EffectsLayout;
  messages: Messages;
  /** 효과 버튼들. 순서가 화면 순서이자 Tab 순서다. 각 버튼은 이 상자의 직접 자식이어야 한다 */
  children: ReactNode;
};

export function EffectPanel({ layout, messages, children }: EffectPanelProps) {
  if (layout === "auto") return <AutoEffects messages={messages}>{children}</AutoEffects>;
  if (layout === "minimized")
    return <MinimizedEffects messages={messages}>{children}</MinimizedEffects>;
  if (layout === "overflow")
    return <OverflowEffects messages={messages}>{children}</OverflowEffects>;
  return <ExpandedEffects messages={messages}>{children}</ExpandedEffects>;
}

function ExpandedEffects({ messages, children }: Pick<EffectPanelProps, "messages" | "children">) {
  return (
    <div role="group" aria-label={messages.effects} className={styles.effectChips}>
      {children}
    </div>
  );
}

/**
 * 자기 폭을 재서 `expanded`와 `overflow` 중 하나를 그린다.
 * 폭은 어느 모드에서나 같은 바깥 상자에서 잰다. 그래야 모드를 바꿔도 잰 폭이 달라지지 않아 둘 사이를 오가지 않는다.
 * 모드가 바뀌면 안쪽 컴포넌트를 다시 만든다. 열려 있던 팝오버는 닫힌다.
 */
function AutoEffects({ messages, children }: Pick<EffectPanelProps, "messages" | "children">) {
  const [width, ref] = useElementWidth(AUTO_FALLBACK_WIDTH);
  const Inner = width < AUTO_OVERFLOW_BELOW ? OverflowEffects : ExpandedEffects;
  return (
    <div ref={ref}>
      <Inner messages={messages}>{children}</Inner>
    </div>
  );
}

/** 팝오버 안의 버튼(효과)을 누르면 닫고 포커스를 여는 버튼으로 돌려준다 */
function isButtonClick(event: MouseEvent) {
  return event.target instanceof Element && event.target.closest("button") !== null;
}

/**
 * `Effects` 버튼 하나만 둔다. 팝오버는 열려 있을 때만 그리고 레이아웃을 밀지 않는다.
 * 효과를 적용하면 닫는다. 이어서 여러 효과를 쓰려면 `"expanded"`를 쓴다.
 */
function MinimizedEffects({ messages, children }: Pick<EffectPanelProps, "messages" | "children">) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  // 팝오버 안의 효과 버튼이 사라지므로 포커스를 버튼으로 돌린다. 바깥을 눌러 닫을 때는 포커스를 건드리지 않는다
  usePopoverDismiss(open, rootRef, (reason) => {
    setOpen(false);
    if (reason === "escape") toggleRef.current?.focus();
  });

  return (
    <div ref={rootRef} className={styles.effectMinimized}>
      <div className={styles.effectToggleRow}>
        <button
          ref={toggleRef}
          type="button"
          className={styles.effectToggle}
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          onKeyDown={keepSpaceForButton}
          onClick={() => setOpen((value) => !value)}
        >
          {messages.effects}
          <span aria-hidden="true" className={styles.effectToggleCaret}>
            ▾
          </span>
        </button>
      </div>
      {open ? (
        <div
          id={popoverId}
          role="group"
          aria-label={messages.effects}
          className={styles.effectPopover}
          onClick={(event) => {
            if (!isButtonClick(event)) return;
            setOpen(false);
            toggleRef.current?.focus();
          }}
        >
          <div className={styles.effectList}>{children}</div>
        </div>
      ) : null}
    </div>
  );
}

/** 효과 버튼 한 줄의 위아래 margin 합(px). `.effectButton`의 margin 2px × 2와 같다 */
const CHIP_MARGIN_Y = 4;

/**
 * 한 줄만 보이고 나머지는 팝오버로 둔다.
 *
 * 효과 버튼 전체를 DOM에 한 번만 그린다. 접힌 상태는 첫 줄 높이로 자른 상자이고,
 * 펼친 상태는 같은 상자를 높이 제한 없이 위에 띄운 것이다. 그래서 버튼이 중복되지 않고 Tab 순서가 그대로다.
 * 첫 줄에 들어가지 못한 버튼은 접힌 동안 `data-clipped`를 달아 보이지 않게 하고 포커스도 받지 않게 한다.
 * 줄 수는 `offsetTop`으로 센다. 모두 첫 줄에 들어가면 `⋯` 버튼을 그리지 않는다.
 */
function OverflowEffects({ messages, children }: Pick<EffectPanelProps, "messages" | "children">) {
  const [open, setOpen] = useState(false);
  // 첫 줄에 들어간 버튼 수와 전체 수. 아직 재지 못했으면 null이다
  const [fit, setFit] = useState<{ visible: number; total: number } | null>(null);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const hasOverflow = fit !== null && fit.visible < fit.total;
  const expanded = open && hasOverflow;

  usePopoverDismiss(expanded, rootRef, (reason) => {
    setOpen(false);
    if (reason === "escape") moreRef.current?.focus();
  });

  // 폭, 글꼴, 문구가 바뀌면 다시 잰다. 버튼마다 관찰해야 문구가 바뀌어 한 버튼의 폭이 변할 때도 잡힌다
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const chips = Array.from(list.children) as HTMLElement[];
    const measure = () => {
      const first = chips[0];
      if (!first) return;
      const firstTop = first.offsetTop;
      const next = chips.findIndex((chip) => chip.offsetTop > firstTop + 1);
      const visible = next === -1 ? chips.length : next;
      setFit((prev) =>
        prev?.visible === visible && prev.total === chips.length
          ? prev
          : { visible, total: chips.length },
      );
      const height = first.offsetHeight + CHIP_MARGIN_Y;
      setRowHeight((prev) => (prev === height ? prev : height));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const chip of chips) observer.observe(chip);
    return () => observer.disconnect();
  }, [messages]);

  // React가 관리하지 않는 속성이라 렌더가 지우지 않는다. 접힌 동안만 첫 줄 밖의 버튼을 숨긴다
  useLayoutEffect(() => {
    const chips = Array.from(listRef.current?.children ?? []);
    chips.forEach((chip, index) => {
      const clipped = !expanded && fit !== null && index >= fit.visible;
      if (clipped) chip.setAttribute("data-clipped", "");
      else chip.removeAttribute("data-clipped");
    });
  }, [expanded, fit]);

  return (
    <div ref={rootRef} className={styles.effectOverflow}>
      <div className={styles.effectSlot} style={{ height: rowHeight ?? undefined }}>
        <div
          id={panelId}
          role="group"
          aria-label={messages.effects}
          className={styles.effectClip}
          data-open={expanded || undefined}
          style={expanded ? undefined : { height: rowHeight ?? undefined }}
          onClick={(event) => {
            if (!expanded || !isButtonClick(event)) return;
            setOpen(false);
            moreRef.current?.focus();
          }}
        >
          <div ref={listRef} className={styles.effectList}>
            {children}
          </div>
        </div>
      </div>
      {hasOverflow ? (
        <button
          ref={moreRef}
          type="button"
          className={styles.effectMore}
          aria-label={messages.moreEffects}
          title={messages.moreEffects}
          aria-expanded={expanded}
          aria-controls={panelId}
          onKeyDown={keepSpaceForButton}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">⋯</span>
        </button>
      ) : null}
    </div>
  );
}
