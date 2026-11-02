import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Waveform } from "../src/components/Waveform";

/** path의 `d`에서 Q 명령 개수를 센다 */
function countQ(container: HTMLElement): number {
  const d = container.querySelector("path")?.getAttribute("d") ?? "";
  return (d.match(/Q/g) ?? []).length;
}

describe("Waveform", () => {
  it("data 길이 3000, width 600이면 path의 점 수가 600 이하다", () => {
    const data = Array.from({ length: 3000 }, (_, i) => Math.abs(Math.sin(i / 10)));
    const { container } = render(<Waveform data={data} width={600} height={160} />);
    // 위쪽 곡선과 아래쪽 곡선이 같은 점 수를 가지므로 Q 명령은 점 수의 2배다
    const points = countQ(container) / 2;
    expect(points).toBeLessThanOrEqual(600);
    expect(points).toBe(600); // takeEveryN = ceil(3000 / 600) = 5
  });

  it("data가 600개 이하이면 모든 점을 그린다", () => {
    const { container } = render(<Waveform data={[0.1, 0.5, 0.2]} width={600} height={160} />);
    expect(countQ(container) / 2).toBe(3);
  });

  it("data가 1개면 같은 값을 한 번 더 넣어 렌더하고 예외가 없다", () => {
    const { container } = render(<Waveform data={[0.5]} width={600} height={160} />);
    expect(countQ(container) / 2).toBe(2);
  });

  it("data가 비어 있어도 예외가 없다", () => {
    expect(() => render(<Waveform data={[]} width={600} height={160} />)).not.toThrow();
  });

  it("viewBox와 좌우 반전 변환이 width, height를 따른다", () => {
    const { container } = render(<Waveform data={[0.5, 0.5]} width={600} height={160} />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 600 160");
    expect(container.querySelector("g")?.getAttribute("transform")).toBe(
      "scale(1, -1) translate(0, -80)",
    );
  });
});

describe("tokens.css", () => {
  // 테스트는 패키지 디렉터리(packages/audr)에서 실행한다
  const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

  it.each([
    ["--audr-looks-secondary", "#855CD6"],
    ["--audr-red-primary", "#FF661A"],
    ["--audr-ui-primary", "hsla(215, 100%, 95%, 1)"],
    ["--audr-sound-tertiary", "#BD42BD"],
  ])("%s 변수가 %s 값으로 있다", (name, value) => {
    // oxfmt가 hex를 소문자로 정규화하므로 대소문자는 구분하지 않는다
    expect(css.toLowerCase()).toContain(`${name}: ${value.toLowerCase()};`);
  });

  it("간격과 모서리 변수를 var()와 calc 식으로 정의한다", () => {
    expect(css).toContain("--audr-space: 0.5rem;");
    expect(css).toContain("--audr-form-radius: calc(var(--audr-space) / 2);");
  });

  it("SCSS 변수($)가 남아 있지 않다", () => {
    expect(css).not.toMatch(/\$[a-z]/);
  });
});
