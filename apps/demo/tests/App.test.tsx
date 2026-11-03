import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

// true이면 대역 녹음기가 마이크 권한 거부를 흉내 낸다
const mic = vi.hoisted(() => ({ fail: false }));

// jsdom에는 AudioContext가 없으므로 재생기와 녹음기는 대역으로 바꾼다
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
  class FakeRecorder {
    startListening(
      onStarted: () => void,
      _onUpdate: unknown,
      onError: (e: InstanceType<typeof actual.MicrophoneError>) => void,
    ) {
      if (mic.fail) onError(new actual.MicrophoneError("permission-denied", "denied"));
      else onStarted();
    }
    startRecording() {}
    stop() {
      return {
        levels: [0.2, 0.4],
        samples: new Float32Array(2000).fill(0.2),
        sampleRate: 44100,
        trimStart: 0,
        trimEnd: 1,
      };
    }
    dispose() {}
  }
  // 파일 이름에 "bad"가 들어 있으면 디코드 실패로 흉내 낸다. 샘플 수는 파일 크기로 정한다.
  // "long"이 들어 있으면 편집 한도(22050Hz에서 4,999,999샘플)를 1샘플 넘는 소리를 돌려준다.
  const decodeAudioFile = vi.fn(async (file: File) => {
    if (file.name.includes("bad")) throw new Error("decode failed");
    if (file.name.includes("long"))
      return { samples: new Float32Array(actual.maxEditableSamples(22050) + 1), sampleRate: 22050 };
    return { samples: new Float32Array(file.size).fill(0.25), sampleRate: 22050 };
  });
  return { ...actual, AudioBufferPlayer: FakePlayer, AudioRecorder: FakeRecorder, decodeAudioFile };
});

const soundList = () => screen.getByRole("list", { name: "Sounds" });
const items = () => within(soundList()).getAllByRole("listitem");

describe("데모 App", () => {
  it("렌더하면 소리 1개가 목록에 있고 에디터에 그 이름이 보인다", () => {
    render(<App />);
    expect(items().length).toBe(1);
    expect(within(items()[0] as HTMLElement).getByText("Sine 440Hz")).toBeTruthy();
    expect((screen.getByLabelText("Sound") as HTMLInputElement).value).toBe("Sine 440Hz");
  });

  it("copy to new 후 목록이 2개가 되고 새 소리가 선택된다", async () => {
    render(<App />);
    await copyToNew();
    expect(items().length).toBe(2);
    expect((screen.getByLabelText("Sound") as HTMLInputElement).value).toBe("Sine 440Hz2");
  });

  it("다른 소리로 바뀌어도 복사한 내용이 남아 붙이기 버튼이 켜져 있다", async () => {
    render(<App />);
    const paste = screen.getByRole("button", { name: "Paste" }) as HTMLButtonElement;
    expect(paste.disabled).toBe(true);
    // Copy to New는 복사본을 만들고 새 소리(다른 soundId)를 선택한다
    await copyToNew();
    expect((screen.getByLabelText("Sound") as HTMLInputElement).value).toBe("Sine 440Hz2");
    expect((screen.getByRole("button", { name: "Paste" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("이름을 바꾸면 목록의 이름도 바뀐다", () => {
    render(<App />);
    const input = screen.getByLabelText("Sound");
    fireEvent.change(input, { target: { value: "Beep" } });
    fireEvent.blur(input);
    expect(within(items()[0] as HTMLElement).getByText("Beep")).toBeTruthy();
  });

  it("목록의 소리를 누르면 그 소리가 에디터에 선택된다", async () => {
    render(<App />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy to New" })));
    await act(async () => fireEvent.click(within(items()[0] as HTMLElement).getByRole("button")));
    expect((screen.getByLabelText("Sound") as HTMLInputElement).value).toBe("Sine 440Hz");
  });

  it("Record로 대화상자를 열어 녹음하고 저장하면 새 소리가 추가되고 대화상자가 닫힌다", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    const dialog = screen.getByRole("dialog");
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Record" })));
    await act(async () =>
      fireEvent.click(within(dialog).getByRole("button", { name: "Stop recording" })),
    );
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Save" })));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(items().length).toBe(2);
    expect((screen.getByLabelText("Sound") as HTMLInputElement).value).toBe("recording1");
  });

  it("마이크를 쓸 수 없으면 대화상자 문구와 함께 원인별 notice로 알린다", async () => {
    mic.fail = true;
    try {
      render(<App />);
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Record" })));
      // 대화상자의 원인별 안내도 role alert라 notice는 문구로 찾는다
      expect(screen.getByText("마이크 권한이 거부되었다")).toBeTruthy();
    } finally {
      mic.fail = false;
    }
  });

  it("대화상자를 닫으면 소리가 추가되지 않는다", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(items().length).toBe(1);
  });
});

/** n바이트 파일. 위의 decodeAudioFile 대역은 파일 크기를 샘플 수로 쓴다. */
const fileOf = (name: string, size = 100) =>
  new File([new Uint8Array(size)], name, { type: "audio/wav" });

const nameInput = () => screen.getByLabelText("Sound") as HTMLInputElement;

/** 에디터는 복사한 구간을 칠해 보이려고 `onCopyToNew` 호출을 이만큼 늦춘다. 값은 packages/audr/README.md와 같다 */
const COPY_TO_NEW_DELAY_MS = 600;

/** `Copy to New`를 누르고, 늦춰진 호출이 끝나 새 소리가 목록에 들어올 때까지 가짜 타이머를 흘린다. */
async function copyToNew() {
  vi.useFakeTimers();
  try {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy to New" }));
      await vi.advanceTimersByTimeAsync(COPY_TO_NEW_DELAY_MS);
    });
  } finally {
    vi.useRealTimers();
  }
}

/** 목록의 소리를 `Copy to New`로 늘려 총 count개로 만든다. 마지막으로 만든 소리가 선택된다. */
async function growTo(count: number) {
  while (items().length < count) await copyToNew();
}

describe("데모 App 소리 내려받기", () => {
  const createObjectURL = vi.fn((_blob: Blob) => "blob:fake");
  const revokeObjectURL = vi.fn();
  let clicked: { download: string; href: string }[] = [];

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    clicked = [];
    // jsdom에는 URL.createObjectURL이 없다
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("Download WAV는 선택한 소리를 '이름.wav'로 내려받는다", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Download WAV" }));
    expect(clicked).toEqual([{ download: "Sine 440Hz.wav", href: "blob:fake" }]);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("audio/wav");
    // 44바이트 헤더 + 16비트 샘플 44100개
    expect(blob.size).toBe(44 + 44100 * 2);
  });

  it("이름을 바꾸면 바뀐 이름으로, 파일명에 못 쓰는 문자는 _로 내려받는다", () => {
    render(<App />);
    fireEvent.change(nameInput(), { target: { value: 'a/b:c*d?"e' } });
    fireEvent.blur(nameInput());
    fireEvent.click(screen.getByRole("button", { name: "Download WAV" }));
    expect(clicked[0]?.download).toBe("a_b_c_d__e.wav");
  });

  it("이름이 비어 있으면 파일명은 sound.wav다", () => {
    render(<App />);
    fireEvent.change(nameInput(), { target: { value: "" } });
    fireEvent.blur(nameInput());
    fireEvent.click(screen.getByRole("button", { name: "Download WAV" }));
    expect(clicked[0]?.download).toBe("sound.wav");
  });

  it("내려받은 뒤 다음 틱에 object URL을 해제한다", () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Download WAV" }));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});

describe("데모 App 소리 삭제", () => {
  const remove = () => screen.getByRole("button", { name: "Remove sound" });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("소리가 1개뿐이어도 확인하면 지우고 소리 0개 화면을 보인다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await act(async () => fireEvent.click(remove()));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(within(soundList()).queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("No sounds yet")).toBeTruthy();
    // 편집기는 소리가 있어야 그려진다
    expect(screen.queryByLabelText("Sound")).toBeNull();
  });

  it("소리 0개이면 Remove sound와 Download WAV가 비활성이다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await act(async () => fireEvent.click(remove()));
    expect(remove()).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Download WAV" })).toHaveProperty("disabled", true);
  });

  it("소리 0개에서 파일을 가져오면 편집기가 다시 나타난다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await act(async () => fireEvent.click(remove()));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Import sound"), {
        target: { files: [fileOf("beep.wav")] },
      });
    });
    await waitFor(() => expect(items().length).toBe(1));
    expect(nameInput().value).toBe("beep");
    expect(screen.queryByText("No sounds yet")).toBeNull();
  });

  it("확인을 거절하면 지우지 않는다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    await growTo(2);
    fireEvent.click(remove());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(items().length).toBe(2);
  });

  it("확인하면 선택한 소리를 지우고 확인창에 소리 이름이 들어 있다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await growTo(2);
    expect(nameInput().value).toBe("Sine 440Hz2");
    await act(async () => fireEvent.click(remove()));
    expect(confirm.mock.calls[0]?.[0]).toContain("Sine 440Hz2");
    expect(items().length).toBe(1);
    expect(within(items()[0] as HTMLElement).getByText("Sine 440Hz")).toBeTruthy();
  });

  it("가운데 소리를 지우면 그 자리에 오던 다음 소리가 선택된다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    // Copy to New는 선택한 소리 이름을 기준으로 해서 세 번째 이름은 Sine 440Hz22다
    await growTo(3); // Sine 440Hz, Sine 440Hz2, Sine 440Hz22
    await act(async () => fireEvent.click(within(items()[1] as HTMLElement).getByRole("button")));
    await act(async () => fireEvent.click(remove()));
    expect(items().length).toBe(2);
    expect(nameInput().value).toBe("Sine 440Hz22");
  });

  it("마지막 소리를 지우면 바로 앞 소리가 선택된다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await growTo(3);
    expect(nameInput().value).toBe("Sine 440Hz22");
    await act(async () => fireEvent.click(remove()));
    expect(items().length).toBe(2);
    expect(nameInput().value).toBe("Sine 440Hz2");
  });

  it("처음 소리를 지우면 다음 소리가 선택된다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await growTo(2);
    await act(async () => fireEvent.click(within(items()[0] as HTMLElement).getByRole("button")));
    await act(async () => fireEvent.click(remove()));
    expect(items().length).toBe(1);
    expect(nameInput().value).toBe("Sine 440Hz2");
  });

  it("지운 뒤 하나만 남아도 Remove sound는 활성이다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await growTo(2);
    await act(async () => fireEvent.click(remove()));
    expect(items().length).toBe(1);
    expect(remove()).toHaveProperty("disabled", false);
  });

  it("가져오기 디코드가 끝나고 렌더되기 전에 지워도 가져온 소리는 남는다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // act 밖 상태 갱신 경고를 숨긴다. 이 테스트는 그 틈을 일부러 만든다.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    await growTo(2); // Sine 440Hz, Sine 440Hz2 (선택)
    const workspace = soundList().closest(".workspace") as HTMLElement;
    fireEvent.drop(workspace, { dataTransfer: { files: [fileOf("late.wav")], types: ["Files"] } });
    // 디코드 대역이 끝나 addSound까지 실행되지만, 렌더는 아직 일어나지 않은 시점
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fireEvent.click(remove());
    await waitFor(() => expect(items().length).toBe(2));
    expect(items().map((li) => within(li).getByRole("button").firstChild?.textContent)).toEqual([
      "Sine 440Hz",
      "late",
    ]);
  });
});

describe("데모 App 끌어 놓아 가져오기", () => {
  const workspace = () => soundList().closest(".workspace") as HTMLElement;
  const dropFiles = (files: File[], target: HTMLElement = workspace()) =>
    act(async () => {
      fireEvent.drop(target, { dataTransfer: { files, types: ["Files"] } });
    });
  /** RTL은 dragleave의 relatedTarget을 이벤트에 싣지 않아 직접 만든다 */
  const dragLeave = (relatedTarget: Element | null) => {
    const event = new Event("dragleave", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
    fireEvent(workspace(), event);
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("오디오 파일을 놓으면 소리가 추가되고 선택된다", async () => {
    render(<App />);
    await dropFiles([fileOf("beep.wav", 500)]);
    await waitFor(() => expect(items().length).toBe(2));
    expect(within(items()[1] as HTMLElement).getByText("beep")).toBeTruthy();
    expect(nameInput().value).toBe("beep");
  });

  it("에디터 영역에 놓아도 가져온다", async () => {
    render(<App />);
    await dropFiles([fileOf("beep.wav")], nameInput());
    await waitFor(() => expect(items().length).toBe(2));
  });

  it("파일 여러 개를 놓으면 모두 추가되고 id가 겹치지 않는다", async () => {
    render(<App />);
    await dropFiles([fileOf("a.wav"), fileOf("b.wav"), fileOf("c.wav")]);
    await waitFor(() => expect(items().length).toBe(4));
    expect(nameInput().value).toBe("c");
    // id가 겹쳤다면 key 경고와 함께 선택 표시가 여러 항목에 붙는다
    expect(
      within(soundList())
        .getAllByRole("button")
        .filter((b) => b.getAttribute("aria-current") === "true").length,
    ).toBe(1);
  });

  it("디코드에 실패한 파일은 notice로 알리고 나머지는 추가한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    await dropFiles([fileOf("bad.mp3"), fileOf("ok.wav")]);
    await waitFor(() => expect(items().length).toBe(2));
    expect(screen.getByRole("alert").textContent).toBe("bad.mp3을(를) 열 수 없다");
  });

  it("편집 한도를 넘는 소리는 목록에 추가하지 않고 notice로 알린다", async () => {
    render(<App />);
    await dropFiles([fileOf("long.wav"), fileOf("ok.wav")]);
    await waitFor(() => expect(items().length).toBe(2));
    expect(nameInput().value).toBe("ok");
    expect(screen.getByRole("alert").textContent).toBe(
      "long.wav은(는) 너무 길어 편집할 수 없어 추가하지 않았다",
    );
  });

  it("열 수 없는 파일과 너무 긴 파일이 함께 있으면 두 안내를 이어서 보여 준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    await dropFiles([fileOf("bad.mp3"), fileOf("long.wav")]);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "bad.mp3을(를) 열 수 없다. long.wav은(는) 너무 길어 편집할 수 없어 추가하지 않았다",
      ),
    );
    expect(items().length).toBe(1);
  });

  it("성공하면 이전 notice를 지운다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    await dropFiles([fileOf("bad.mp3")]);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    await dropFiles([fileOf("ok.wav")]);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(items().length).toBe(2);
  });

  it("파일이 아닌 항목(텍스트 끌기)은 무시하고 기본 동작도 막지 않는다", async () => {
    render(<App />);
    const notPrevented = fireEvent.drop(workspace(), {
      dataTransfer: { files: [], types: ["text/plain"] },
    });
    expect(notPrevented).toBe(true);
    expect(items().length).toBe(1);
  });

  it("파일을 끌어 오는 동안에는 dragover의 기본 동작을 막아 drop을 받는다", () => {
    render(<App />);
    const withFiles = fireEvent.dragOver(workspace(), {
      dataTransfer: { types: ["Files"], dropEffect: "none" },
    });
    expect(withFiles).toBe(false);
    const withText = fireEvent.dragOver(workspace(), { dataTransfer: { types: ["text/plain"] } });
    expect(withText).toBe(true);
  });

  it("끌어 오는 동안 영역을 표시하고, 놓거나 벗어나면 표시를 지운다", async () => {
    render(<App />);
    fireEvent.dragEnter(workspace(), { dataTransfer: { types: ["Files"] } });
    expect(workspace().hasAttribute("data-dropping")).toBe(true);
    dragLeave(document.body);
    expect(workspace().hasAttribute("data-dropping")).toBe(false);

    fireEvent.dragEnter(workspace(), { dataTransfer: { types: ["Files"] } });
    // 자식 요소로 옮겨 가는 dragleave는 표시를 유지한다
    dragLeave(soundList());
    expect(workspace().hasAttribute("data-dropping")).toBe(true);
    await dropFiles([fileOf("beep.wav")]);
    expect(workspace().hasAttribute("data-dropping")).toBe(false);
    await waitFor(() => expect(items().length).toBe(2));
  });

  it("Import sound 입력도 같은 경로로 가져오고 실패하면 notice를 띄운다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Import sound"), {
        target: { files: [fileOf("bad.mp3")] },
      });
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("bad.mp3을(를) 열 수 없다"),
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Import sound"), {
        target: { files: [fileOf("beep.wav")] },
      });
    });
    await waitFor(() => expect(items().length).toBe(2));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("데모 App 작업 영역 밖 파일 놓기", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("파일을 헤더 같은 작업 영역 밖에 놓아도 브라우저 이동을 막는다", () => {
    render(<App />);
    const outside = document.body;
    const dragOver = fireEvent.dragOver(outside, { dataTransfer: { types: ["Files"] } });
    const drop = fireEvent.drop(outside, { dataTransfer: { files: [], types: ["Files"] } });
    expect(dragOver).toBe(false);
    expect(drop).toBe(false);
  });

  it("window에 직접 오는 이벤트도 막는다", () => {
    render(<App />);
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"] } });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("텍스트 끌기는 기본 동작을 그대로 둔다", () => {
    render(<App />);
    const dragOver = fireEvent.dragOver(document.body, { dataTransfer: { types: ["text/plain"] } });
    const drop = fireEvent.drop(document.body, {
      dataTransfer: { files: [], types: ["text/plain"] },
    });
    expect(dragOver).toBe(true);
    expect(drop).toBe(true);
  });

  it("dataTransfer가 없는 이벤트에서도 오류 없이 지나간다", () => {
    render(<App />);
    expect(fireEvent.drop(document.body)).toBe(true);
  });

  it("언마운트하면 리스너를 해제해 이후 파일 끌기를 막지 않는다", () => {
    const { unmount } = render(<App />);
    unmount();
    const drop = fireEvent.drop(document.body, { dataTransfer: { files: [], types: ["Files"] } });
    expect(drop).toBe(true);
  });

  it("작업 영역에 놓는 가져오기는 그대로 동작한다", async () => {
    render(<App />);
    const workspace = soundList().closest(".workspace") as HTMLElement;
    await act(async () => {
      fireEvent.drop(workspace, {
        dataTransfer: { files: [fileOf("beep.wav")], types: ["Files"] },
      });
    });
    await waitFor(() => expect(items().length).toBe(2));
  });
});
