import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Waveform } from "../src/components/Waveform";

/** 막대(rect) 목록 */
function bars(container: HTMLElement): SVGRectElement[] {
  return [...container.querySelectorAll("rect")];
}

describe("Waveform", () => {
  it("폭 600이면 막대 피치 5px로 120개를 그린다", () => {
    const data = Array.from({ length: 3000 }, (_, i) => Math.abs(Math.sin(i / 10)));
    const { container } = render(<Waveform data={data} width={600} height={160} />);
    expect(bars(container)).toHaveLength(120);
  });

  it("data가 막대 수보다 적어도 폭 전체를 같은 개수의 막대로 채운다", () => {
    const { container } = render(<Waveform data={[0.1, 0.5, 0.2]} width={600} height={160} />);
    const rects = bars(container);
    expect(rects).toHaveLength(120);
    // 첫 막대는 첫 값(0.1), 마지막 막대는 마지막 값(0.2)을 따른다
    expect(Number(rects[0]?.getAttribute("height"))).toBeCloseTo(16);
    expect(Number(rects[119]?.getAttribute("height"))).toBeCloseTo(32);
  });

  it("막대 높이는 구간의 최댓값에 비례하고 세로 가운데에 맞춘다", () => {
    // 12000개 중 첫 100개만 1이면 첫 막대 구간(100개)의 최댓값이 1이다
    const data = Array.from({ length: 12000 }, (_, i) => (i < 100 ? 1 : 0.5));
    const { container } = render(<Waveform data={data} width={600} height={160} />);
    const [first, second] = bars(container);
    expect(Number(first?.getAttribute("height"))).toBeCloseTo(160);
    expect(Number(first?.getAttribute("y"))).toBeCloseTo(0);
    expect(Number(second?.getAttribute("height"))).toBeCloseTo(80);
    expect(Number(second?.getAttribute("y"))).toBeCloseTo(40);
  });

  it("무음 구간도 최소 높이 2px의 점으로 보인다", () => {
    const { container } = render(<Waveform data={[0, 0]} width={600} height={160} />);
    expect(bars(container)).toHaveLength(120);
    for (const rect of bars(container)) expect(Number(rect.getAttribute("height"))).toBe(2);
  });

  it("data가 비어 있어도 예외가 없고 막대를 그리지 않는다", () => {
    const { container } = render(<Waveform data={[]} width={600} height={160} />);
    expect(bars(container)).toHaveLength(0);
  });

  it("dimmed가 없으면 모든 막대가 흐리지 않다", () => {
    const { container } = render(<Waveform data={[0.5]} width={600} height={160} />);
    expect(container.querySelector("svg")?.hasAttribute("data-dimmed")).toBe(false);
    expect(bars(container).some((r) => r.hasAttribute("data-dim"))).toBe(false);
  });

  it("dimmed이면 highlight가 없을 때 모든 막대가 흐리다", () => {
    const { container } = render(<Waveform data={[0.5]} width={600} height={160} dimmed />);
    expect(container.querySelector("svg")?.hasAttribute("data-dimmed")).toBe(true);
    expect(bars(container).every((r) => r.hasAttribute("data-dim"))).toBe(true);
  });

  it("dimmed이면 highlight 구간 안의 막대만 흐리지 않다", () => {
    // 폭 100이면 막대 20개. 막대 i의 가운데는 (i + 0.5) / 20이다
    const { container } = render(
      <Waveform
        data={[0.5]}
        width={100}
        height={160}
        dimmed
        highlight={{ start: 0.25, end: 0.75 }}
      />,
    );
    const dim = bars(container).map((r) => r.hasAttribute("data-dim"));
    // 가운데가 0.25~0.75에 드는 막대는 5번(0.275)부터 14번(0.725)까지다
    expect(dim).toEqual(Array.from({ length: 20 }, (_, i) => !(i >= 5 && i <= 14)));
  });

  it("highlight가 전체 구간이면 모든 막대가 흐리지 않다", () => {
    const { container } = render(
      <Waveform data={[0.5]} width={100} height={160} dimmed highlight={{ start: 0, end: 1 }} />,
    );
    expect(bars(container).some((r) => r.hasAttribute("data-dim"))).toBe(false);
  });

  it("viewBox가 width, height를 따른다", () => {
    const { container } = render(<Waveform data={[0.5, 0.5]} width={600} height={160} />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 600 160");
  });
});

describe("tokens.css", () => {
  // 테스트는 패키지 디렉터리(packages/audr)에서 실행한다
  const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

  it.each([
    ["--audr-accent", "#07898E"],
    ["--audr-red-primary", "#FF661A"],
    ["--audr-ui-primary", "hsla(215, 100%, 95%, 1)"],
    ["--audr-stage-bg", "#12202B"],
    ["--audr-wave-idle-opacity", "0.7"],
  ])("%s 변수가 %s 값으로 있다", (name, value) => {
    // oxfmt가 hex를 소문자로 정규화하므로 대소문자는 구분하지 않는다
    expect(css.toLowerCase()).toContain(`${name}: ${value.toLowerCase()};`);
  });

  it("간격과 모서리 변수를 var()와 calc 식으로 정의한다", () => {
    expect(css).toContain("--audr-space: 0.5rem;");
    expect(css).toContain("--audr-form-radius: calc(var(--audr-space) / 2);");
  });

  it("Scratch 블록 카테고리 이름(motion, looks, pen, extensions 등)을 변수 이름에 쓰지 않는다", () => {
    expect(css).not.toMatch(
      /--audr-(motion|looks|sound|pen|extensions|control|data|error|membership)-/,
    );
  });

  it("SCSS 변수($)가 남아 있지 않다", () => {
    expect(css).not.toMatch(/\$[a-z]/);
  });
});
