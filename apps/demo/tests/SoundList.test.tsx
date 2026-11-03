import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SoundListExample } from "../src/examples/SoundList";

// jsdom에는 AudioContext가 없으므로 재생기는 대역으로 바꾼다
vi.mock("@cp949/audr-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cp949/audr-core")>();
  class FakePlayer {
    buffer: AudioBuffer;
    constructor(samples: Float32Array, sampleRate: number) {
      const data = Float32Array.from(samples);
      this.buffer = {
        length: data.length,
        sampleRate,
        duration: data.length / sampleRate,
        getChannelData: () => data,
      } as unknown as AudioBuffer;
    }
    play() {}
    stop() {}
  }
  return { ...actual, AudioBufferPlayer: FakePlayer };
});

const list = () => screen.getByRole("list", { name: "소리 목록" });
const names = () =>
  within(list())
    .getAllByRole("listitem")
    .map((li) => li.querySelector(".demo-sounds-select")?.textContent);
/** 에디터 이름 칸. 지금 편집 중인 소리를 알려 준다. */
const editing = () => (screen.getByLabelText("Sound") as HTMLInputElement).value;
const select = (name: string) => fireEvent.click(within(list()).getByRole("button", { name }));
const remove = (name: string) =>
  fireEvent.click(within(list()).getByRole("button", { name: `${name} 삭제` }));

describe("예제 소리 목록과 삭제", () => {
  it("처음에는 소리 3개가 있고 첫 소리를 편집한다", () => {
    render(<SoundListExample />);
    expect(names()).toEqual(["Sine 440Hz", "Sine 660Hz", "Sine 880Hz"]);
    expect(editing()).toBe("Sine 440Hz");
  });

  it("가운데 소리를 지우면 그 자리에 오던 다음 소리를 편집한다", () => {
    render(<SoundListExample />);
    select("Sine 660Hz");
    remove("Sine 660Hz");
    expect(names()).toEqual(["Sine 440Hz", "Sine 880Hz"]);
    expect(editing()).toBe("Sine 880Hz");
  });

  it("처음 소리를 지우면 다음 소리를 편집한다", () => {
    render(<SoundListExample />);
    remove("Sine 440Hz");
    expect(editing()).toBe("Sine 660Hz");
  });

  it("마지막 소리를 지우면 바로 앞 소리를 편집한다", () => {
    render(<SoundListExample />);
    select("Sine 880Hz");
    remove("Sine 880Hz");
    expect(names()).toEqual(["Sine 440Hz", "Sine 660Hz"]);
    expect(editing()).toBe("Sine 660Hz");
  });

  it("편집 중이 아닌 소리를 지워도 편집 중인 소리는 그대로다", () => {
    render(<SoundListExample />);
    select("Sine 660Hz");
    remove("Sine 880Hz");
    expect(names()).toEqual(["Sine 440Hz", "Sine 660Hz"]);
    expect(editing()).toBe("Sine 660Hz");
  });

  it("모두 지우면 에디터를 그리지 않고 안내를 보인다", () => {
    render(<SoundListExample />);
    remove("Sine 440Hz");
    remove("Sine 660Hz");
    remove("Sine 880Hz");
    expect(within(list()).queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByLabelText("Sound")).toBeNull();
    expect(screen.getByText(/소리가 없다/)).toBeTruthy();
  });

  it("모두 지운 뒤 사인파를 추가하면 에디터가 돌아온다", async () => {
    render(<SoundListExample />);
    remove("Sine 440Hz");
    remove("Sine 660Hz");
    remove("Sine 880Hz");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "사인파 추가" })));
    expect(names()).toHaveLength(1);
    expect(screen.queryByText(/소리가 없다/)).toBeNull();
    expect(editing()).toBe(names()[0]);
  });

  it("다른 소리와 같은 이름으로는 바꿀 수 없고 원래 이름으로 돌아간다", () => {
    render(<SoundListExample />);
    const input = screen.getByLabelText("Sound") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Sine 660Hz" } });
    fireEvent.blur(input);
    expect(input.value).toBe("Sine 440Hz");
    expect(names()).toEqual(["Sine 440Hz", "Sine 660Hz", "Sine 880Hz"]);
  });

  it("쓰지 않은 이름으로는 바꿀 수 있고 목록에 반영된다", () => {
    render(<SoundListExample />);
    const input = screen.getByLabelText("Sound") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Low A" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(names()).toEqual(["Low A", "Sine 660Hz", "Sine 880Hz"]);
  });
});
