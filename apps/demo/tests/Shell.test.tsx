import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EXAMPLES, resolveExample } from "../src/examples/registry";
import { Shell } from "../src/Shell";

// 메뉴 셸의 주소 hash 해석과 예제 틀을 고정한다. jsdom에서 실행한다.
// 통합 데모는 오디오 API가 필요해서 `App.test.tsx`가 따로 다룬다. 여기서는 그리지 않는다.
afterEach(() => {
  window.location.hash = "";
});

describe("resolveExample", () => {
  it("등록한 id의 hash는 그 예제를 돌려준다", () => {
    expect(resolveExample("#/record").id).toBe("record");
  });

  it("hash가 비었거나 모르는 값이면 첫 예제를 돌려준다", () => {
    expect(resolveExample("").id).toBe(EXAMPLES[0].id);
    expect(resolveExample("#/없는-예제").id).toBe(EXAMPLES[0].id);
  });

  it("예제 id는 서로 겹치지 않는다", () => {
    const ids = EXAMPLES.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Shell", () => {
  it("선택한 예제를 메뉴에서 현재 항목으로 표시하고 제목과 소스를 보여 준다", () => {
    window.location.hash = "#/record";
    render(<Shell />);

    const nav = screen.getByRole("navigation", { name: "Examples" });
    const current = within(nav).getByRole("link", { current: "page" });
    expect(current.textContent).toBe("녹음만 쓰기");
    expect(screen.getByRole("heading", { level: 2, name: "녹음만 쓰기" })).toBeTruthy();
    // 소스는 예제 파일을 그대로 읽은 것이어야 한다
    expect(screen.getByText(/<RecordDialog/)).toBeTruthy();
  });
});
