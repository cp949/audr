import { useEffect, useState } from "react";
import { EXAMPLES, resolveExample } from "./examples/registry";
import { SourceView } from "./SourceView";

/** 주소 hash를 읽고, 바뀌면 다시 그린다. 라우터 라이브러리 없이 `#/<id>`만 쓴다. */
function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

/**
 * 왼쪽 메뉴와 선택한 예제를 보여 주는 데모의 바깥 틀.
 * 예제는 `examples/registry.ts`에 등록한다. 선택은 `location.hash`로 한다.
 */
export function Shell() {
  const current = resolveExample(useHash());
  const { Component } = current;

  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Examples">
        <div className="shell-brand">
          <span className="shell-brand-name">audr</span>
          <span className="shell-brand-sub">사용 예제</span>
        </div>
        <ul>
          {EXAMPLES.map((example) => (
            <li key={example.id}>
              <a
                href={`#/${example.id}`}
                aria-current={example.id === current.id ? "page" : undefined}
              >
                {example.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="shell-content">
        {current.source === undefined ? (
          <Component />
        ) : (
          <article className="example">
            <header className="example-header">
              <h2>{current.title}</h2>
              <p>{current.summary}</p>
            </header>
            <section className="example-live" aria-label="실행 화면">
              <Component />
            </section>
            <details className="example-source" open>
              <summary>소스</summary>
              <SourceView code={current.source.code} fileName={current.source.fileName} />
            </details>
          </article>
        )}
      </div>
    </div>
  );
}
