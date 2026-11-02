// 이름 입력. blur와 Enter에서 제출한다.
import { useRef, useState } from "react";
import styles from "./name-input.module.css";

export type NameInputProps = {
  label: string;
  value: string;
  onSubmit: (value: string) => void;
};

export function NameInput({ label, value, onSubmit }: NameInputProps) {
  // 입력 중인 값. null이면 입력 중이 아니고 value를 그대로 보여 준다
  const [buffered, setBuffered] = useState<string | null>(null);
  // blur()가 Enter 처리 안에서 다시 flush를 부르므로, 제출 여부는 ref로 즉시 판단한다
  const bufferedRef = useRef<string | null>(null);

  const flush = () => {
    const pending = bufferedRef.current;
    bufferedRef.current = null;
    setBuffered(null);
    if (pending !== null) onSubmit(pending);
  };

  return (
    <label className={styles.inputGroup}>
      <span className={styles.inputLabel}>{label}</span>
      <input
        type="text"
        className={styles.inputForm}
        value={buffered ?? value}
        onChange={(e) => {
          bufferedRef.current = e.target.value;
          setBuffered(e.target.value);
        }}
        onBlur={flush}
        onKeyDown={(e) => {
          // 한글 조합 중의 Enter는 조합 확정이므로 제출하지 않는다
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            flush();
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
