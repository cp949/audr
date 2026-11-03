// 소리 편집 상태와 편집 핸들러는 lib/editSession.ts(EditSession)에 있다.
// 이 훅은 EditSession 구독, 키 처리, 포커스 복원, 컨테이너 연결을 맡는다.
// 순수 계산은 @cp949/audr-core에 있다.
import type { SoundBuffer } from "@cp949/audr-core";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { EditSession, type SoundEditorError } from "../lib/editSession";
import { isIgnoredRepeat, resolveShortcutCommand } from "../lib/keyCommand";

export { BUSY_DELAY_MS } from "../lib/editSession";
export type { SoundEditorError } from "../lib/editSession";

/** 이 값을 넘는 구간에서는 Louder를 막는다 */
const MAX_RMS = 1.2;

export type SoundEditorHookProps = {
  samples: Float32Array;
  sampleRate: number;
  /**
   * 소리를 가리키는 식별자. 값이 바뀌면 내용이 같아도 다른 소리로 본다.
   * 이력, 선택, 편집 실패 알림을 지우고 전환 전에 시작한 편집 결과는 버린다. 복사한 내용은 유지한다.
   * 생략하면 samples 내용으로 같은 소리인지 판단한다.
   */
  soundId?: string | number;
  name: string;
  /** 편집이 끝났을 때 새 samples를 돌려준다. undo/redo도 이 콜백으로 알린다 */
  onChange: (buffer: SoundBuffer) => void;
  /** 선택 구간(없으면 전체)을 새 소리로 복사한다 */
  onCopyToNew: (buffer: SoundBuffer) => void;
  onRename: (name: string) => void;
  /** 편집을 반영하지 못했을 때 호출한다. 콘솔 기록은 이 콜백과 별개로 남는다 */
  onError?: (error: SoundEditorError) => void;
};

/** 선택 구간(없으면 전체 구간)의 청크 레벨이 MAX_RMS를 넘는지 계산한다. */
export function isTooLoud(chunkLevels: number[], trimStart: number | null, trimEnd: number | null) {
  const numChunks = chunkLevels.length;
  const startIndex = trimStart === null ? 0 : Math.floor(trimStart * numChunks);
  const endIndex = trimEnd === null ? numChunks - 1 : Math.ceil(trimEnd * numChunks);
  for (let i = startIndex; i < endIndex && i < numChunks; i++) {
    if ((chunkLevels[i] as number) > MAX_RMS) return true;
  }
  return false;
}

/**
 * 키 입력을 받는 요소인지 본다. 단축키를 document에서 듣기 때문에,
 * 호스트 페이지의 textarea, select, contenteditable 입력까지 가로채지 않으려면 함께 걸러야 한다.
 */
function isTextEntryTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * 에디터 바깥의 모달 dialog(aria-modal="true")가 열려 있는지 본다.
 * 열려 있으면 뒤쪽 에디터는 단축키를 처리하지 않는다. 포커스가 body로 빠진 경우도 막으려고
 * 이벤트 대상 대신 문서에서 찾는다. 에디터 자신을 담은 모달은 제외한다.
 */
function isBlockedByModal(editor: HTMLElement | null) {
  const dialogs = document.querySelectorAll('[aria-modal="true"]');
  return Array.from(dialogs).some((dialog) => editor === null || !dialog.contains(editor));
}

export function useSoundEditor(props: SoundEditorHookProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 첫 렌더에서 한 번만 만든다. 생성자는 부작용이 없어 StrictMode가 초기화 함수를 두 번 불러도 안전하다
  const [session] = useState(() => new EditSession(props));
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  // 마지막으로 누르거나 포커스한 곳이 이 에디터 안이면 true. 단축키를 이때만 처리한다
  const activeRef = useRef(false);
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  // busy가 될 때 에디터 안에서 포커스를 갖고 있던 요소. 비활성되며 잃은 포커스를 busy가 끝나면 되돌린다
  const focusBeforeBusyRef = useRef<HTMLElement | null>(null);

  // 입력 반영 1단계. 커밋마다 부른다(의존성 없음). 소리 전환의 세대 증가가 passive effect보다 먼저 일어나야 한다
  useLayoutEffect(() => {
    session.syncProps(props);
  });

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isTextEntryTarget(event.target)) {
      // 텍스트 입력 중에는 단축키를 무시한다
      return;
    }
    // 호스트 페이지의 Space 스크롤, Ctrl+A, Ctrl+C를 가로채지 않도록 활성 에디터일 때만 처리한다.
    // 루트를 연결하지 않고 훅만 쓰는 경우는 기존처럼 문서 전체에서 처리한다
    if (containerRef.current && !activeRef.current) return;
    // 녹음 모달 같은 다른 모달이 위에 있으면 기본 동작도 막지 않고 그대로 둔다
    if (isBlockedByModal(containerRef.current)) return;
    const command = resolveShortcutCommand(event);
    if (command === null) return;
    // 누르고 있어서 오는 반복은 실행하지 않는다. 기본 동작은 막아 Space 반복이 페이지를 스크롤하지 않게 한다
    if (isIgnoredRepeat(event, command)) {
      event.preventDefault();
      return;
    }
    switch (command) {
      case "playStop":
        event.preventDefault();
        if (snapshot.playhead !== null) {
          session.stop();
        } else {
          session.play();
        }
        break;
      case "delete":
        event.preventDefault();
        session.deleteSelection();
        break;
      case "keepSelection":
        event.preventDefault();
        session.keepSelection();
        break;
      case "clearSelection":
        event.preventDefault();
        session.updateTrim(null, null);
        break;
      case "selectAll":
        event.preventDefault();
        session.updateTrim(0, 1);
        break;
      case "undo":
        // 되돌릴 것이 없으면 브라우저 기본 동작(입력란 밖의 undo 등)에 맡긴다
        if (session.canUndo) {
          event.preventDefault();
          session.undo();
        }
        break;
      case "redo":
        event.preventDefault();
        if (session.canRedo) session.redo();
        break;
      case "copy":
        event.preventDefault();
        session.copy();
        break;
      case "paste":
        event.preventDefault();
        session.paste();
        break;
    }
  };

  useLayoutEffect(() => {
    keyHandlerRef.current = handleKeyDown;
  });

  useEffect(() => {
    // 포커스된 버튼이 비활성되면 브라우저(Chromium)가 포커스를 body로 옮긴다.
    // 스냅샷이 바뀌어 커밋되면 늦으므로 busy를 켜기 직전에 되돌릴 곳을 기억한다
    session.attach(() => {
      const active = document.activeElement;
      focusBeforeBusyRef.current =
        active instanceof HTMLElement && containerRef.current?.contains(active) ? active : null;
    });
    const listener = (e: KeyboardEvent) => keyHandlerRef.current(e);
    // 누른 곳이나 포커스가 들어간 곳으로 활성 여부를 정한다. 포커스가 body로 빠지는 blur는 상태를 바꾸지 않는다.
    // 내부 요소가 전파를 멈춰도 놓치지 않도록 capture 단계에서 듣는다
    const track = (e: Event) => {
      const container = containerRef.current;
      activeRef.current =
        container !== null && e.target instanceof Node && container.contains(e.target);
    };
    document.addEventListener("keydown", listener);
    document.addEventListener("pointerdown", track, true);
    document.addEventListener("focusin", track, true);
    return () => {
      session.detach();
      document.removeEventListener("keydown", listener);
      document.removeEventListener("pointerdown", track, true);
      document.removeEventListener("focusin", track, true);
    };
  }, [session]);

  // busy가 끝나 버튼이 다시 활성된 뒤 포커스를 되돌린다. busy 동안 사용자가 다른 곳으로 옮겼으면 그대로 둔다.
  // 여전히 비활성인 버튼(지운 뒤 선택이 없는 Delete 등)은 focus()가 무시된다
  useEffect(() => {
    if (snapshot.busy) return;
    const target = focusBeforeBusyRef.current;
    focusBeforeBusyRef.current = null;
    if (!target?.isConnected) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    target.focus({ preventScroll: true });
  }, [snapshot.busy]);

  // 입력 반영 2단계. samples나 소리가 바뀔 때만 내용을 비교한다. 의존성을 늘리면 제자리 수정 미반영 제약이 바뀐다
  useEffect(() => {
    session.applyInput(props.samples, props.sampleRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.samples, props.sampleRate, props.soundId]);

  /** 에디터 루트 요소에 거는 callback ref. 빈 곳 클릭(선택 해제)을 가려내는 데 쓴다. */
  const setContainer = (element: HTMLDivElement | null) => {
    containerRef.current = element;
  };

  const handleContainerMouseDown = (e: ReactMouseEvent) => {
    // 컨테이너의 빈 곳을 눌렀을 때만 선택을 해제한다
    if (e.target === containerRef.current && session.getSnapshot().trim.start !== null) {
      session.updateTrim(null, null);
    }
  };

  const { trim } = snapshot;
  return {
    chunkLevels: snapshot.chunkLevels,
    durationSeconds: snapshot.durationSeconds,
    playhead: snapshot.playhead,
    trimStart: trim.start,
    trimEnd: trim.end,
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo,
    canPaste: snapshot.canPaste,
    tooLoud: isTooLoud(snapshot.chunkLevels, trim.start, trim.end),
    /** 편집이 BUSY_DELAY_MS를 넘게 대기하거나 실행 중이면 true. 끝나면 바로 false가 된다 */
    busy: snapshot.busy,
    /** 마지막 편집 실패의 종류와 실패마다 늘어나는 id. 성공한 편집·undo·redo나 다른 소리로 바뀌면 null이다 */
    editError: snapshot.editError,
    /** 소리 전환 횟수. 이력과 선택이 끊긴 입력 반영마다 1씩 는다 */
    switchCount: snapshot.switchCount,
    setContainer,
    onContainerMouseDown: handleContainerMouseDown,
    onPlay: session.play,
    onStop: session.stop,
    onSetTrim: session.updateTrim,
    onUndo: session.undo,
    onRedo: session.redo,
    onCopy: session.copy,
    onPaste: session.paste,
    onCopyToNew: session.copyToNew,
    onDelete: session.deleteSelection,
    onKeepSelection: session.keepSelection,
    onEffect: session.effect,
  };
}
