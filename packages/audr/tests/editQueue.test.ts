// EditQueue의 interface 제약을 검증한다.
// 소리 데이터와 React 없이 가짜 타이머와 직접 푸는 Promise로 돌린다.
// 규칙과 이유는 docs/design/01-sound-editor-edit-flow.md의 "편집 큐", "busy 표시", "세대 번호"를 따른다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUSY_DELAY_MS, EditQueue } from "../src/lib/editQueue";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 직접 풀 때까지 끝나지 않는 작업을 만든다. */
function heldTask() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { task: () => gate, release };
}

describe("EditQueue 직렬 실행", () => {
  it("앞 작업이 끝난 뒤에 다음 작업을 시작한다", async () => {
    const queue = new EditQueue(() => {});
    queue.attach();
    const held = heldTask();
    const order: string[] = [];

    queue.enqueue(async () => {
      order.push("앞 시작");
      await held.task();
      order.push("앞 끝");
    });
    queue.enqueue(() => {
      order.push("뒤 시작");
    });
    await Promise.resolve();
    expect(order).toEqual(["앞 시작"]);

    held.release();
    await vi.waitFor(() => expect(order).toEqual(["앞 시작", "앞 끝", "뒤 시작"]));
  });

  it("작업이 예외를 던져도 다음 작업을 실행한다", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const queue = new EditQueue(() => {});
    queue.attach();
    const next = vi.fn();

    queue.enqueue(() => Promise.reject(new Error("실패")));
    queue.enqueue(next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  it("invalidate 전에 넣은 작업은 건너뛰고, 이후에 넣은 작업은 실행한다", async () => {
    const queue = new EditQueue(() => {});
    queue.attach();
    const held = heldTask();
    const skipped = vi.fn();
    const after = vi.fn();

    queue.enqueue(held.task);
    // 첫 작업이 시작한 뒤에 넣어야, 실행 중인 작업과 대기 중인 작업이 구분된다
    await Promise.resolve();
    queue.enqueue(skipped);
    queue.invalidate();
    queue.enqueue(after);
    held.release();

    await vi.waitFor(() => expect(after).toHaveBeenCalledTimes(1));
    expect(skipped).not.toHaveBeenCalled();
  });
});

describe("EditQueue busy 지연", () => {
  it("BUSY_DELAY_MS 안에 끝나면 busy를 켜지 않는다", async () => {
    vi.useFakeTimers();
    const onBusyChange = vi.fn();
    const queue = new EditQueue(onBusyChange);
    queue.attach();

    const held = heldTask();

    queue.enqueue(held.task);
    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS - 1);
    held.release();
    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS * 5);

    expect(onBusyChange).not.toHaveBeenCalled();
  });

  it("대기 중인 작업이 남아 있으면 앞 작업이 끝나도 busy를 유지한다", async () => {
    vi.useFakeTimers();
    const onBusyChange = vi.fn();
    const queue = new EditQueue(onBusyChange);
    queue.attach();
    const first = heldTask();
    const second = heldTask();

    queue.enqueue(first.task);
    queue.enqueue(second.task);
    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS);
    first.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(onBusyChange.mock.calls).toEqual([[true]]);

    second.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("BUSY_DELAY_MS를 넘기면 busy를 켜고, 큐가 비면 바로 끈다", async () => {
    vi.useFakeTimers();
    const onBusyChange = vi.fn();
    const queue = new EditQueue(onBusyChange);
    queue.attach();
    const held = heldTask();

    queue.enqueue(held.task);
    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS);
    expect(onBusyChange.mock.calls).toEqual([[true]]);

    held.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("건너뛴 작업도 busy를 풀어 준다", async () => {
    vi.useFakeTimers();
    const onBusyChange = vi.fn();
    const queue = new EditQueue(onBusyChange);
    queue.attach();
    const held = heldTask();

    queue.enqueue(held.task);
    await Promise.resolve();
    queue.enqueue(() => {});
    queue.invalidate();
    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS);
    held.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("뗀 뒤에는 타이머를 만들지 않고, 건 타이머도 취소한다", async () => {
    vi.useFakeTimers();
    const onBusyChange = vi.fn();
    const queue = new EditQueue(onBusyChange);

    queue.enqueue(() => {});
    expect(vi.getTimerCount()).toBe(0);
    // 앞 작업이 끝나 대기 수가 0이 된 뒤여야 새 타이머가 걸린다
    await vi.advanceTimersByTimeAsync(0);

    queue.attach();
    queue.enqueue(heldTask().task);
    expect(vi.getTimerCount()).toBe(1);
    queue.detach();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(BUSY_DELAY_MS);
    expect(onBusyChange).not.toHaveBeenCalled();
  });
});
