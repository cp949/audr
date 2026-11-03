import { MicrophoneError, type MicrophoneErrorCode } from "@cp949/audr-core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecordDialog } from "../src/components/RecordDialog";
import { getMessages } from "../src/i18n";
import { FakeAudioBufferPlayer } from "./helpers/fakePlayer";
import { FakeAudioRecorder } from "./helpers/fakeRecorder";

vi.mock("@cp949/audr-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cp949/audr-core")>();
  const { FakeAudioBufferPlayer } = await import("./helpers/fakePlayer");
  const { FakeAudioRecorder } = await import("./helpers/fakeRecorder");
  return { ...actual, AudioBufferPlayer: FakeAudioBufferPlayer, AudioRecorder: FakeAudioRecorder };
});

const en = getMessages("en");

type Props = Partial<React.ComponentProps<typeof RecordDialog>>;

function setup(props: Props = {}) {
  const onCancel = vi.fn();
  const onSave = vi.fn();
  const utils = render(<RecordDialog open onCancel={onCancel} onSave={onSave} {...props} />);
  return { ...utils, onCancel, onSave };
}

/** 녹음기가 알리는 마이크 오류. 브라우저 예외를 감싼 경우는 cause에 원본을 둔다 */
const micError = (code: MicrophoneErrorCode, cause?: unknown) =>
  new MicrophoneError(code, code, cause);

const button = (name: string | RegExp) => screen.getByRole("button", { name });

/** 녹음 단계에서 재생·trim 단계까지 간다 */
async function recordAndStop() {
  act(() => FakeAudioRecorder.last.onStarted?.());
  await act(async () => fireEvent.click(button(en.record)));
  await act(async () => fireEvent.click(button(en.stopRecording)));
}

beforeEach(() => {
  FakeAudioRecorder.reset();
  FakeAudioBufferPlayer.reset();
});

describe("RecordDialog 열기와 닫기", () => {
  it("open이 false이면 아무것도 그리지 않고 녹음기도 만들지 않는다", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(FakeAudioRecorder.instances.length).toBe(0);
  });

  it("열면 제목이 있는 dialog가 나온다", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe(en.recordTitle);
    expect(screen.getByText(en.recordTitle)).toBeTruthy();
  });

  it("theme을 주면 body에 그려지는 모달 오버레이에 data-audr-theme이 걸린다", () => {
    setup({ theme: "blue" });
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;
    expect(overlay.getAttribute("data-audr-theme")).toBe("blue");
  });

  it("닫기 버튼, Esc, 배경 클릭은 onCancel을 부른다", () => {
    const { onCancel } = setup();
    fireEvent.click(button(en.close));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it("대화상자 안쪽을 누르면 닫히지 않는다", () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("open이 false로 바뀌면 녹음기를 dispose한다", () => {
    const { rerender, onCancel, onSave } = setup();
    const recorder = FakeAudioRecorder.last;
    expect(recorder.dispose).not.toHaveBeenCalled();
    rerender(<RecordDialog open={false} onCancel={onCancel} onSave={onSave} />);
    expect(recorder.dispose).toHaveBeenCalledTimes(1);
  });

  it("unmount하면 녹음기를 dispose한다", () => {
    const { unmount } = setup();
    const recorder = FakeAudioRecorder.last;
    unmount();
    expect(recorder.dispose).toHaveBeenCalledTimes(1);
  });

  it("다시 열면 처음 상태(녹음 단계)에서 시작한다", async () => {
    const { rerender, onCancel, onSave } = setup();
    await recordAndStop();
    expect(button(en.save)).toBeTruthy();
    rerender(<RecordDialog open={false} onCancel={onCancel} onSave={onSave} />);
    rerender(<RecordDialog open onCancel={onCancel} onSave={onSave} />);
    expect(screen.queryByRole("button", { name: en.save })).toBeNull();
    expect(button(en.record)).toBeTruthy();
  });
});

describe("RecordDialog 녹음 단계", () => {
  it("열면 권한 안내가 보이고 녹음 버튼은 비활성이다", () => {
    setup();
    expect(screen.getByText(/We need your permission to use your microphone/)).toBeTruthy();
    expect(button(en.record)).toHaveProperty("disabled", true);
    expect(FakeAudioRecorder.last.startListening).toHaveBeenCalledTimes(1);
  });

  it("마이크가 시작되면 안내가 Begin recording으로 바뀌고 녹음 버튼이 활성이다", () => {
    setup();
    act(() => FakeAudioRecorder.last.onStarted?.());
    expect(screen.getByText(en.beginRecord)).toBeTruthy();
    expect(screen.queryByText(/We need your permission/)).toBeNull();
    expect(button(en.record)).toHaveProperty("disabled", false);
  });

  it("마이크 오류가 나면 오류 문구가 보이고 녹음 버튼은 비활성이다", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    setup();
    act(() => FakeAudioRecorder.last.onError?.(micError("permission-denied")));
    expect(screen.getByText(en.microphoneErrors["permission-denied"])).toBeTruthy();
    expect(button(en.record)).toHaveProperty("disabled", true);
    expect(alert).not.toHaveBeenCalled();
  });

  it("녹음기를 만들 수 없는 환경이면 크래시 없이 오류 문구와 비활성 버튼을 보여 준다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    FakeAudioRecorder.throwOnCreate = true;
    setup();
    await waitFor(() => expect(screen.getByText(en.microphoneErrors.unsupported)).toBeTruthy());
    expect(button(en.record)).toHaveProperty("disabled", true);
    expect(error).toHaveBeenCalled();
  });

  it("녹음을 시작하면 버튼이 정지로 바뀌고, 입력 레벨이 파형으로 쌓인다", async () => {
    const { container } = setup();
    act(() => FakeAudioRecorder.last.onStarted?.());
    expect(container.ownerDocument.querySelectorAll("svg path").length).toBe(0);
    await act(async () => fireEvent.click(button(en.record)));
    expect(FakeAudioRecorder.last.startRecording).toHaveBeenCalledTimes(1);
    expect(button(en.stopRecording)).toBeTruthy();
    act(() => {
      FakeAudioRecorder.last.onUpdate?.(0.3);
      FakeAudioRecorder.last.onUpdate?.(0.6);
    });
    expect(container.ownerDocument.querySelectorAll("svg path").length).toBe(1);
  });

  it("녹음 전의 레벨 변화는 파형에 쌓이지 않는다", () => {
    setup();
    act(() => {
      FakeAudioRecorder.last.onStarted?.();
      FakeAudioRecorder.last.onUpdate?.(0.3);
    });
    expect(document.querySelectorAll("svg path").length).toBe(0);
  });

  it("녹음 길이 한도에 닿으면 정지 버튼 없이도 재생·trim 단계로 넘어간다", async () => {
    setup();
    act(() => FakeAudioRecorder.last.onStarted?.());
    await act(async () => fireEvent.click(button(en.record)));
    const recorder = FakeAudioRecorder.last;
    const [onLimitReached] = recorder.startRecording.mock.calls[0] as unknown as [() => void];
    await act(async () => {
      onLimitReached();
    });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(button(en.save)).toBeTruthy();
  });
});

describe("RecordDialog 재생·trim 단계", () => {
  it("녹음을 멈추면 파형, Play, Re-record, Save가 보인다", async () => {
    setup();
    await recordAndStop();
    expect(FakeAudioRecorder.last.stop).toHaveBeenCalledTimes(1);
    expect(button(en.playbackPlay)).toBeTruthy();
    expect(button(en.reRecord)).toBeTruthy();
    expect(button(en.save)).toBeTruthy();
    expect(document.querySelectorAll("svg path").length).toBe(1);
    expect(screen.queryByRole("button", { name: en.stopRecording })).toBeNull();
  });

  it("샘플이 0개이면 재생·trim 단계로 넘어가지 않는다", async () => {
    setup();
    FakeAudioRecorder.nextResult = {
      ...FakeAudioRecorder.nextResult,
      samples: new Float32Array(0),
    };
    await recordAndStop();
    expect(screen.queryByRole("button", { name: en.save })).toBeNull();
  });

  it("Save는 trim 구간만 잘라 samples와 WAV Blob으로 onSave를 부른다", async () => {
    const { onSave } = setup();
    await recordAndStop(); // 샘플 1000개, trim 0.25~0.75
    await act(async () => fireEvent.click(button(en.save)));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const result = onSave.mock.calls[0]?.[0] as {
      samples: Float32Array;
      sampleRate: number;
      wav: Blob;
    };
    expect(result.samples.length).toBe(500);
    expect(result.sampleRate).toBe(44100);
    expect(result.wav.size).toBe(44 + 2 * result.samples.length);
    expect(result.wav.type).toBe("audio/wav");
  });

  it("trim이 전체(0~1)이면 샘플 전체를 저장한다", async () => {
    const { onSave } = setup();
    FakeAudioRecorder.nextResult = { ...FakeAudioRecorder.nextResult, trimStart: 0, trimEnd: 1 };
    await recordAndStop();
    await act(async () => fireEvent.click(button(en.save)));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].samples.length).toBe(1000);
  });

  it("Save 중에는 버튼이 Loading…이고 비활성이며, 끝나면 되돌아온다", async () => {
    let finish!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    setup({ onSave });
    await recordAndStop();
    await act(async () => fireEvent.click(button(en.save)));
    const loading = button(en.loading);
    expect(loading).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: en.save })).toBeNull();
    await act(async () => {
      finish();
    });
    expect(button(en.save)).toHaveProperty("disabled", false);
  });

  describe("저장 중", () => {
    const pressEscape = () => fireEvent.keyDown(document, { key: "Escape" });

    /** reject로 끝낼 수 있는 pending onSave로 저장을 시작한다 */
    async function startSaving() {
      let fail!: (e: unknown) => void;
      const onSave = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
      const utils = setup({ onSave });
      await recordAndStop();
      await act(async () => fireEvent.click(button(en.save)));
      return { ...utils, fail: () => fail(new Error("upload failed")) };
    }

    /** Save 버튼에 포커스를 둔 채 저장을 시작한다(키보드로 Save를 누른 상황) */
    async function startSavingFromSaveButton() {
      let fail!: (e: unknown) => void;
      const onSave = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
      setup({ onSave });
      await recordAndStop();
      button(en.save).focus();
      await act(async () => fireEvent.click(button(en.save)));
      return { fail: () => fail(new Error("upload failed")) };
    }

    it("Esc, 배경 클릭, ✕는 녹음이 사라지지 않으므로 확인창 없이 바로 onCancel을 부른다", async () => {
      const { onCancel } = await startSaving();
      const overlay = screen.getByRole("dialog").parentElement as HTMLElement;
      pressEscape();
      fireEvent.mouseDown(overlay);
      fireEvent.click(overlay);
      fireEvent.click(button(en.close));
      expect(onCancel).toHaveBeenCalledTimes(3);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("Re-record 버튼이 비활성이고, 저장이 실패하면 다시 활성이 된다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { fail } = await startSaving();
      expect(button(en.reRecord)).toHaveProperty("disabled", true);
      await act(async () => {
        fail();
      });
      expect(button(en.reRecord)).toHaveProperty("disabled", false);
    });

    it("Save를 누르면 포커스가 body로 빠지지 않고 대화상자에 남는다", async () => {
      await startSavingFromSaveButton();
      expect(document.activeElement).toBe(screen.getByRole("dialog"));
    });

    it("저장이 실패해 Save가 다시 활성이 되면 포커스가 Save로 돌아온다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { fail } = await startSavingFromSaveButton();
      await act(async () => {
        fail();
      });
      expect(button(en.save)).toHaveProperty("disabled", false);
      expect(document.activeElement).toBe(button(en.save));
    });

    it("저장 중에 사용자가 옮긴 포커스는 저장이 실패해도 빼앗지 않는다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { fail } = await startSavingFromSaveButton();
      button(en.close).focus();
      await act(async () => {
        fail();
      });
      expect(document.activeElement).toBe(button(en.close));
    });

    it("저장이 실패해 Save로 돌아오면 닫기는 다시 확인창을 거친다", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { onCancel, fail } = await startSaving();
      await act(async () => {
        fail();
      });
      pressEscape();
      expect(screen.getByRole("alertdialog")).toBeTruthy();
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  it("onSave가 실패해도 버튼이 Save로 돌아온다", async () => {
    const onSave = vi.fn(() => Promise.reject(new Error("upload failed")));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ onSave });
    await recordAndStop();
    await act(async () => fireEvent.click(button(en.save)));
    await waitFor(() => expect(button(en.save)).toHaveProperty("disabled", false));
    expect(error).toHaveBeenCalled();
  });

  describe("onError", () => {
    /** Save를 눌러 onSave 결과를 기다린다 */
    async function clickSave() {
      await recordAndStop();
      await act(async () => fireEvent.click(button(en.save)));
    }

    it("onSave가 reject하면 onError를 오류 인자와 함께 호출한다", async () => {
      const failure = new Error("upload failed");
      const onSave = vi.fn(() => Promise.reject(failure));
      const onError = vi.fn();
      vi.spyOn(console, "error").mockImplementation(() => {});
      setup({ onSave, onError });
      await clickSave();
      await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
      expect(onError).toHaveBeenCalledWith({ kind: "save", cause: failure });
    });

    it("onError가 없으면 console.error만 하고 버튼이 Save로 돌아온다", async () => {
      const onSave = vi.fn(() => Promise.reject(new Error("upload failed")));
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      setup({ onSave });
      await clickSave();
      await waitFor(() => expect(button(en.save)).toHaveProperty("disabled", false));
      expect(error).toHaveBeenCalled();
    });

    it("onError가 던져도 처리되지 않은 rejection 없이 버튼이 Save로 돌아온다", async () => {
      const onSave = vi.fn(() => Promise.reject(new Error("upload failed")));
      const onError = vi.fn(() => {
        throw new Error("onError 자체 실패");
      });
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      try {
        setup({ onSave, onError });
        await clickSave();
        await waitFor(() => expect(button(en.save)).toHaveProperty("disabled", false));
        // 처리되지 않은 rejection은 다음 틱 이후에 보고되므로 한 번 비운다
        await new Promise((resolve) => setTimeout(resolve, 0));
      } finally {
        process.off("unhandledRejection", unhandled);
      }
      expect(onError).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
      // 저장 실패와 onError 실패를 모두 남긴다
      expect(error).toHaveBeenCalledTimes(2);
    });

    it("onSave가 Error가 아닌 값(undefined)으로 reject해도 onError에 그대로 넘기고 버튼이 돌아온다", async () => {
      const onSave = vi.fn(() => Promise.reject(undefined));
      const onError = vi.fn();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      try {
        setup({ onSave, onError });
        await clickSave();
        await waitFor(() => expect(button(en.save)).toHaveProperty("disabled", false));
        await new Promise((resolve) => setTimeout(resolve, 0));
      } finally {
        process.off("unhandledRejection", unhandled);
      }
      expect(onError).toHaveBeenCalledWith({ kind: "save", cause: undefined });
      expect(unhandled).not.toHaveBeenCalled();
    });

    it("onSave가 성공하면 onError를 호출하지 않는다", async () => {
      const onError = vi.fn();
      const { onSave } = setup({ onError });
      await clickSave();
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onError).not.toHaveBeenCalled();
    });
  });

  it("Play를 누르면 trim 구간을 재생하고 Stop으로 바뀐다", async () => {
    setup();
    await recordAndStop();
    await act(async () => fireEvent.click(button(en.playbackPlay)));
    const player = FakeAudioBufferPlayer.last;
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.play.mock.calls[0]?.slice(0, 2)).toEqual([0.25, 0.75]);
    expect(screen.queryByRole("button", { name: en.playbackPlay })).toBeNull();
    act(() => player.onUpdate?.(0.4));
    await act(async () => fireEvent.click(button(en.playbackStop)));
    expect(player.stop).toHaveBeenCalled();
    expect(button(en.playbackPlay)).toBeTruthy();
  });

  it("재생이 끝나면 Play 버튼으로 돌아온다", async () => {
    setup();
    await recordAndStop();
    await act(async () => fireEvent.click(button(en.playbackPlay)));
    act(() => FakeAudioBufferPlayer.last.onEnded?.());
    expect(button(en.playbackPlay)).toBeTruthy();
  });

  it("Re-record는 확인 뒤 재생을 멈추고 녹음 단계로 돌아가 새 녹음기를 만든다", async () => {
    setup();
    await recordAndStop();
    const firstRecorder = FakeAudioRecorder.last;
    await act(async () => fireEvent.click(button(en.playbackPlay)));
    const player = FakeAudioBufferPlayer.last;
    fireEvent.click(button(en.reRecord));
    await act(async () => fireEvent.click(button(en.discardConfirm)));
    expect(player.stop).toHaveBeenCalled();
    expect(firstRecorder.dispose).toHaveBeenCalledTimes(1);
    expect(FakeAudioRecorder.instances.length).toBe(2);
    expect(screen.queryByRole("button", { name: en.save })).toBeNull();
    expect(button(en.record)).toBeTruthy();
  });

  it("재생 중 Re-record한 뒤 다시 녹음해 재생·trim 단계로 오면 이전 재생 위치선이 남지 않는다", async () => {
    const { container } = setup();
    await recordAndStop();
    await act(async () => fireEvent.click(button(en.playbackPlay)));
    act(() => FakeAudioBufferPlayer.last.onUpdate?.(0.4));
    expect(container.ownerDocument.querySelector('[class*="playheadContainer"]')).not.toBeNull();
    fireEvent.click(button(en.reRecord));
    await act(async () => fireEvent.click(button(en.discardConfirm)));
    await recordAndStop();
    expect(button(en.playbackPlay)).toBeTruthy();
    expect(container.ownerDocument.querySelector('[class*="playheadContainer"]')).toBeNull();
  });

  it("닫으면 재생기를 멈춘다", async () => {
    const { rerender, onCancel, onSave } = setup();
    await recordAndStop();
    await act(async () => fireEvent.click(button(en.playbackPlay)));
    const player = FakeAudioBufferPlayer.last;
    rerender(<RecordDialog open={false} onCancel={onCancel} onSave={onSave} />);
    expect(player.stop).toHaveBeenCalled();
  });
});

describe("RecordDialog 한국어", () => {
  it("locale ko이면 한국어 문구를 쓴다", () => {
    setup({ locale: "ko" });
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("소리 녹음하기");
    expect(screen.getByText(/마이크를 사용하려면 사용자의 허락이 필요합니다/)).toBeTruthy();
  });
});

describe("RecordDialog trim 핸들 키보드 조작", () => {
  it("재생 단계의 trim 핸들을 방향키로 옮기면 위치가 바뀐다", async () => {
    setup();
    await recordAndStop(); // trim 0.25~0.75
    const start = screen.getByRole("slider", { name: en.trimStart });
    const end = screen.getByRole("slider", { name: en.trimEnd });
    expect(start.getAttribute("aria-valuenow")).toBe("25");
    expect(end.getAttribute("aria-valuenow")).toBe("75");
    await act(async () => {
      fireEvent.keyDown(start, { key: "ArrowRight", shiftKey: true });
      fireEvent.keyDown(end, { key: "ArrowLeft" });
    });
    expect(screen.getByRole("slider", { name: en.trimStart }).getAttribute("aria-valuenow")).toBe(
      "35",
    );
    expect(screen.getByRole("slider", { name: en.trimEnd }).getAttribute("aria-valuenow")).toBe(
      "74",
    );
  });
});

describe("RecordDialog trim 핸들 위치 낭독", () => {
  it("핸들 위치를 녹음 길이 기준 초로 읽고, 방향키로 옮기면 따라 바뀐다", async () => {
    setup();
    FakeAudioRecorder.nextResult = {
      ...FakeAudioRecorder.nextResult,
      samples: new Float32Array(44100 * 4).fill(0.1),
    };
    await recordAndStop(); // 4초, trim 0.25~0.75
    const text = (name: string) =>
      screen.getByRole("slider", { name }).getAttribute("aria-valuetext");
    expect(text(en.trimStart)).toBe("1.00 seconds");
    expect(text(en.trimEnd)).toBe("3.00 seconds");
    await act(async () =>
      fireEvent.keyDown(screen.getByRole("slider", { name: en.trimEnd }), { key: "ArrowLeft" }),
    );
    expect(text(en.trimEnd)).toBe("2.96 seconds");
  });

  // 1초 미만에서는 방향키 1%가 0.01초보다 작아 둘째 자리로는 문구가 바뀌지 않는다
  it("1초 미만 소리는 소수 셋째 자리까지 읽고, 방향키 한 번에 문구가 바뀐다", async () => {
    setup();
    FakeAudioRecorder.nextResult = {
      ...FakeAudioRecorder.nextResult,
      samples: new Float32Array(22050).fill(0.1),
    };
    await recordAndStop(); // 0.5초, trim 0.25~0.75
    const text = (name: string) =>
      screen.getByRole("slider", { name }).getAttribute("aria-valuetext");
    expect(text(en.trimStart)).toBe("0.125 seconds");
    expect(text(en.trimEnd)).toBe("0.375 seconds");
    await act(async () =>
      fireEvent.keyDown(screen.getByRole("slider", { name: en.trimStart }), { key: "ArrowRight" }),
    );
    expect(text(en.trimStart)).toBe("0.130 seconds");
  });

  it("정확히 1초인 소리는 소수 둘째 자리까지 읽는다", async () => {
    setup();
    FakeAudioRecorder.nextResult = {
      ...FakeAudioRecorder.nextResult,
      samples: new Float32Array(44100).fill(0.1),
    };
    await recordAndStop(); // 1초, trim 0.25~0.75
    expect(screen.getByRole("slider", { name: en.trimStart }).getAttribute("aria-valuetext")).toBe(
      "0.25 seconds",
    );
  });
});

describe("RecordDialog 마이크 오류 원인별 문구", () => {
  const codes: MicrophoneErrorCode[] = [
    "permission-denied",
    "policy-blocked",
    "insecure-context",
    "unsupported",
    "device-not-found",
    "device-in-use",
    "track-ended",
    "aborted",
    "unknown",
  ];

  it("code마다 자기 안내 문구를 보인다", () => {
    for (const code of codes) {
      const { unmount } = setup();
      act(() => FakeAudioRecorder.last.onError?.(micError(code)));
      expect(screen.getByText(en.microphoneErrors[code]), code).toBeTruthy();
      unmount();
    }
    // 문구가 서로 같으면 원인을 구분해 안내한다는 계약이 깨진다
    expect(new Set(Object.values(en.microphoneErrors)).size).toBe(codes.length);
  });

  it("오류 문구는 스크린 리더에 알려지도록 role alert다", () => {
    setup();
    act(() => FakeAudioRecorder.last.onError?.(micError("device-in-use")));
    expect(screen.getByRole("alert").textContent).toBe(en.microphoneErrors["device-in-use"]);
  });

  it("한국어 로케일은 한국어 문구를 보인다", () => {
    setup({ locale: "ko" });
    act(() => FakeAudioRecorder.last.onError?.(micError("permission-denied")));
    expect(screen.getByText(getMessages("ko").microphoneErrors["permission-denied"])).toBeTruthy();
  });
});

describe("RecordDialog 마이크 끊김", () => {
  /** 마이크를 열고 녹음을 시작한 상태 */
  async function startRecording() {
    act(() => FakeAudioRecorder.last.onStarted?.());
    await act(async () => fireEvent.click(button(en.record)));
  }

  it("녹음 전(대기 중)에 끊기면 track-ended 문구를 보이고 녹음 버튼은 비활성이며 호스트에 한 번 알린다", () => {
    const onError = vi.fn();
    setup({ onError });
    act(() => FakeAudioRecorder.last.onStarted?.());
    act(() => FakeAudioRecorder.last.onError?.(micError("track-ended")));
    expect(screen.getByText(en.microphoneErrors["track-ended"])).toBeTruthy();
    expect(button(en.record)).toHaveProperty("disabled", true);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "microphone", code: "track-ended" }),
    );
  });

  it("녹음 중에 끊기면 그때까지의 녹음을 살려 재생·trim 단계로 넘기고 안내 문구를 보인다", async () => {
    const onError = vi.fn();
    const { onSave } = setup({ onError });
    await startRecording();
    await act(async () => {
      FakeAudioRecorder.last.onError?.(micError("track-ended"));
    });
    expect(FakeAudioRecorder.last.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe(en.recordingInterrupted);
    expect(screen.queryByText(en.microphoneErrors["track-ended"])).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "microphone", code: "track-ended" }),
    );
    // 살린 녹음은 그대로 저장할 수 있다
    await act(async () => fireEvent.click(button(en.save)));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("끊겨서 멈춘 뒤 다시 녹음해 직접 멈추면 안내 문구가 사라진다", async () => {
    setup();
    await startRecording();
    await act(async () => {
      FakeAudioRecorder.last.onError?.(micError("track-ended"));
    });
    fireEvent.click(button(en.reRecord));
    await act(async () => fireEvent.click(button(en.discardConfirm)));
    await recordAndStop();
    expect(screen.queryByText(en.recordingInterrupted)).toBeNull();
  });

  it("끊겨서 멈춘 뒤 Re-record한 새 녹음기가 실패하면 그 원인을 호스트에 다시 알린다", async () => {
    const onError = vi.fn();
    setup({ onError });
    await startRecording();
    await act(async () => {
      FakeAudioRecorder.last.onError?.(micError("track-ended"));
    });
    fireEvent.click(button(en.reRecord));
    await act(async () => fireEvent.click(button(en.discardConfirm)));
    // 끊긴 마이크를 다시 열지 못한 경우다. 호스트는 track-ended만 받은 채로 남으면 안 된다
    act(() => FakeAudioRecorder.last.onError?.(micError("device-not-found")));
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "microphone", code: "device-not-found" }),
    );
  });

  it("샘플이 쌓이기 전에 끊기면 녹음 단계에 오류 문구를 보이고 녹음 중 상태를 풀어 닫을 때 확인하지 않는다", async () => {
    FakeAudioRecorder.nextResult = {
      levels: [],
      samples: new Float32Array(0),
      sampleRate: 44100,
      trimStart: 0,
      trimEnd: 1,
    };
    const { onCancel } = setup();
    await startRecording();
    await act(async () => {
      FakeAudioRecorder.last.onError?.(micError("track-ended"));
    });
    expect(screen.getByText(en.microphoneErrors["track-ended"])).toBeTruthy();
    expect(button(en.record)).toHaveProperty("disabled", true);
    fireEvent.click(button(en.close));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("RecordDialog 마이크 오류 알림", () => {
  it("마이크 권한 거부는 kind microphone, code, 브라우저 원본 예외(cause)로 onError에 알린다", () => {
    const onError = vi.fn();
    setup({ onError });
    const cause = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    act(() => FakeAudioRecorder.last.onError?.(micError("permission-denied", cause)));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({ kind: "microphone", code: "permission-denied", cause });
  });

  it("사전 검사 실패처럼 원본 예외가 없으면 cause는 MicrophoneError 자신이다", () => {
    const onError = vi.fn();
    setup({ onError });
    const error = micError("insecure-context");
    act(() => FakeAudioRecorder.last.onError?.(error));
    expect(onError).toHaveBeenCalledWith({
      kind: "microphone",
      code: "insecure-context",
      cause: error,
    });
  });

  // 이전 버전의 호스트 코드는 kind만 읽는다. code가 늘어도 kind 분기가 그대로 동작해야 한다
  it("kind만 읽는 호스트 코드도 마이크 실패를 구분한다", () => {
    const kinds: string[] = [];
    setup({ onError: ({ kind }) => kinds.push(kind) });
    act(() => FakeAudioRecorder.last.onError?.(micError("device-not-found")));
    expect(kinds).toEqual(["microphone"]);
  });

  it("녹음기를 만들 수 없는 환경이면 kind microphone, code unsupported, 생성 오류 cause로 알린다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    FakeAudioRecorder.throwOnCreate = true;
    const onError = vi.fn();
    setup({ onError });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith({
      kind: "microphone",
      code: "unsupported",
      cause: expect.any(Error),
    });
  });

  it("StrictMode의 effect 이중 실행에서도 녹음기 생성 실패를 한 번만 알린다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    FakeAudioRecorder.throwOnCreate = true;
    const onError = vi.fn();
    render(
      <StrictMode>
        <RecordDialog open onCancel={vi.fn()} onSave={vi.fn()} onError={onError} />
      </StrictMode>,
    );
    await act(async () => {});
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("녹음기 생성 실패를 알리기 전에 대화상자를 닫으면 알리지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    FakeAudioRecorder.throwOnCreate = true;
    const onError = vi.fn();
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const { rerender } = setup({ onError, onCancel, onSave });
    // 생성 실패 알림은 microtask로 미뤄져 있다. 그 전에 닫는다
    rerender(<RecordDialog open={false} onCancel={onCancel} onSave={onSave} onError={onError} />);
    await act(async () => {});
    expect(onError).not.toHaveBeenCalled();
  });

  it("StrictMode에서 두 녹음기가 모두 실패를 알려도 한 번만 알린다", async () => {
    const onError = vi.fn();
    render(
      <StrictMode>
        <RecordDialog open onCancel={vi.fn()} onSave={vi.fn()} onError={onError} />
      </StrictMode>,
    );
    // 이중 실행으로 녹음기가 둘 만들어진다
    expect(FakeAudioRecorder.instances.length).toBe(2);
    act(() => {
      for (const recorder of FakeAudioRecorder.instances)
        recorder.onError?.(micError("permission-denied"));
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("onError가 던져도 오류 문구는 그대로 보이고 console.error로 남긴다", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn(() => {
      throw new Error("onError 자체 실패");
    });
    setup({ onError });
    act(() => FakeAudioRecorder.last.onError?.(micError("permission-denied")));
    expect(screen.getByText(en.microphoneErrors["permission-denied"])).toBeTruthy();
    expect(consoleError).toHaveBeenCalledWith("onError 콜백이 예외를 던졌다", expect.any(Error));
  });

  it("onError가 없어도 오류 문구를 보여 준다", () => {
    setup();
    act(() => FakeAudioRecorder.last.onError?.(micError("permission-denied")));
    expect(screen.getByText(en.microphoneErrors["permission-denied"])).toBeTruthy();
  });

  it("대화상자를 닫았다 다시 열면 새 마이크 실패를 다시 알린다", () => {
    const onError = vi.fn();
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const { rerender } = setup({ onError, onCancel, onSave });
    act(() => FakeAudioRecorder.last.onError?.(micError("permission-denied")));
    rerender(<RecordDialog open={false} onCancel={onCancel} onSave={onSave} onError={onError} />);
    rerender(<RecordDialog open onCancel={onCancel} onSave={onSave} onError={onError} />);
    act(() => FakeAudioRecorder.last.onError?.(micError("device-not-found")));
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("저장 실패는 kind save로 구분해 알린다", async () => {
    const failure = new Error("upload failed");
    const onSave = vi.fn(() => Promise.reject(failure));
    const onError = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ onSave, onError });
    await recordAndStop();
    await act(async () => fireEvent.click(button(en.save)));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith({ kind: "save", cause: failure });
  });
});

// 녹음이 확인 없이 사라지는 경로(닫기, Re-record)를 막는 확인창을 고정한다.
// 지킬 계약: 녹음 중이거나 녹음이 있으면 확인 뒤에만 버리고, 확인창 중에도 녹음은 이어진다.
describe("RecordDialog 녹음 버림 확인", () => {
  const confirmDialog = () => screen.queryByRole("alertdialog");
  const pressEscape = () => fireEvent.keyDown(document, { key: "Escape" });
  const clickBackdrop = () => {
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
  };

  /** 녹음 단계에서 녹음을 시작하고 한도 도달 콜백을 돌려준다 */
  async function startRecording() {
    act(() => FakeAudioRecorder.last.onStarted?.());
    await act(async () => fireEvent.click(button(en.record)));
    const [onLimitReached] = FakeAudioRecorder.last.startRecording.mock.calls[0] as unknown as [
      () => void,
    ];
    return onLimitReached;
  }

  it("녹음 전에는 확인 없이 바로 닫는다", () => {
    const { onCancel } = setup();
    pressEscape();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(confirmDialog()).toBeNull();
  });

  it.each([
    ["Esc", pressEscape],
    ["✕ 버튼", () => fireEvent.click(button(en.close))],
    ["배경 클릭", clickBackdrop],
  ])("녹음 중에 %s로 닫으려 하면 onCancel 대신 확인창을 띄운다", async (_name, requestClose) => {
    const { onCancel } = setup();
    await startRecording();
    requestClose();
    const alert = screen.getByRole("alertdialog", { name: en.discardTitle });
    expect(alert.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(en.discardOnClose)).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("확인창이 뜨면 포커스는 돌아가기 버튼으로 가고, 녹음기는 멈추지 않는다", async () => {
    setup();
    await startRecording();
    pressEscape();
    expect(document.activeElement).toBe(button(en.discardKeep));
    expect(FakeAudioRecorder.last.stop).not.toHaveBeenCalled();
    expect(FakeAudioRecorder.last.dispose).not.toHaveBeenCalled();
  });

  it("확인창에서 버리기를 고르면 onCancel을 부른다", async () => {
    const { onCancel } = setup();
    await recordAndStop();
    pressEscape();
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(button(en.discardConfirm));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Esc", pressEscape],
    ["배경 클릭", clickBackdrop],
    ["돌아가기", () => fireEvent.click(button(en.discardKeep))],
  ])("확인창에서 %s는 확인창만 닫고 대화상자와 녹음을 유지한다", async (_name, dismiss) => {
    const { onCancel } = setup();
    await recordAndStop();
    pressEscape();
    expect(confirmDialog()).not.toBeNull();
    dismiss();
    expect(confirmDialog()).toBeNull();
    expect(button(en.save)).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();
  });

  // Esc를 누르고 있으면 반복 keydown이 와서 확인창이 열렸다 닫히기를 되풀이했다
  it("Esc를 누르고 있어도 반복 입력으로 확인창이 닫히지 않는다", async () => {
    setup();
    await recordAndStop();
    pressEscape();
    fireEvent.keyDown(document, { key: "Escape", repeat: true });
    expect(confirmDialog()).not.toBeNull();
  });

  it("확인창을 닫으면 포커스가 열기 전 요소로 돌아간다", async () => {
    setup();
    await startRecording();
    const stop = button(en.stopRecording);
    stop.focus();
    pressEscape();
    expect(document.activeElement).toBe(button(en.discardKeep));
    pressEscape();
    expect(document.activeElement).toBe(stop);
  });

  it.each([
    ["돌아가기", () => fireEvent.click(button(en.discardKeep))],
    ["Esc", pressEscape],
    ["✕ 버튼", () => fireEvent.click(button(en.close))],
    ["배경 클릭", clickBackdrop],
  ])(
    "확인창이 떠 있는 동안 한도에 닿아 재생 단계로 넘어가면, 확인창을 닫을 때(%s) 포커스가 Play 버튼으로 간다",
    async (_name, dismiss) => {
      const { onCancel } = setup();
      const onLimitReached = await startRecording();
      button(en.stopRecording).focus();
      pressEscape();
      await act(async () => {
        onLimitReached();
      });
      expect(confirmDialog()).not.toBeNull();
      expect(document.activeElement).toBe(button(en.discardKeep));
      dismiss();
      expect(confirmDialog()).toBeNull();
      expect(button(en.save)).toBeTruthy();
      expect(document.activeElement).toBe(button(en.playbackPlay));
      expect(onCancel).not.toHaveBeenCalled();
    },
  );

  // 브라우저는 배경을 누르면 포커스를 body로 옮긴다. 단계가 그대로이므로 Play가 아니라 대화상자로 돌아와야 한다
  it("재생 단계에서 포커스가 body일 때 연 확인창을 닫으면 포커스는 대화상자로 간다", async () => {
    setup();
    await recordAndStop();
    (document.activeElement as HTMLElement).blur();
    clickBackdrop();
    expect(confirmDialog()).not.toBeNull();
    fireEvent.click(button(en.discardKeep));
    expect(confirmDialog()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("Re-record는 확인창을 띄우고, 돌아가기를 고르면 재생 단계에 머문다", async () => {
    setup();
    await recordAndStop();
    fireEvent.click(button(en.reRecord));
    expect(screen.getByRole("alertdialog", { name: en.discardTitle })).toBeTruthy();
    expect(screen.getByText(en.discardOnReRecord)).toBeTruthy();
    fireEvent.click(button(en.discardKeep));
    expect(button(en.save)).toBeTruthy();
    expect(FakeAudioRecorder.instances.length).toBe(1);
  });

  describe("단계 전환 포커스", () => {
    it("Stop으로 멈추면 포커스가 Play 버튼으로 간다", async () => {
      setup();
      await startRecording();
      button(en.stopRecording).focus();
      await act(async () => fireEvent.click(button(en.stopRecording)));
      expect(document.activeElement).toBe(button(en.playbackPlay));
    });

    it("한도 자동 정지도 포커스를 Play 버튼으로 옮긴다", async () => {
      setup();
      const onLimitReached = await startRecording();
      button(en.stopRecording).focus();
      await act(async () => {
        onLimitReached();
      });
      expect(document.activeElement).toBe(button(en.playbackPlay));
    });

    it("Re-record를 버리면 마이크가 열린 뒤 Record 버튼으로 포커스가 간다. 그 전에는 대화상자에 둔다", async () => {
      setup();
      await recordAndStop();
      fireEvent.click(button(en.reRecord));
      await act(async () => fireEvent.click(button(en.discardConfirm)));
      // 새 녹음기가 마이크를 여는 동안 Record 버튼은 비활성이다
      expect(button(en.record)).toHaveProperty("disabled", true);
      expect(document.activeElement).toBe(screen.getByRole("dialog"));
      act(() => FakeAudioRecorder.last.onStarted?.());
      expect(document.activeElement).toBe(button(en.record));
    });

    it("마이크를 기다리는 사이 사용자가 포커스를 옮겼으면 Record 버튼이 빼앗지 않는다", async () => {
      setup();
      await recordAndStop();
      fireEvent.click(button(en.reRecord));
      await act(async () => fireEvent.click(button(en.discardConfirm)));
      button(en.close).focus();
      act(() => FakeAudioRecorder.last.onStarted?.());
      expect(document.activeElement).toBe(button(en.close));
    });

    it("처음 열었을 때는 마이크가 열려도 포커스를 옮기지 않는다", () => {
      setup();
      act(() => FakeAudioRecorder.last.onStarted?.());
      expect(document.activeElement).toBe(screen.getByRole("dialog"));
    });

    it("확인창이 떠 있는 동안 자동 정지가 일어나도 포커스는 확인창에 남는다", async () => {
      setup();
      const onLimitReached = await startRecording();
      button(en.stopRecording).focus();
      fireEvent.keyDown(document, { key: "Escape" });
      await act(async () => {
        onLimitReached();
      });
      expect(document.activeElement).toBe(button(en.discardKeep));
    });
  });

  it("Re-record 확인창에서 버리기를 고르면 새 녹음기로 녹음 단계에 돌아간다", async () => {
    const { onCancel } = setup();
    await recordAndStop();
    fireEvent.click(button(en.reRecord));
    await act(async () => fireEvent.click(button(en.discardConfirm)));
    expect(confirmDialog()).toBeNull();
    expect(FakeAudioRecorder.instances.length).toBe(2);
    expect(button(en.record)).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.save })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("한도에 닿아 자동으로 멈추면 재생 단계에 안내 문구를 보인다", async () => {
    setup();
    const onLimitReached = await startRecording();
    await act(async () => {
      onLimitReached();
    });
    expect(screen.getByRole("status").textContent).toBe(en.recordingLimitReached);
  });

  it("사용자가 직접 멈추면 안내 문구를 보이지 않는다", async () => {
    setup();
    await recordAndStop();
    expect(screen.queryByText(en.recordingLimitReached)).toBeNull();
  });

  it("자동 정지 안내는 다시 녹음한 뒤 직접 멈추면 사라진다", async () => {
    setup();
    const onLimitReached = await startRecording();
    await act(async () => {
      onLimitReached();
    });
    fireEvent.click(button(en.reRecord));
    await act(async () => fireEvent.click(button(en.discardConfirm)));
    await recordAndStop();
    expect(screen.queryByText(en.recordingLimitReached)).toBeNull();
  });
});

describe("RecordDialog 시간 표시", () => {
  /** 녹음을 시작하고 경과 시간을 정해 한 프레임을 흘린다 */
  async function startAndTick(recordedSeconds: number) {
    act(() => FakeAudioRecorder.last.onStarted?.());
    await act(async () => fireEvent.click(button(en.record)));
    FakeAudioRecorder.last.recordedSeconds = recordedSeconds;
    act(() => FakeAudioRecorder.last.onUpdate?.(0.3));
  }

  it("녹음 중에만 경과 시간과 최대 길이를 m:ss로 보인다", async () => {
    setup();
    act(() => FakeAudioRecorder.last.onStarted?.());
    act(() => FakeAudioRecorder.last.onUpdate?.(0.3));
    expect(screen.queryByText(/ \/ /)).toBeNull();
    await act(async () => fireEvent.click(button(en.record)));
    FakeAudioRecorder.last.recordedSeconds = 12.9;
    act(() => FakeAudioRecorder.last.onUpdate?.(0.3));
    // 최대 길이 9,999,999 / 44100 = 226.77초는 3:46으로 내림한다
    expect(screen.getByText("0:12 / 3:46")).toBeTruthy();
    FakeAudioRecorder.last.recordedSeconds = 75;
    act(() => FakeAudioRecorder.last.onUpdate?.(0.3));
    expect(screen.getByText("1:15 / 3:46")).toBeTruthy();
  });

  it("남은 시간이 30초 이하가 되면 라벨이 경고 스타일로 바뀐다", async () => {
    setup();
    // 남은 시간 226.77 - 196.7 = 30.07초
    await startAndTick(196.7);
    expect(screen.getByText("3:16 / 3:46").className).not.toContain("timeLabelWarning");
    FakeAudioRecorder.last.recordedSeconds = 196.77;
    act(() => FakeAudioRecorder.last.onUpdate?.(0.3));
    expect(screen.getByText("3:16 / 3:46").className).toContain("timeLabelWarning");
  });

  it("녹음을 멈추면 경과 시간 라벨이 사라지고 다시 녹음하면 0부터 다시 센다", async () => {
    setup();
    await startAndTick(12);
    await act(async () => fireEvent.click(button(en.stopRecording)));
    expect(screen.queryByText(/ \/ /)).toBeNull();
    fireEvent.click(button(en.reRecord));
    await act(async () => fireEvent.click(button(en.discardConfirm)));
    await startAndTick(0);
    expect(screen.getByText("0:00 / 3:46")).toBeTruthy();
  });

  it("재생·trim 단계에서 저장할 길이를 trim 구간대로 소수 둘째 자리 초로 보이고 핸들을 옮기면 갱신한다", async () => {
    // 44100샘플(1초)을 0.25~0.75로 자르면 0.50초다
    FakeAudioRecorder.nextResult = {
      ...FakeAudioRecorder.nextResult,
      samples: new Float32Array(44100).fill(0.1),
    };
    setup();
    await recordAndStop();
    expect(screen.getByText("Length 0.50 s")).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("slider", { name: en.trimStart }), {
        key: "ArrowRight",
        shiftKey: true,
      });
    });
    // 시작 0.35, 끝 0.75
    expect(screen.getByText("Length 0.40 s")).toBeTruthy();
  });

  it("저장할 길이의 소수점 기호는 locale을 따르고 messages로 문구를 바꿀 수 있다", async () => {
    FakeAudioRecorder.nextResult = {
      ...FakeAudioRecorder.nextResult,
      samples: new Float32Array(44100).fill(0.1),
    };
    setup({ locale: "de", messages: { recordSavedLength: "Dauer {seconds} s" } });
    await recordAndStop();
    expect(screen.getByText("Dauer 0,50 s")).toBeTruthy();
  });

  it("저장하는 샘플 수와 화면에 보이는 길이가 같다", async () => {
    FakeAudioRecorder.nextResult = {
      ...FakeAudioRecorder.nextResult,
      samples: new Float32Array(44100).fill(0.1),
    };
    const { onSave } = setup();
    await recordAndStop();
    await act(async () => fireEvent.click(button(en.save)));
    const saved = onSave.mock.calls[0]?.[0] as { samples: Float32Array; sampleRate: number };
    expect((saved.samples.length / saved.sampleRate).toFixed(2)).toBe("0.50");
  });
});
