import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../src/components/Modal";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

/** 열기 버튼과 모달을 가진 호스트. 모달 안에 버튼 둘을 둔다. */
function Harness({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      {open && (
        <Modal title="제목" closeLabel="닫기" onRequestClose={() => setOpen(false)}>
          {children ?? (
            <>
              <button type="button">첫째</button>
              <button type="button">둘째</button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

describe("Modal 포커스 트랩", () => {
  it("열리면 모달 안 요소로 포커스가 이동한다", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "열기" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("마지막 요소에서 Tab을 누르면 첫 요소로, 첫 요소에서 Shift+Tab을 누르면 마지막 요소로 간다", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "열기" }));
    const close = screen.getByRole("button", { name: "닫기" });
    const second = screen.getByRole("button", { name: "둘째" });

    second.focus();
    await user.tab();
    expect(document.activeElement).toBe(close);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(second);
  });

  it("컨테이너에 포커스가 있을 때 Shift+Tab은 마지막 요소로 간다", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "열기" }));
    screen.getByRole("dialog").focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "둘째" }));
  });

  it("닫으면 열기 전에 포커스가 있던 요소로 돌아간다", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "열기" });
    await user.click(opener);
    expect(document.activeElement).not.toBe(opener);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("포커스 가능한 요소가 없어도 Tab에서 예외가 없고 포커스가 모달 안에 머문다", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <p>내용</p>
      </Harness>,
    );
    await user.click(screen.getByRole("button", { name: "열기" }));
    // 닫기 버튼을 비활성으로 만들어 포커스 가능한 요소를 0개로 만든다
    screen.getByRole("button", { name: "닫기" }).setAttribute("disabled", "");
    const dialog = screen.getByRole("dialog");
    dialog.focus();

    await user.tab();
    expect(document.activeElement).toBe(dialog);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(dialog);
  });

  it("포커스 가능한 요소가 1개뿐이면 Tab과 Shift+Tab이 그 요소에 머문다", async () => {
    const user = userEvent.setup();
    render(
      <Harness>
        <p>내용</p>
      </Harness>,
    );
    await user.click(screen.getByRole("button", { name: "열기" }));
    const close = screen.getByRole("button", { name: "닫기" });
    close.focus();

    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(close);
  });

  it("열기 전 포커스 요소가 DOM에서 사라졌어도 닫을 때 예외가 없다", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(
      <Modal title="제목" closeLabel="닫기" onRequestClose={() => {}}>
        <p>내용</p>
      </Modal>,
    );
    opener.remove();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => view.unmount()).not.toThrow();
    expect(error).not.toHaveBeenCalled();
  });
});
