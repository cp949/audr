import { describe, expect, it } from "vitest";
import { History } from "../src/history";

describe("History", () => {
  it("빈 이력에서 undo는 undefined다", () => {
    const h = new History<number>();
    expect(h.undo(0)).toBeUndefined();
    expect(h.canUndo).toBe(false);
  });

  it("빈 이력에서 undo해도 redo 스택에 현재 값이 쌓이지 않는다", () => {
    const h = new History<number>();
    h.undo(5);
    expect(h.canRedo).toBe(false);
  });

  it("push한 값을 undo로 돌려받고 현재 값이 redo로 넘어간다", () => {
    const h = new History<string>();
    h.push("a");
    expect(h.canUndo).toBe(true);
    expect(h.undo("b")).toBe("a");
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
    expect(h.redo("a")).toBe("b");
    expect(h.canRedo).toBe(false);
    expect(h.canUndo).toBe(true);
  });

  it("push하면 redo 스택이 비워진다", () => {
    const h = new History<number>();
    h.push(1);
    h.undo(2);
    expect(h.canRedo).toBe(true);
    h.push(3);
    expect(h.canRedo).toBe(false);
  });

  it("빈 redo 스택에서 redo는 undefined다", () => {
    expect(new History<number>().redo(0)).toBeUndefined();
  });

  it("100번 push하면 undo를 99번까지만 반환한다", () => {
    const h = new History<number>();
    for (let i = 0; i < 100; i++) h.push(i);
    let count = 0;
    let last: number | undefined;
    for (;;) {
      const item = h.undo(-1);
      if (item === undefined) break;
      count++;
      last = item;
    }
    expect(count).toBe(99);
    // 가장 오래된 0은 버려지고 1이 마지막으로 나온다
    expect(last).toBe(1);
  });

  it("max를 지정할 수 있다", () => {
    const h = new History<number>(2);
    h.push(1);
    h.push(2);
    h.push(3);
    expect(h.undo(0)).toBe(3);
    expect(h.undo(0)).toBe(2);
    expect(h.undo(0)).toBeUndefined();
  });

  /** 문자열 길이를 바이트로 보는 예산 10짜리 이력 */
  const budgeted = () => new History<string>(99, { maxBytes: 10, sizeOf: (item) => item.length });

  /** undo 스택을 끝까지 꺼내 꺼낸 순서대로 돌려준다 */
  const drainUndo = (h: History<string>) => {
    const items: string[] = [];
    for (let item = h.undo(""); item !== undefined; item = h.undo("")) items.push(item);
    return items;
  };

  it("바이트 예산을 넘으면 가장 오래된 undo 항목부터 버린다", () => {
    const h = budgeted();
    h.push("aaaa");
    h.push("bbbb");
    h.push("cccc");
    expect(drainUndo(h)).toEqual(["cccc", "bbbb"]);
  });

  it("항목 하나가 예산보다 커도 가장 최근 항목 하나는 남긴다", () => {
    const h = budgeted();
    h.push("aaaa");
    h.push("bbbbbbbbbbbb");
    expect(drainUndo(h)).toEqual(["bbbbbbbbbbbb"]);
  });

  it("undo로 넘어간 현재 값 때문에 예산을 넘으면 가장 오래된 undo 항목을 버린다", () => {
    const h = budgeted();
    h.push("aaaa");
    h.push("bbbb");
    h.push("c");
    // 합계 9에서 c(1)가 빠지고 현재 값(6)이 redo로 들어가 14가 된다
    expect(h.undo("dddddd")).toBe("c");
    expect(drainUndo(h)).toEqual(["bbbb"]);
  });

  it("undo 항목이 없으면 가장 먼 redo 항목을 버린다", () => {
    const h = budgeted();
    h.push("aaaa");
    h.push("bbbb");
    expect(h.undo("cccccc")).toBe("bbbb");
    // undo 스택이 비고 redo 스택이 cccccc, bbbbbbbb로 14가 된다
    expect(h.undo("bbbbbbbb")).toBe("aaaa");
    expect(h.redo("aaaa")).toBe("bbbbbbbb");
    expect(h.canRedo).toBe(false);
  });

  it("clear하면 undo와 redo가 모두 비워진다", () => {
    const h = new History<number>();
    h.push(1);
    h.undo(2);
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it("replaceLast는 단계를 늘리지 않고 가장 최근 항목만 바꾼다", () => {
    const h = new History<string>();
    h.push("a");
    h.push("b");
    h.replaceLast("c");
    expect(h.undo("now")).toBe("c");
    expect(h.undo("c")).toBe("a");
    expect(h.canUndo).toBe(false);
  });

  it("replaceLast는 redo 스택을 비우고 undo 항목이 없으면 push와 같다", () => {
    const h = new History<string>();
    h.push("a");
    h.undo("b");
    expect(h.canRedo).toBe(true);
    h.replaceLast("c");
    expect(h.canRedo).toBe(false);
    expect(h.undo("now")).toBe("c");
  });
});
