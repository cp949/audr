import { useEffect, useState } from "react";
import { EXAMPLES, resolveExample } from "./examples/registry";
import "./shell.css";

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
            <h2>{current.title}</h2>
            <p>{current.summary}</p>
            <section className="example-live" aria-label="실행 화면">
              <Component />
            </section>
            <details className="example-source" open>
              <summary>소스</summary>
              <pre>
                <code>{current.source}</code>
              </pre>
            </details>
          </article>
        )}
      </div>
    </div>
  );
}
