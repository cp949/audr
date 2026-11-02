// 녹음 버림 확인창의 열림 상태와, 확인창이 닫힌 뒤 포커스를 돌리는 규칙을 가진다.
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { DiscardReason } from "../components/DiscardConfirm";

type Options = {
  /** 단계 화면을 감싼 요소. 가장 가까운 `[role="dialog"]`를 포커스 복귀 위치로 찾는 데 쓴다 */
  bodyRef: RefObject<HTMLDivElement | null>;
  /** 재생 단계의 Play 버튼. 확인창 중 자동 정지로 재생 단계가 새로 열렸을 때 포커스를 보낸다 */
  playRef: RefObject<HTMLButtonElement | null>;
  /** 재생 단계(녹음 샘플이 있는 상태)인지 */
  hasSamples: boolean;
};

/**
 * 버림 확인창 상태.
 *
 * - `askDiscard`는 확인창을 열고, 열기 직전의 포커스를 기억한다.
 * - `keepRecording`은 확인창만 닫는다. 포커스는 기억한 요소로 돌아간다.
 * - `confirmDiscard`는 확인창을 닫고 이유에 맞는 동작을 부른다.
 */
export function useDiscardConfirm({ bodyRef, playRef, hasSamples }: Options) {
  const [discarding, setDiscarding] = useState<DiscardReason | null>(null);
  // 다시 녹음을 확정해 녹음 단계로 돌아왔다. 새 녹음기가 마이크를 열면 Record 버튼으로 포커스를 옮긴다
  const [reRecorded, setReRecorded] = useState(false);
  // 확인창을 열기 직전에 포커스가 있던 요소와, 확인창이 닫힌 뒤 포커스를 돌려야 하는지
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pendingReturnRef = useRef(false);
  // 확인창을 열 때 이미 재생 단계였는지. 확인창 중 자동 정지로 재생 단계가 새로 열린 경우만 Play로 보내려고 기록한다
  const openedWithSamplesRef = useRef(false);

  // 확인창이 사라져 단계 화면이 다시 보이는 커밋 뒤에 포커스를 돌린다.
  // 숨은(visibility: hidden) 요소에는 포커스가 가지 않으므로 커밋 전에 부르면 안 된다.
  useLayoutEffect(() => {
    if (discarding !== null || !pendingReturnRef.current) return;
    pendingReturnRef.current = false;
    const dialog = bodyRef.current?.closest<HTMLElement>('[role="dialog"]');
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    // 열기 전 요소가 사라졌거나 대화상자 밖(배경 클릭으로 body 등)일 때의 복귀 위치:
    // - 확인창 중 자동 정지로 재생 단계가 새로 마운트됐으면 Play 버튼이다. 녹음 단계의 Stop 버튼은 사라졌다.
    // - 그 밖에는 대화상자다. 재생 단계에서 연 확인창은 단계가 그대로이므로 여기에 해당한다.
    //   Re-record를 버려 녹음 단계로 돌아가면 마이크가 열린 뒤 RecordingStep이 Record 버튼으로 옮긴다.
    if (target?.isConnected && dialog?.contains(target)) target.focus();
    else if (!openedWithSamplesRef.current && hasSamples && playRef.current)
      playRef.current.focus();
    else dialog?.focus();
  }, [discarding, hasSamples, bodyRef, playRef]);

  const askDiscard = (reason: DiscardReason) => {
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement ? active : null;
    openedWithSamplesRef.current = hasSamples;
    setDiscarding(reason);
  };

  const keepRecording = () => {
    pendingReturnRef.current = true;
    setDiscarding(null);
  };

  /** 닫기 확인이면 `onCancel`을, 다시 녹음 확인이면 `onBack`을 부른다. */
  const confirmDiscard = ({ onCancel, onBack }: { onCancel: () => void; onBack: () => void }) => {
    if (discarding === "close") {
      onCancel();
      return;
    }
    // 다시 녹음: Re-record 버튼은 사라지므로 포커스는 대화상자로 돌린다.
    // 새 녹음기는 마이크를 여는 동안 Record 버튼이 비활성이라, 활성이 되는 시점에 RecordingStep이 옮긴다
    returnFocusRef.current = null;
    setReRecorded(true);
    pendingReturnRef.current = true;
    setDiscarding(null);
    onBack();
  };

  return { discarding, reRecorded, askDiscard, keepRecording, confirmDiscard };
}
