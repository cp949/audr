import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecordDialog } from "../src/components/RecordDialog";
import { SoundEditor } from "../src/components/SoundEditor";
import { getMessages } from "../src/i18n";
import { FakeAudioBufferPlayer, ramp } from "./helpers/fakePlayer";
import { FakeAudioRecorder } from "./helpers/fakeRecorder";

vi.mock("@cp949/audr-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cp949/audr-core")>();
  const { FakeAudioBufferPlayer } = await import("./helpers/fakePlayer");
  const { FakeAudioRecorder } = await import("./helpers/fakeRecorder");
  return { ...actual, AudioBufferPlayer: FakeAudioBufferPlayer, AudioRecorder: FakeAudioRecorder };
});

const en = getMessages("en");

/** 에디터 뒤에 녹음 모달을 띄우는 호스트. 모달은 "열기" 버튼으로 연다 */
function Host({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      <SoundEditor
        samples={ramp(1000)}
        sampleRate={44100}
        name="Meow"
        onChange={onChange}
        onCopyToNew={vi.fn()}
        onRename={vi.fn()}
      />
      <RecordDialog open={open} onCancel={() => setOpen(false)} onSave={vi.fn()} />
    </>
  );
}

async function press(key: string, target: Document | Element = document.body) {
  let notPrevented = true;
  await act(async () => {
    notPrevented = fireEvent.keyDown(target, { key });
  });
  return notPrevented;
}

/** 에디터 안을 눌러 단축키를 받는 활성 에디터로 만든다 */
function activateEditor() {
  fireEvent.pointerDown(document.querySelector('[class*="editorContainer"]') as HTMLElement);
}

/** 에디터 재생기. 모달은 녹음 단계에 머무르므로 재생기를 만들지 않는다 */
const editorPlayer = () => FakeAudioBufferPlayer.instances[0] as FakeAudioBufferPlayer;

async function setupWithSelectionAndOpenDialog() {
  const onChange = vi.fn();
  render(<Host onChange={onChange} />);
  // 모달을 열기 전에 전체를 선택해 둔다 (Delete가 편집을 일으킬 수 있는 상태)
  activateEditor();
  await act(async () => fireEvent.keyDown(document.body, { key: "a", ctrlKey: true }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "열기" })));
  expect(screen.getByRole("dialog")).toBeTruthy();
  return { onChange };
}

beforeEach(() => {
  FakeAudioRecorder.reset();
  FakeAudioBufferPlayer.reset();
});

describe("녹음 모달이 열려 있을 때 SoundEditor 단축키", () => {
  it("모달 안에서 Space와 Delete를 눌러도 재생과 편집이 일어나지 않는다", async () => {
    const { onChange } = await setupWithSelectionAndOpenDialog();
    const dialog = screen.getByRole("dialog");
    await press(" ", dialog);
    await press("Delete", dialog);
    expect(editorPlayer().play).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("포커스가 body로 빠져도 모달이 열려 있으면 단축키를 무시한다", async () => {
    const { onChange } = await setupWithSelectionAndOpenDialog();
    await press(" ", document.body);
    await press("Delete", document.body);
    expect(editorPlayer().play).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("모달 안 버튼의 Space와 Enter 기본 동작을 막지 않는다", async () => {
    await setupWithSelectionAndOpenDialog();
    const record = screen.getByRole("button", { name: en.record });
    expect(await press(" ", record)).toBe(true);
    expect(await press("Enter", record)).toBe(true);
  });

  it("모달을 닫고 에디터를 다시 누르면 Space와 Delete가 동작한다", async () => {
    const { onChange } = await setupWithSelectionAndOpenDialog();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: en.close })));
    expect(screen.queryByRole("dialog")).toBeNull();
    // 닫으면 포커스가 에디터 밖의 "열기" 버튼으로 돌아가므로 에디터를 다시 눌러야 단축키를 받는다
    activateEditor();
    await press(" ");
    expect(editorPlayer().play).toHaveBeenCalledTimes(1);
    await press("Delete");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
