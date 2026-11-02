// transition 규칙 검사. CSS Module은 jsdom에서 계산 스타일을 확인할 수 없어 소스 텍스트로 본다.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getMessages } from "../src/i18n";

const srcDir = path.resolve(import.meta.dirname, "../src");
const componentsDir = path.join(srcDir, "components");
const read = (name: string) => readFileSync(path.join(componentsDir, name), "utf8");

/** src 아래 모든 CSS 파일(src 기준 상대 경로). 새 파일이 생겨도 자동으로 검사 대상이 된다. */
function listCssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listCssFiles(full);
    return entry.name.endsWith(".css") ? [path.relative(srcDir, full)] : [];
  });
}

/**
 * reduced-motion 검사에서 일부러 제외하는 파일. 이유와 함께 적는다.
 * 현재는 제외할 파일이 없다. 재생헤드(Waveform)와 미터(Meter)는 transition이 없어 자동으로 대상이 아니다.
 */
const EXCLUDED: Record<string, string> = {};

const REDUCED_MOTION_BLOCK =
  /@media \(prefers-reduced-motion: reduce\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;

/**
 * CSS 텍스트에서 transition을 쓰는 규칙의 선택자와, reduced-motion 블록에서 transition을 끈 선택자를 뽑는다.
 * 중첩 @media는 reduced-motion 한 종류만 쓰므로 정규식으로 충분하다.
 */
function analyzeTransitions(source: string) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const reducedBlocks = css.match(REDUCED_MOTION_BLOCK) ?? [];
  const outside = css.replace(REDUCED_MOTION_BLOCK, "");
  const rules = (text: string) =>
    [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: (m[1] as string).trim().replace(/\s+/g, " "),
      body: m[2] as string,
    }));
  const withTransition = rules(outside)
    .filter((r) => /(^|[\s;])transition\s*:/.test(r.body))
    .map((r) => r.selector);
  const disabled = reducedBlocks
    .flatMap((block) => rules(block.slice(block.indexOf("{") + 1)))
    .filter((r) => /(^|[\s;])transition\s*:\s*none\b/.test(r.body))
    .map((r) => r.selector);
  return { withTransition, disabled, reducedBlockCount: reducedBlocks.length };
}

describe("transition 검사기", () => {
  it("transition 규칙과 reduced-motion에서 끈 선택자를 구분해 뽑는다", () => {
    const result = analyzeTransitions(`
      .a { transition: 0.2s; }
      .b img { color: red; transition: opacity 1s; }
      .c { color: blue; }
      @media (prefers-reduced-motion: reduce) {
        .a { transition: none; }
      }
    `);
    expect(result.withTransition).toEqual([".a", ".b img"]);
    expect(result.disabled).toEqual([".a"]);
  });

  it("주석 안의 transition은 무시한다", () => {
    const result = analyzeTransitions("/* transition: 1s; */ .a { color: red; }");
    expect(result.withTransition).toEqual([]);
  });
});

describe("transition CSS", () => {
  const files = listCssFiles(srcDir);

  it("src 아래 CSS 파일을 찾는다", () => {
    // 목록이 비면 아래 검사가 아무것도 보지 않고 통과하므로 먼저 막는다
    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(files).toContain(path.join("components", "modal.module.css"));
  });

  it("transition: all을 쓰지 않는다", () => {
    for (const file of files) {
      expect(readFileSync(path.join(srcDir, file), "utf8"), file).not.toMatch(
        /transition:\s*all\b/,
      );
    }
  });

  it("모달 닫기 버튼은 바뀌는 속성(transform, box-shadow)만 전환한다", () => {
    const css = read("modal.module.css");
    const rule = css.match(/\.closeButton\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/transition:[^;]*transform[^;]*box-shadow/);
  });

  it("transition을 쓰는 모든 CSS 규칙은 prefers-reduced-motion: reduce에서 transition을 끈다", () => {
    for (const file of files) {
      if (file in EXCLUDED) continue;
      const { withTransition, disabled } = analyzeTransitions(
        readFileSync(path.join(srcDir, file), "utf8"),
      );
      for (const selector of withTransition) {
        expect(disabled, `${file}의 '${selector}'에 reduced-motion 규칙이 없다`).toContain(
          selector,
        );
      }
    }
  });

  it("제외 목록은 실제로 있는 파일만 가리킨다", () => {
    for (const file of Object.keys(EXCLUDED)) expect(files, file).toContain(file);
  });

  it("정보를 전달하는 움직임(재생헤드, 미터)에는 reduced-motion 규칙을 두지 않는다", () => {
    for (const file of ["Waveform.module.css", "Meter.module.css", "sound-editor.module.css"]) {
      expect(read(file), file).not.toMatch(/prefers-reduced-motion/);
    }
  });
});

describe("i18n 말줄임표", () => {
  it("Loading 문구는 '...' 대신 '…' 문자를 쓴다", () => {
    expect(getMessages("en").loading).toBe("Loading…");
    expect(getMessages("ko").loading).toBe("로딩 중…");
  });

  it("어느 문구에도 '...'가 남아 있지 않다", () => {
    for (const locale of ["en", "ko"] as const) {
      for (const [key, value] of Object.entries(getMessages(locale))) {
        expect(value, `${locale}.${key}`).not.toContain("...");
      }
    }
  });
});
