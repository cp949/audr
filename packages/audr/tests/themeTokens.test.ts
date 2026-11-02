// 테마 토큰 검사. 테마 블록에서 변수가 빠지면 그 자리만 보라가 섞이므로 변수 목록을 맞춰 둔다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.resolve(import.meta.dirname, "../src/styles/tokens.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** 선택자에 해당하는 블록의 본문 */
function blockOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`).exec(css);
  if (!block) throw new Error(`${selector} 블록을 찾지 못함`);
  return block[1] as string;
}

/** 선택자에 해당하는 블록이 선언한 변수 이름 목록 */
function variablesOf(selector: string): string[] {
  return [...blockOf(selector).matchAll(/(--audr-[\w-]+)\s*:/g)].map((m) => m[1] as string);
}

/** 블록이 선언한 변수 값. 테마 블록에 없으면 :root 값을 쓴다 */
function valueOf(selector: string, name: string): string {
  for (const s of [selector, ":root"]) {
    const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(blockOf(s));
    if (m) return (m[1] as string).trim();
  }
  throw new Error(`${name} 값을 찾지 못함`);
}

type Rgba = [number, number, number, number];

/** tokens.css가 쓰는 #rrggbb, rgba(), hsla() 형식만 읽는다 */
function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1] as string, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/.exec(value);
  if (rgba) return rgba.slice(1).map(Number) as Rgba;
  const hsla = /^hsla?\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%(?:,\s*([\d.]+))?\)$/.exec(value);
  if (hsla) {
    const [h, s, l] = [Number(hsla[1]), Number(hsla[2]) / 100, Number(hsla[3]) / 100];
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return [f(0), f(8), f(4), hsla[4] === undefined ? 1 : Number(hsla[4])];
  }
  throw new Error(`읽지 못하는 색: ${value}`);
}

/** 반투명 색 top을 불투명 색 bottom 위에 겹친 색 */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2]
    .map((i) => (top[i] as number) * a + (bottom[i] as number) * (1 - a))
    .concat(1) as Rgba;
}

/** WCAG 2 명도 대비 */
function contrast(a: Rgba, b: Rgba): number {
  const luminance = (c: Rgba) => {
    const [r, g, bl] = c.slice(0, 3).map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("테마 토큰", () => {
  const base = variablesOf(":root");

  for (const theme of ["blue", "teal"]) {
    it(`${theme} 테마는 같은 변수 묶음을 정의하고 기본 :root에도 있다`, () => {
      const names = variablesOf(`[data-audr-theme="${theme}"]`);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(base).toContain(name);
      // 테마끼리 변수 목록이 같아야 한다
      expect([...names].sort()).toEqual([...variablesOf('[data-audr-theme="blue"]')].sort());
    });
  }

  it("경고 글자 주황(--audr-red-text)은 테마와 무관하고 세 테마의 시간 라벨 배경 위에서 4.5:1 이상이다", () => {
    for (const theme of ["blue", "teal"]) {
      expect(variablesOf(`[data-audr-theme="${theme}"]`)).not.toContain("--audr-red-text");
    }
    const text = parseColor(valueOf(":root", "--audr-red-text"));
    const labelBackground = parseColor(valueOf(":root", "--audr-ui-white-dim"));
    for (const selector of [":root", '[data-audr-theme="blue"]', '[data-audr-theme="teal"]']) {
      // 라벨은 반투명 흰 배경이라 아래의 파형 영역 배경이나 파형(채움·외곽선)과 섞인다
      for (const under of ["--audr-ui-primary", "--audr-sound-wave", "--audr-sound-tertiary"]) {
        const background = over(labelBackground, parseColor(valueOf(selector, under)));
        expect(contrast(text, background), `${selector} ${under}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("경고 글자 주황(--audr-red-text)은 편집 실패 알림의 흰 배경(--audr-ui-white) 위에서 4.5:1 이상이다", () => {
    const text = parseColor(valueOf(":root", "--audr-red-text"));
    for (const selector of [":root", '[data-audr-theme="blue"]', '[data-audr-theme="teal"]']) {
      const background = parseColor(valueOf(selector, "--audr-ui-white"));
      expect(contrast(text, background), selector).toBeGreaterThanOrEqual(4.5);
    }
  });
});
