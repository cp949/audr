import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NameInput } from "../src/components/NameInput";

// 이름 입력의 제출, 검증, 복원, 결과 효과를 고정한다. SoundEditor 전체를 그리지 않고 단독으로 시험한다.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(props: { value?: string; validate?: (name: string) => boolean } = {}) {
  const onSubmit = vi.fn();
  const utils = render(
    <NameInput
      label="Sound"
      value={props.value ?? "Meow"}
      validate={props.validate}
      onSubmit={onSubmit}
    />,
  );
  const input = screen.getByLabelText("Sound") as HTMLInputElement;
  const type = (text: string) => fireEvent.change(input, { target: { value: text } });
  const flash = () => utils.container.querySelector("[data-flash]")?.getAttribute("data-flash");
  return { ...utils, input, onSubmit, type, flash };
}

describe("NameInput 제출", () => {
  it("타이핑하는 동안에는 콜백을 부르지 않는다", () => {
    const { onSubmit, type, input } = setup();
    type("M");
    type("Me");
    type("Meow2");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe("Meow2");
  });

  it("Enter를 누르면 적용하고 포커스를 뗀다", () => {
    const { onSubmit, type, input } = setup();
    input.focus();
    type("Meow2");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("Meow2");
    expect(document.activeElement).not.toBe(input);
  });

  it("Enter 뒤에 이어지는 blur는 같은 이름을 다시 제출하지 않는다", () => {
    const { onSubmit, type, input } = setup();
    type("Meow2");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blur하면 적용한다", () => {
    const { onSubmit, type, input } = setup();
    type("Meow2");
    fireEvent.blur(input);
    expect(onSubmit).toHaveBeenCalledWith("Meow2");
  });

  it("한글 조합 중의 Enter는 제출하지 않는다", () => {
    const { onSubmit, type, input } = setup();
    type("야옹");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("앞뒤 공백을 떼고 제출한다", () => {
    const { onSubmit, type, input } = setup();
    type("  Meow2  ");
    fireEvent.blur(input);
    expect(onSubmit).toHaveBeenCalledWith("Meow2");
  });

  it("바꾸지 않았거나 처음 이름으로 되돌렸으면 제출하지도 효과를 보이지도 않는다", () => {
    const { onSubmit, type, input, flash } = setup();
    fireEvent.blur(input);
    type("Meow2");
    type("Meow");
    fireEvent.blur(input);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(flash()).toBeUndefined();
    expect(input.value).toBe("Meow");
  });
});

describe("NameInput 이름 규칙", () => {
  it("기본 규칙은 공백만 있거나 빈 이름을 거절한다", () => {
    const { onSubmit, type, input } = setup();
    type("   ");
    fireEvent.blur(input);
    expect(onSubmit).not.toHaveBeenCalled();
    type("");
    fireEvent.blur(input);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("validate를 넘기면 기본 규칙 대신 그 규칙을 쓴다", () => {
    const validate = vi.fn((name: string) => name.length <= 3);
    const { onSubmit, type, input } = setup({ validate });
    type("abcd");
    fireEvent.blur(input);
    expect(onSubmit).not.toHaveBeenCalled();
    type("abc");
    fireEvent.blur(input);
    expect(onSubmit).toHaveBeenCalledWith("abc");
    // 공백을 뗀 이름으로 검사한다
    type("  ab  ");
    fireEvent.blur(input);
    expect(validate).toHaveBeenLastCalledWith("ab");
  });

  it("validate를 넘기면 빈 이름도 그 규칙이 정한다", () => {
    const { onSubmit, type, input } = setup({ validate: () => true });
    type("");
    fireEvent.blur(input);
    expect(onSubmit).toHaveBeenCalledWith("");
  });

  it("잘못된 이름에서 blur하면 원래 이름으로 복원한다", () => {
    const { onSubmit, type, input } = setup({ validate: () => false });
    type("나쁜 이름");
    fireEvent.blur(input);
    expect(input.value).toBe("Meow");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("잘못된 이름에서 Enter를 누르면 포커스와 입력을 남겨 고칠 수 있게 한다", () => {
    const validate = vi.fn((name: string) => name !== "bad");
    const { onSubmit, type, input } = setup({ validate });
    input.focus();
    type("bad");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("bad");
    expect(document.activeElement).toBe(input);
    expect(onSubmit).not.toHaveBeenCalled();
    // 고쳐서 다시 Enter를 누르면 적용한다
    type("good");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("good");
  });

  it("잘못된 이름으로 Enter를 누른 뒤 blur하면 원래 이름으로 복원한다", () => {
    const { type, input } = setup({ validate: () => false });
    type("bad");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(input.value).toBe("Meow");
  });
});

describe("NameInput 결과 효과", () => {
  it("적용하면 success 효과를 잠깐 보였다가 지운다", () => {
    const { type, input, flash } = setup();
    type("Meow2");
    fireEvent.blur(input);
    expect(flash()).toBe("success");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(flash()).toBeUndefined();
  });

  it("거절하면 fail 효과를 보이고 입력창을 aria-invalid로 알린다", () => {
    const { type, input, flash } = setup({ validate: () => false });
    type("bad");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(flash()).toBe("fail");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(flash()).toBeUndefined();
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("blur로 복원할 때도 fail 효과를 보인다", () => {
    const { type, input, flash } = setup({ validate: () => false });
    type("bad");
    fireEvent.blur(input);
    expect(flash()).toBe("fail");
  });

  it("연달아 일어나면 효과 요소를 새로 만들어 애니메이션이 다시 시작한다", () => {
    const { type, input, container } = setup({ validate: () => false });
    type("bad");
    fireEvent.keyDown(input, { key: "Enter" });
    const first = container.querySelector("[data-flash]");
    fireEvent.keyDown(input, { key: "Enter" });
    const second = container.querySelector("[data-flash]");
    expect(second).not.toBe(first);
  });

  it("효과 요소는 보조기기에 읽히지 않고 클릭을 가로채지 않는다", () => {
    const { type, input, container } = setup();
    type("Meow2");
    fireEvent.blur(input);
    expect(container.querySelector("[data-flash]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("효과가 남은 채 unmount해도 오류가 없다", () => {
    const { type, input, unmount } = setup();
    type("Meow2");
    fireEvent.blur(input);
    unmount();
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
  });
});
