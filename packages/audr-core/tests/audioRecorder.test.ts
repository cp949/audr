import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioRecorder } from "../src/audioRecorder";
import { maxEditableSamples } from "../src/audioUtil";
import { MicrophoneError } from "../src/microphoneError";

const BUFFER_LENGTH = 8192;
const CHUNK = 1024;

type ProcessEvent = { inputBuffer: { getChannelData: (c: number) => Float32Array } };

/** 연결 호출만 기록하는 가짜 노드 */
function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

/** AudioRecorder가 쓰는 노드만 제공하는 가짜 AudioContext */
function fakeContext() {
  const processor = { ...fakeNode(), onaudioprocess: null as null | ((e: ProcessEvent) => void) };
  const analyser = {
    ...fakeNode(),
    fftSize: 0,
    frequencyBinCount: 1024,
    getFloatTimeDomainData: vi.fn(),
  };
  const ctx = {
    sampleRate: 44100,
    destination: {},
    createMediaStreamSource: vi.fn(() => fakeNode()),
    createGain: vi.fn(() => fakeNode()),
    createScriptProcessor: vi.fn(() => processor),
    createAnalyser: vi.fn(() => analyser),
  };
  return { ctx: ctx as unknown as AudioContext, processor, analyser };
}

/** 트랙 하나짜리 가짜 스트림. `end()`는 마이크가 분리된 것처럼 ended 이벤트를 낸다 */
function fakeStream() {
  const track = Object.assign(new EventTarget(), { stop: vi.fn() });
  const addSpy = vi.spyOn(track, "addEventListener");
  const removeSpy = vi.spyOn(track, "removeEventListener");
  return {
    track,
    addSpy,
    removeSpy,
    end: () => track.dispatchEvent(new Event("ended")),
    stream: { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream,
  };
}

/** 청크별 진폭 배열로 8192샘플 버퍼 여러 개를 만든다 (청크 1024샘플은 같은 값). */
function buffersFromChunkAmplitudes(bufferCount: number, amplitudes: Map<number, number>) {
  const buffers: Float32Array[] = [];
  for (let b = 0; b < bufferCount; b++) {
    const data = new Float32Array(BUFFER_LENGTH);
    for (let c = 0; c < BUFFER_LENGTH / CHUNK; c++) {
      const globalChunk = b * (BUFFER_LENGTH / CHUNK) + c;
      data.fill(amplitudes.get(globalChunk) ?? 0.0001, c * CHUNK, (c + 1) * CHUNK);
    }
    buffers.push(data);
  }
  return buffers;
}

let frames: Array<() => void> = [];
const flushFrame = () => {
  const queued = frames;
  frames = [];
  queued.forEach((f) => f());
};

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => frames.push(cb));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** getUserMedia가 stream으로 성공하는 상태로 녹음기를 시작한다 */
async function startRecorder(stream: MediaStream) {
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const fake = fakeContext();
  const recorder = new AudioRecorder(fake.ctx);
  const onStarted = vi.fn();
  const onUpdate = vi.fn();
  const onError = vi.fn();
  recorder.startListening(onStarted, onUpdate, onError);
  await vi.waitFor(() => expect(onStarted).toHaveBeenCalled());
  return { recorder, fake, onStarted, onUpdate, onError, getUserMedia };
}

/** 녹음 중인 것처럼 버퍼를 onaudioprocess로 흘려 넣는다 */
function feed(
  recorder: AudioRecorder,
  processor: { onaudioprocess: null | ((e: ProcessEvent) => void) },
  buffers: Float32Array[],
) {
  recorder.startRecording();
  for (const data of buffers) {
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => data } });
  }
}

describe("AudioRecorder.stop 자동 trim", () => {
  // trimStart = max(2, 첫 청크 번호 - 2) / 청크 개수, trimEnd = min(청크 개수 - 2, 마지막 청크 번호 + 2) / 청크 개수
  // 청크는 1024샘플 단위이고 번호는 1부터 센다. 버퍼(8192샘플) 1개는 청크 8개다.
  it("임계값(maxRMS / 8) 이상인 첫·마지막 청크에서 앞뒤 2청크 여유를 둔다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    // 0 기준 청크 4~11(1부터 5~12)만 크다
    const loud = new Map<number, number>();
    for (let c = 4; c <= 11; c++) loud.set(c, 0.5);
    feed(recorder, fake.processor, buffersFromChunkAmplitudes(12, loud));
    const result = recorder.stop();
    expect(result.trimStart).toBeCloseTo(3 / 96, 9);
    expect(result.trimEnd).toBeCloseTo(14 / 96, 9);
    expect(result.samples.length).toBe(12 * BUFFER_LENGTH);
    expect(result.sampleRate).toBe(44100);
    expect(result.levels.length).toBe(96);
  });

  it("소리가 가운데에만 있으면 그 구간 앞뒤 2청크까지를 trim한다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    // 버퍼 10개 = 청크 80개. 1부터 센 청크 30~50(0 기준 29~49)만 크다
    const loud = new Map<number, number>();
    for (let c = 29; c <= 49; c++) loud.set(c, 0.5);
    feed(recorder, fake.processor, buffersFromChunkAmplitudes(10, loud));
    const result = recorder.stop();
    expect(result.levels.length).toBe(80);
    expect(result.trimStart).toBeCloseTo((30 - 2) / 80, 9);
    expect(result.trimEnd).toBeCloseTo((50 + 2) / 80, 9);
  });

  it("임계값보다 작은 청크는 trim 경계를 바꾸지 않는다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    const amps = new Map<number, number>();
    for (let c = 4; c <= 11; c++) amps.set(c, 0.5);
    amps.set(1, 0.005); // 레벨 약 0.095 < 임계값 약 0.119
    feed(recorder, fake.processor, buffersFromChunkAmplitudes(12, amps));
    expect(recorder.stop().trimStart).toBeCloseTo(3 / 96, 9);
  });

  it("임계값을 넘는 청크는 trim 경계를 넓히고 시작은 2청크보다 앞으로 가지 않는다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    const amps = new Map<number, number>();
    for (let c = 4; c <= 11; c++) amps.set(c, 0.5);
    amps.set(1, 0.02); // 레벨 약 0.19 > 임계값 약 0.119, 청크 번호 2
    feed(recorder, fake.processor, buffersFromChunkAmplitudes(12, amps));
    expect(recorder.stop().trimStart).toBeCloseTo(2 / 96, 9);
  });

  it("버퍼 1개(청크 8개)짜리 짧은 녹음도 소리가 가운데 있으면 trim을 계산한다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    // 0 기준 청크 3(1부터 4)만 크다
    feed(recorder, fake.processor, buffersFromChunkAmplitudes(1, new Map([[3, 0.5]])));
    const result = recorder.stop();
    expect(result.trimStart).toBeCloseTo(2 / 8, 9);
    expect(result.trimEnd).toBeCloseTo(6 / 8, 9);
  });

  it("아주 짧은 녹음에서 trimStart >= trimEnd가 되면 0과 1을 돌려준다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    // 청크 8개 중 마지막 청크만 크면 trimStart = 6/8, trimEnd = min(6, 10)/8 = 6/8이다
    feed(recorder, fake.processor, buffersFromChunkAmplitudes(1, new Map([[7, 0.5]])));
    const result = recorder.stop();
    expect(result.trimStart).toBe(0);
    expect(result.trimEnd).toBe(1);
  });

  it("전체가 무음이면 0과 1을 돌려준다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    const silent = Array.from({ length: 10 }, () => new Float32Array(BUFFER_LENGTH));
    feed(recorder, fake.processor, silent);
    const result = recorder.stop();
    expect(result.trimStart).toBe(0);
    expect(result.trimEnd).toBe(1);
  });

  it("녹음된 버퍼가 없으면 0과 1을 돌려준다", async () => {
    const { recorder } = await startRecorder(fakeStream().stream);
    const result = recorder.stop();
    expect(result.samples.length).toBe(0);
    expect(result.trimStart).toBe(0);
    expect(result.trimEnd).toBe(1);
  });

  it("startRecording 전에 들어온 버퍼는 저장하지 않는다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    fake.processor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array(BUFFER_LENGTH) },
    });
    expect(recorder.stop().samples.length).toBe(0);
  });
});

describe("AudioRecorder 녹음 길이 한도", () => {
  // 가짜 AudioContext는 44100Hz다. 이 길이를 넘으면 에디터가 편집을 거부한다.
  const LIMIT = maxEditableSamples(44100);
  // 녹음기가 버퍼를 복사해 저장하므로 같은 배열을 여러 번 넣어도 된다
  const chunk = new Float32Array(BUFFER_LENGTH).fill(0.1);
  const repeat = (count: number) => Array.from({ length: count }, () => chunk);

  it("한도에 닿으면 한도까지만 저장하고 onLimitReached를 한 번 부른다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    const onLimitReached = vi.fn();
    recorder.startRecording(onLimitReached);
    const over = Math.ceil(LIMIT / BUFFER_LENGTH) + 3;
    for (const data of repeat(over)) {
      fake.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => data } });
    }
    expect(onLimitReached).toHaveBeenCalledTimes(1);
    expect(recorder.stop().samples.length).toBe(LIMIT);
  });

  it("recordedSeconds는 쌓인 샘플 수를, maxRecordingSeconds는 한도를 샘플레이트로 나눈 초를 돌려준다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    expect(recorder.recordedSeconds).toBe(0);
    expect(recorder.maxRecordingSeconds).toBeCloseTo(LIMIT / 44100, 6);
    recorder.startRecording();
    for (const data of repeat(5)) {
      fake.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => data } });
    }
    expect(recorder.recordedSeconds).toBeCloseTo((5 * BUFFER_LENGTH) / 44100, 6);
  });

  it("한도 전에는 onLimitReached를 부르지 않는다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    const onLimitReached = vi.fn();
    recorder.startRecording(onLimitReached);
    const under = Math.floor(LIMIT / BUFFER_LENGTH);
    for (const data of repeat(under)) {
      fake.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => data } });
    }
    expect(onLimitReached).not.toHaveBeenCalled();
    expect(recorder.stop().samples.length).toBe(under * BUFFER_LENGTH);
  });
});

describe("AudioRecorder 마이크 오류", () => {
  /** onError로 받은 값을 MicrophoneError로 좁힌다 */
  const received = (onError: ReturnType<typeof vi.fn>): MicrophoneError => {
    expect(onError).toHaveBeenCalledTimes(1);
    const error = onError.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(MicrophoneError);
    return error as MicrophoneError;
  };

  it("getUserMedia가 reject되면 원인 code로 분류한 MicrophoneError를 onError에 한 번 넘기고 원본은 cause에 둔다", async () => {
    const error = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(error) },
    });
    const recorder = new AudioRecorder(fakeContext().ctx);
    const onStarted = vi.fn();
    const onError = vi.fn();
    expect(() => recorder.startListening(onStarted, vi.fn(), onError)).not.toThrow();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const microphoneError = received(onError);
    expect(microphoneError.code).toBe("permission-denied");
    expect(microphoneError.cause).toBe(error);
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("navigator.mediaDevices가 없으면 unsupported로 알린다", async () => {
    vi.stubGlobal("navigator", {});
    const recorder = new AudioRecorder(fakeContext().ctx);
    const onError = vi.fn();
    expect(() => recorder.startListening(vi.fn(), vi.fn(), onError)).not.toThrow();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(received(onError).code).toBe("unsupported");
  });

  it("비보안 컨텍스트이면 getUserMedia를 부르지 않고 insecure-context로 알린다", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const recorder = new AudioRecorder(fakeContext().ctx);
    const onError = vi.fn();
    recorder.startListening(vi.fn(), vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(received(onError).code).toBe("insecure-context");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("Permissions Policy가 마이크를 막으면 getUserMedia를 부르지 않고 policy-blocked로 알린다", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("document", { permissionsPolicy: { allowsFeature: () => false } });
    const recorder = new AudioRecorder(fakeContext().ctx);
    const onError = vi.fn();
    recorder.startListening(vi.fn(), vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(received(onError).code).toBe("policy-blocked");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("getUserMedia가 동기 예외를 던져도 onError로 전달하고 원본은 cause에 둔다", async () => {
    const error = new Error("sync");
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () => {
          throw error;
        },
      },
    });
    const recorder = new AudioRecorder(fakeContext().ctx);
    const onError = vi.fn();
    recorder.startListening(vi.fn(), vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const microphoneError = received(onError);
    expect(microphoneError.code).toBe("unknown");
    expect(microphoneError.cause).toBe(error);
  });
});

describe("AudioRecorder 마이크 끊김(트랙 ended)", () => {
  const chunk = new Float32Array(BUFFER_LENGTH).fill(0.1);
  const feedChunk = (processor: { onaudioprocess: null | ((e: ProcessEvent) => void) }) =>
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => chunk } });

  it("대기 중에 트랙이 끊기면 track-ended를 onError로 한 번 알린다", async () => {
    const { stream, end } = fakeStream();
    const { onError } = await startRecorder(stream);
    end();
    end();
    expect(onError).toHaveBeenCalledTimes(1);
    const error = onError.mock.calls[0]?.[0] as MicrophoneError;
    expect(error).toBeInstanceOf(MicrophoneError);
    expect(error.code).toBe("track-ended");
  });

  it("녹음 중에 끊기면 그때까지의 버퍼는 남기고 이후 무음 버퍼는 쌓지 않는다", async () => {
    const { stream, end } = fakeStream();
    const { recorder, fake, onError } = await startRecorder(stream);
    recorder.startRecording();
    feedChunk(fake.processor);
    end();
    // 끊긴 마이크는 무음 버퍼를 계속 보낸다. 쌓이면 녹음 길이만 늘어난다
    feedChunk(fake.processor);
    feedChunk(fake.processor);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(recorder.recordedSeconds).toBeCloseTo(BUFFER_LENGTH / 44100, 6);
    expect(recorder.stop().samples.length).toBe(BUFFER_LENGTH);
  });

  it("끊긴 뒤에는 onLimitReached를 부르지 않는다", async () => {
    const { stream, end } = fakeStream();
    const { recorder, fake } = await startRecorder(stream);
    const onLimitReached = vi.fn();
    recorder.startRecording(onLimitReached);
    end();
    const over = Math.ceil(maxEditableSamples(44100) / BUFFER_LENGTH) + 1;
    for (let i = 0; i < over; i++) feedChunk(fake.processor);
    expect(onLimitReached).not.toHaveBeenCalled();
  });

  it("스트림을 받은 뒤 노드 연결이 실패하면 이후 ended로 onError를 다시 부르지 않는다", async () => {
    const { stream, end } = fakeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const fake = fakeContext();
    fake.ctx.createScriptProcessor = () => {
      throw new Error("노드 생성 실패");
    };
    const recorder = new AudioRecorder(fake.ctx);
    const onError = vi.fn();
    recorder.startListening(vi.fn(), vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    end();
    // onError는 많아야 한 번이라는 계약이다. 연결 실패 뒤 트랙이 끝나도 두 번째 알림이 없어야 한다
    expect(onError).toHaveBeenCalledTimes(1);
    const error = onError.mock.calls[0]?.[0] as MicrophoneError;
    expect(error.code).toBe("unknown");
  });

  it("dispose 뒤에 ended가 와도 onError를 부르지 않는다", async () => {
    const { stream, end, removeSpy } = fakeStream();
    const { recorder, onError } = await startRecorder(stream);
    recorder.dispose();
    end();
    expect(onError).not.toHaveBeenCalled();
    // 리스너 제거도 확인한다. 이미 제거돼 호출이 없다는 것만으로는 dispose의 책임을 가를 수 없다
    expect(removeSpy).toHaveBeenCalledWith("ended", expect.any(Function));
  });

  it("dispose는 ended 리스너를 addEventListener에 넘긴 것과 같은 함수로 제거한다", async () => {
    const { stream, addSpy, removeSpy } = fakeStream();
    const { recorder } = await startRecorder(stream);
    const added = addSpy.mock.calls.find(([type]) => type === "ended")?.[1];
    expect(added).toBeTypeOf("function");
    recorder.dispose();
    expect(removeSpy).toHaveBeenCalledWith("ended", added);
  });
});

describe("AudioRecorder.dispose", () => {
  it("시작 전 dispose도 예외가 없다", () => {
    expect(() => new AudioRecorder(fakeContext().ctx).dispose()).not.toThrow();
  });

  it("시작 후 dispose하면 노드를 끊고 마이크 트랙을 멈추며 이후 onUpdate가 호출되지 않는다", async () => {
    const { stream, track } = fakeStream();
    const { recorder, fake, onUpdate } = await startRecorder(stream);
    flushFrame();
    const callsBefore = onUpdate.mock.calls.length;
    expect(callsBefore).toBeGreaterThan(0);
    recorder.dispose();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(fake.processor.disconnect).toHaveBeenCalled();
    expect(fake.processor.onaudioprocess).toBeNull();
    flushFrame();
    flushFrame();
    expect(onUpdate.mock.calls.length).toBe(callsBefore);
  });

  it("dispose 뒤에 getUserMedia가 성공해도 onStarted가 호출되지 않고 스트림이 해제된다", async () => {
    const { stream, track } = fakeStream();
    let resolve!: (s: MediaStream) => void;
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: () => new Promise<MediaStream>((r) => (resolve = r)) },
    });
    const recorder = new AudioRecorder(fakeContext().ctx);
    const onStarted = vi.fn();
    const onUpdate = vi.fn();
    recorder.startListening(onStarted, onUpdate, vi.fn());
    recorder.dispose();
    resolve(stream);
    await new Promise((r) => setTimeout(r, 0));
    expect(onStarted).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    // 늦게 도착한 스트림을 그대로 두면 마이크가 계속 켜져 있다
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("dispose 뒤에 getUserMedia가 reject돼도 onError가 호출되지 않는다", async () => {
    let reject!: (e: unknown) => void;
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: () => new Promise<MediaStream>((_, r) => (reject = r)) },
    });
    const recorder = new AudioRecorder(fakeContext().ctx);
    const onError = vi.fn();
    recorder.startListening(vi.fn(), vi.fn(), onError);
    recorder.dispose();
    reject(new Error("late"));
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).not.toHaveBeenCalled();
  });

  it("dispose 뒤에 들어온 오디오 버퍼는 저장하지 않는다", async () => {
    const { recorder, fake } = await startRecorder(fakeStream().stream);
    recorder.startRecording();
    // dispose가 onaudioprocess를 null로 만들기 전 참조를 잡아 둔다
    const handler = fake.processor.onaudioprocess;
    recorder.dispose();
    handler?.({ inputBuffer: { getChannelData: () => new Float32Array(BUFFER_LENGTH) } });
    expect(recorder.stop().samples.length).toBe(0);
  });
});
