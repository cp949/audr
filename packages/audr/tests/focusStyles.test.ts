// 포커스 표시 규칙 검사. CSS Module은 jsdom에서 계산 스타일을 확인할 수 없어 소스 텍스트로 본다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentsDir = path.resolve(import.meta.dirname, "../src/components");
const read = (name: string) => readFileSync(path.join(componentsDir, name), "utf8");

/** 주석을 지운 CSS에서 [선택자, 본문] 목록을 뽑는다. 선택자 목록은 선택자 하나씩 나눈다. */
function rulesOf(css: string): [string, string][] {
  const rules: [string, string][] = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selectorList, body] of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of (selectorList as string).split(",")) {
      rules.push([selector.trim(), body as string]);
    }
  }
  return rules;
}

// 포커스 표시를 그리는 선언. border-radius처럼 모양만 바꾸는 선언은 뺀다.
const DRAWS =
  /(?:^|;)\s*(?:content|outline|box-shadow|border(?:-(?:top|right|bottom|left))?(?:-(?:color|style|width))?)\s*:/;
// `:focus` 뒤에 `-visible`, `-within`, `:not(`이 오지 않는 경우
const BARE_FOCUS = /:focus(?!-visible|-within|:not\()/;

describe("포커스 표시 CSS", () => {
  // :focus-visible은 Chrome 86부터라 Chrome 75 floor(docs/adr/0001)에서는 링을 :focus에 그리고,
  // 지원하는 브라우저에서는 :focus:not(:focus-visible)로 마우스 포커스 링을 지운다.
  it(":focus로 그린 포커스 표시는 짝이 되는 :focus:not(:focus-visible) 규칙으로 마우스 포커스에서 지운다", () => {
    for (const file of [
      "sound-editor.module.css",
      "record-dialog.module.css",
      "audio-trimmer.module.css",
    ]) {
      const rules = rulesOf(read(file));
      for (const [selector, body] of rules) {
        if (!BARE_FOCUS.test(selector) || !DRAWS.test(body)) continue;
        const reset = selector.replace(":focus", ":focus:not(:focus-visible)");
        const hides = rules.some(
          ([s, b]) => s === reset && /(?:content|outline)\s*:\s*none/.test(b),
        );
        expect(hides, `${file}: ${selector}에 짝이 되는 ${reset} 해제 규칙이 없다`).toBe(true);
      }
    }
  });

  it("sound editor 버튼은 키보드 포커스 링을 :focus에 그리고 마우스 포커스에서 지운다", () => {
    const rules = rulesOf(read("sound-editor.module.css"));
    expect(rules.some(([s, b]) => s === ".button:focus::before" && /content:\s*""/.test(b))).toBe(
      true,
    );
    expect(
      rules.some(
        ([s, b]) => s === ".button:focus:not(:focus-visible)::before" && /content:\s*none/.test(b),
      ),
    ).toBe(true);
  });

  it("녹음 버튼 행은 outline을 지우더라도 키보드 포커스(:focus-visible)에는 윤곽선을 그린다", () => {
    const css = read("record-dialog.module.css");
    expect(css).toMatch(/\.mainButtonRow button:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  });

  it("selection 핸들은 키보드 포커스에 윤곽선을 그린다", () => {
    expect(read("audio-trimmer.module.css")).toMatch(
      /\.trimLine:focus-visible\s*\{[^}]*outline:\s*2px solid/,
    );
  });
});
