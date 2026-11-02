import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

/** document 이벤트 등록만 기록하는 가짜. 중복 등록과 제거를 정확히 센다. */
function installFakeDocument() {
  const listeners = new Map<string, Set<Listener>>();
  vi.stubGlobal("document", {
    addEventListener: (name: string, fn: Listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)?.add(fn);
    },
    removeEventListener: (name: string, fn: Listener) => {
      listeners.get(name)?.delete(fn);
    },
  });
  return {
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    has: (name: string) => (listeners.get(name)?.size ?? 0) > 0,
    dispatch: (name: string) => [...(listeners.get(name) ?? [])].forEach((fn) => fn()),
  };
}

type FakeContext = {
  state: "suspended" | "running" | "closed";
  resume: ReturnType<typeof vi.fn>;
};

/**
 * 가짜 AudioContext. 처음 상태를 정하고, resume() 호출마다 결과 상태를 resumeStates에서 꺼내 적용한다.
 * 목록이 비면 상태를 바꾸지 않는다(브라우저가 resume을 거부한 것과 같다).
 */
function installFakeAudioContext(
  initial: FakeContext["state"],
  resumeStates: FakeContext["state"][],
) {
  const instances: FakeContext[] = [];
  class FakeAudioContext {
    state = initial;
    sampleRate = 44100;
    resume = vi.fn(async () => {
      const next = resumeStates.shift();
      if (next) this.state = next;
    });
    constructor() {
      instances.push(this as unknown as FakeContext);
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return instances;
}

/** 모듈 단일 상태(싱글턴, 리스너 표시)를 테스트마다 새로 얻는다. */
async function loadModule() {
  vi.resetModules();
  return import("../src/sharedAudioContext");
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("getSharedAudioContext resume 재시도", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("첫 입력의 resume 뒤에도 suspended면 다음 입력에서 다시 resume한다", async () => {
    const doc = installFakeDocument();
    // 첫 resume은 거부되어 suspended 그대로, 두 번째 resume에서 running이 된다
    const ctxs = installFakeAudioContext("suspended", ["suspended", "running"]);
    const { getSharedAudioContext } = await loadModule();
    const ctx = getSharedAudioContext() as unknown as FakeContext;

    doc.dispatch("mousedown");
    await flush();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe("suspended");
    expect(doc.has("keydown")).toBe(true);

    doc.dispatch("keydown");
    await flush();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(ctx.state).toBe("running");
    expect(ctxs.length).toBe(1);
  });

  it("running이 되면 리스너가 모두 제거된다", async () => {
    const doc = installFakeDocument();
    installFakeAudioContext("suspended", ["running"]);
    const { getSharedAudioContext } = await loadModule();
    getSharedAudioContext();
    expect(doc.count()).toBeGreaterThan(0);

    doc.dispatch("mousedown");
    await flush();
    expect(doc.count()).toBe(0);
  });

  it("touchend에서도 resume을 시도한다", async () => {
    const doc = installFakeDocument();
    installFakeAudioContext("suspended", ["running"]);
    const { getSharedAudioContext } = await loadModule();
    const ctx = getSharedAudioContext() as unknown as FakeContext;

    doc.dispatch("touchend");
    await flush();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("이미 running이면 리스너를 등록하지 않는다", async () => {
    const doc = installFakeDocument();
    installFakeAudioContext("running", []);
    const { getSharedAudioContext } = await loadModule();
    getSharedAudioContext();
    expect(doc.count()).toBe(0);
  });

  it("getSharedAudioContext를 여러 번 불러도 리스너가 중복 등록되지 않는다", async () => {
    const doc = installFakeDocument();
    installFakeAudioContext("suspended", []);
    const { getSharedAudioContext } = await loadModule();
    const first = getSharedAudioContext();
    const registered = doc.count();
    expect(registered).toBeGreaterThan(0);

    expect(getSharedAudioContext()).toBe(first);
    getSharedAudioContext();
    expect(doc.count()).toBe(registered);
  });

  it("resume이 reject되어도 처리되지 않은 rejection 없이 리스너를 유지한다", async () => {
    const doc = installFakeDocument();
    const instances = installFakeAudioContext("suspended", []);
    const { getSharedAudioContext } = await loadModule();
    getSharedAudioContext();
    const ctx = instances[0] as FakeContext;
    ctx.resume.mockRejectedValueOnce(new Error("not allowed"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    doc.dispatch("mousedown");
    await flush();
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(doc.count()).toBeGreaterThan(0);
  });
});
