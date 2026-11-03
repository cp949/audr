import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ICON_NAMES = [
  "cyborg",
  "alien",
  "echo",
  "broadcast",
  "walkie",
  "reverse-reverb",
  "scratch",
  "coaster",
  "stutter",
  "vibrato",
];

const iconDir = path.resolve(import.meta.dirname, "../src/assets/icons/sound-editor");

describe("효과 아이콘", () => {
  it.each(ICON_NAMES)("효과 아이콘은 모두 같은 규격의 SVG다: %s", (name) => {
    const svg = readFileSync(path.join(iconDir, `icon--${name}.svg`), "utf8").trim();

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="#CF63CF"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toMatch(/<(path|rect|circle)\b/);
  });
});
