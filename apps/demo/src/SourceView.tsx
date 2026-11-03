import { useEffect, useRef, useState } from "react";

/** 예제 소스 한 파일을 파일명, 복사 버튼과 함께 보여 준다. 구문 강조는 하지 않는다. */
export function SourceView({ code, fileName }: { code: string; fileName: string }) {
  const codeRef = useRef<HTMLElement>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 2000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const copy = async () => {
    try {
      // navigator.clipboard는 보안 컨텍스트(HTTPS, localhost)에만 있다. 없으면 TypeError로 아래로 간다
      await navigator.clipboard.writeText(code);
      setFeedback("복사했다");
    } catch {
      // execCommand("copy")는 폐기 예정이라 쓰지 않는다. 코드를 선택해 두고 키보드 복사를 안내한다
      const node = codeRef.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setFeedback("선택했다. Ctrl+C(⌘C)로 복사한다");
    }
  };

  return (
    <div className="example-code">
      <div className="example-code-bar">
        <span className="example-code-file">{fileName}</span>
        <span className="example-copy-feedback" aria-live="polite">
          {feedback}
        </span>
        <button type="button" className="demo-button" onClick={() => void copy()}>
          소스 복사
        </button>
      </div>
      <pre>
        <code ref={codeRef}>{code}</code>
      </pre>
    </div>
  );
}
