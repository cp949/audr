import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Meter } from "../src/components/Meter";

const BAR_SPACING = 2.5;

/** 마스크 div의 scaleY 값을 읽는다 */
function maskScale(container: HTMLElement): number {
  const mask = container.querySelector("svg + div") as HTMLElement;
  const match = /scaleY\(([^)]+)\)/.exec(mask.style.transform);
  return Number(match?.[1]);
}

describe("Meter", () => {
  it("막대 수는 level과 관계없이 항상 19개다", () => {
    for (const level of [0, 0.3, 1]) {
      const { container, unmount } = render(<Meter level={level} width={20} height={160} />);
      expect(container.querySelectorAll("rect").length).toBe(19);
      unmount();
    }
  });

  it("level=0이면 마스크 scaleY가 1에 가깝다", () => {
    const { container } = render(<Meter level={0} width={20} height={160} />);
    expect(maskScale(container)).toBeCloseTo(1, 1);
    expect(maskScale(container)).toBeLessThanOrEqual(1);
  });

  it("level=1이면 마스크 scaleY가 약 barSpacing / 2 / height다", () => {
    const { container } = render(<Meter level={1} width={20} height={160} />);
    expect(maskScale(container)).toBeCloseTo(BAR_SPACING / 2 / 160, 6);
  });

  it("막대는 아래에서 위로 green 11, yellow 5, red 3개다", () => {
    const { container } = render(<Meter level={0} width={20} height={160} />);
    const rects = Array.from(container.querySelectorAll("rect"));
    // 아래쪽(index 0)부터 y가 작아지는 순서로 쌓인다
    const ys = rects.map((r) => Number(r.getAttribute("y")));
    expect(ys[0]).toBeGreaterThan(ys[18] as number);
    const classes = rects.map((r) => r.getAttribute("class"));
    expect(new Set(classes.slice(0, 11)).size).toBe(1);
    expect(new Set(classes.slice(11, 16)).size).toBe(1);
    expect(new Set(classes.slice(16)).size).toBe(1);
    expect(new Set([classes[0], classes[11], classes[16]]).size).toBe(3);
  });

  it("컨테이너 높이가 height px이다", () => {
    const { container } = render(<Meter level={0} width={20} height={160} />);
    expect((container.firstChild as HTMLElement).style.height).toBe("160px");
  });
});
