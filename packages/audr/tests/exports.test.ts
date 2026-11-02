// 빌드 산출물(dist) 구조 검사. 소비 경로가 매번 실행되어 exports 오류를 발행 전에 잡는다.
// 전제: 이 패키지와 audr-core가 먼저 빌드되어 있어야 한다(turbo test가 build를 먼저 실행한다).
// jsdom 환경에서도 node:fs를 쓸 수 있다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// jsdom 환경의 URL은 file: 스킴을 받지 않으므로 import.meta.dirname을 쓴다
const audrDir = path.resolve(import.meta.dirname, "..");
const coreDir = path.resolve(audrDir, "../audr-core");

function readPackage(dir: string) {
  return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
    main?: string;
    types?: string;
    exports: Record<string, string | { types?: string; import?: string }>;
  };
}

/** 디렉터리 아래 모든 .d.ts 경로 */
function listDeclarations(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listDeclarations(full);
    return name.endsWith(".d.ts") ? [full] : [];
  });
}

describe("@cp949/audr 패키지 exports", () => {
  const pkg = readPackage(audrDir);
  const root = pkg.exports["."] as { types: string; import: string };

  it('"."의 types와 import가 가리키는 파일이 dist에 있다', () => {
    expect(root.types).toBe("./dist/index.d.ts");
    expect(root.import).toBe("./dist/index.js");
    expect(existsSync(path.join(audrDir, root.types))).toBe(true);
    expect(existsSync(path.join(audrDir, root.import))).toBe(true);
  });

  it('"./style.css"가 dist/index.css를 가리키고 파일이 있다', () => {
    expect(pkg.exports["./style.css"]).toBe("./dist/index.css");
    expect(existsSync(path.join(audrDir, "dist/index.css"))).toBe(true);
  });

  it("main과 types 필드도 dist를 가리킨다", () => {
    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.types).toBe("./dist/index.d.ts");
  });

  it("dist/index.css에 토큰 변수가 들어 있어 tokens.css export가 필요 없다", () => {
    const css = readFileSync(path.join(audrDir, "dist/index.css"), "utf8");
    expect(css).toContain("--audr-ui-primary");
    expect(pkg.exports["./tokens.css"]).toBeUndefined();
  });

  it("공개 선언 파일이 .css, .svg, .module을 참조하지 않는다", () => {
    const files = listDeclarations(path.join(audrDir, "dist"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, path.relative(audrDir, file)).not.toMatch(/\.css|\.svg|\.module/);
    }
  });
});

describe("@cp949/audr-core 패키지 exports", () => {
  const pkg = readPackage(coreDir);
  const root = pkg.exports["."] as { types: string; import: string };

  it('"."의 types와 import가 가리키는 파일이 dist에 있다', () => {
    expect(root.types).toBe("./dist/index.d.ts");
    expect(root.import).toBe("./dist/index.js");
    expect(existsSync(path.join(coreDir, root.types))).toBe(true);
    expect(existsSync(path.join(coreDir, root.import))).toBe(true);
  });

  it("main과 types 필드도 dist를 가리킨다", () => {
    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.types).toBe("./dist/index.d.ts");
  });
});
