// 이름 입력. 타이핑 중에는 바깥에 알리지 않고 Enter나 blur에서 규칙을 검사해 적용한다.
import { useEffect, useRef, useState } from "react";
import styles from "./name-input.module.css";

/** 적용·거절 결과 효과를 보이는 시간(ms). name-input.module.css의 애니메이션 길이와 맞춘다 */
const FLASH_MS = 900;

/** 기본 이름 규칙. 앞뒤 공백을 뗀 이름이 비어 있지 않아야 한다 */
export function defaultValidateName(name: string): boolean {
  return name.length > 0;
}

export type NameInputProps = {
  label: string;
  value: string;
  /** 규칙을 통과한 이름만 받는다. 앞뒤 공백은 뗀 값이다 */
  onSubmit: (value: string) => void;
  /** 앞뒤 공백을 뗀 이름이 쓸 수 있는지 판단한다. 생략하면 `defaultValidateName`이다 */
  validate?: (name: string) => boolean;
};

/** 결과 효과. id를 바꿔 같은 종류가 연달아 일어나도 효과 요소를 새로 만든다 */
type Flash = { kind: "success" | "fail"; id: number };

export function NameInput({
  label,
  value,
  onSubmit,
  validate = defaultValidateName,
}: NameInputProps) {
  // 입력 중인 값. null이면 입력 중이 아니고 value를 그대로 보여 준다
  const [buffered, setBuffered] = useState<string | null>(null);
  // Enter 처리 안에서 blur()가 다시 blur 처리를 부르므로, 제출 여부는 ref로 즉시 판단한다
  const bufferedRef = useRef<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const flashId = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 효과가 남은 채 사라져도 타이머가 닫힌 컴포넌트를 갱신하지 않게 한다
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const showFlash = (kind: Flash["kind"]) => {
    clearTimeout(flashTimer.current);
    setFlash({ kind, id: ++flashId.current });
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  const clearBuffer = () => {
    bufferedRef.current = null;
    setBuffered(null);
  };

  /**
   * 입력 중인 이름을 적용한다. 입력 중이 아니거나 바뀐 것이 없으면 아무것도 하지 않는다.
   * 규칙을 통과하지 못하면 입력을 남겨 두고 false를 돌려준다.
   */
  const commit = (): boolean => {
    const pending = bufferedRef.current;
    if (pending === null) return true;
    const name = pending.trim();
    if (name === value) {
      clearBuffer();
      return true;
    }
    if (!validate(name)) return false;
    clearBuffer();
    onSubmit(name);
    showFlash("success");
    return true;
  };

  /** 거절한 입력을 버리고 원래 이름을 보인다 */
  const restore = () => {
    clearBuffer();
    showFlash("fail");
  };

  return (
    <label className={styles.inputGroup}>
      <span className={styles.inputLabel}>{label}</span>
      <span className={styles.field}>
        <input
          type="text"
          className={styles.inputForm}
          value={buffered ?? value}
          aria-invalid={flash?.kind === "fail" || undefined}
          onChange={(e) => {
            bufferedRef.current = e.target.value;
            setBuffered(e.target.value);
          }}
          onBlur={() => {
            if (!commit()) restore();
          }}
          onKeyDown={(e) => {
            // 한글 조합 중의 Enter는 조합 확정이므로 제출하지 않는다
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            // 거절하면 포커스를 남겨 고치게 한다. 복원은 blur에서 한다
            if (commit()) e.currentTarget.blur();
            else showFlash("fail");
          }}
        />
        {flash && (
          <span
            key={flash.id}
            aria-hidden="true"
            data-flash={flash.kind}
            className={`${styles.flash} ${flash.kind === "success" ? styles.flashSuccess : styles.flashFail}`}
          />
        )}
      </span>
    </label>
  );
}
