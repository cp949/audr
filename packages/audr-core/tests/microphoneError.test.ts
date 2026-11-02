// 마이크 오류 분류와 사전 검사(보안 컨텍스트, 지원 여부, Permissions Policy)를 검증한다.
// 환경: vitest node. navigator, document, isSecureContext는 가짜로 대체한다.
// 규칙이 사는 곳: docs/design/03-microphone-errors.md.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertMicrophoneAvailable,
  classifyMicrophoneError,
  MicrophoneError,
  toMicrophoneError,
} from "../src/microphoneError";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** name만 가진 오류. DOMException도 다른 realm(iframe)에서는 instanceof Error가 아닐 수 있다 */
const named = (name: string) => Object.assign(new Error(name), { name });

describe("classifyMicrophoneError", () => {
  // 구형 이름(Chrome 47 이전, 옛 Firefox)은 표준 이름과 같은 코드로 묶는다
  it.each([
    ["NotAllowedError", "permission-denied"],
    ["PermissionDeniedError", "permission-denied"],
    ["NotFoundError", "device-not-found"],
    ["DevicesNotFoundError", "device-not-found"],
    ["NotReadableError", "device-in-use"],
    ["TrackStartError", "device-in-use"],
    ["SecurityError", "policy-blocked"],
    ["AbortError", "aborted"],
    ["OverconstrainedError", "unknown"],
    ["TypeError", "unknown"],
  ])("오류 이름 %s는 %s로 분류한다", (name, code) => {
    expect(classifyMicrophoneError(named(name))).toBe(code);
  });

  it("MicrophoneError는 자기 code를 그대로 돌려준다", () => {
    expect(classifyMicrophoneError(new MicrophoneError("insecure-context", "x"))).toBe(
      "insecure-context",
    );
  });

  it("name이 있는 Error가 아닌 객체도 이름으로 분류한다", () => {
    expect(classifyMicrophoneError({ name: "NotAllowedError" })).toBe("permission-denied");
  });

  it.each([[undefined], [null], ["NotAllowedError"], [42], [{}]])(
    "오류 객체가 아닌 값 %j는 unknown이다",
    (value) => {
      expect(classifyMicrophoneError(value)).toBe("unknown");
    },
  );
});

describe("toMicrophoneError", () => {
  it("MicrophoneError는 그대로 돌려준다", () => {
    const error = new MicrophoneError("track-ended", "x");
    expect(toMicrophoneError(error)).toBe(error);
  });

  it("다른 값은 분류한 code로 감싸고 원인을 cause에 둔다", () => {
    const cause = named("NotReadableError");
    const error = toMicrophoneError(cause);
    expect(error).toBeInstanceOf(MicrophoneError);
    expect(error.code).toBe("device-in-use");
    expect(error.cause).toBe(cause);
  });

  it("fallbackCode를 주면 분류 결과가 unknown일 때만 그 code를 쓴다", () => {
    expect(toMicrophoneError(new Error("x"), "unsupported").code).toBe("unsupported");
    expect(toMicrophoneError(named("NotAllowedError"), "unsupported").code).toBe(
      "permission-denied",
    );
  });

  it("Error가 아닌 값을 감싸도 message가 있다", () => {
    expect(toMicrophoneError(undefined).message).not.toBe("");
  });
});

describe("assertMicrophoneAvailable", () => {
  const goodMediaDevices = { getUserMedia: vi.fn() };

  /** 사전 검사를 모두 통과하는 환경 */
  function stubGoodEnvironment() {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { mediaDevices: goodMediaDevices });
    vi.stubGlobal("document", {});
  }

  const codeOf = (): string | undefined => {
    try {
      assertMicrophoneAvailable();
    } catch (e) {
      expect(e).toBeInstanceOf(MicrophoneError);
      return (e as MicrophoneError).code;
    }
    return undefined;
  };

  it("모든 검사를 통과하면 던지지 않는다", () => {
    stubGoodEnvironment();
    expect(() => assertMicrophoneAvailable()).not.toThrow();
  });

  it("보안 컨텍스트가 아니면 insecure-context다. mediaDevices가 없어도 이 코드가 먼저다", () => {
    stubGoodEnvironment();
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("navigator", {});
    expect(codeOf()).toBe("insecure-context");
  });

  it("isSecureContext를 알 수 없는 환경(undefined)은 비보안으로 단정하지 않는다", () => {
    stubGoodEnvironment();
    vi.stubGlobal("isSecureContext", undefined);
    expect(codeOf()).toBeUndefined();
  });

  it("navigator.mediaDevices가 없으면 unsupported다", () => {
    stubGoodEnvironment();
    vi.stubGlobal("navigator", {});
    expect(codeOf()).toBe("unsupported");
  });

  it("getUserMedia가 없으면 unsupported다", () => {
    stubGoodEnvironment();
    vi.stubGlobal("navigator", { mediaDevices: {} });
    expect(codeOf()).toBe("unsupported");
  });

  it("permissionsPolicy가 microphone을 막으면 policy-blocked다", () => {
    stubGoodEnvironment();
    const allowsFeature = vi.fn(() => false);
    vi.stubGlobal("document", { permissionsPolicy: { allowsFeature } });
    expect(codeOf()).toBe("policy-blocked");
    expect(allowsFeature).toHaveBeenCalledWith("microphone");
  });

  it("permissionsPolicy가 없으면 옛 featurePolicy를 쓴다", () => {
    stubGoodEnvironment();
    vi.stubGlobal("document", { featurePolicy: { allowsFeature: () => false } });
    expect(codeOf()).toBe("policy-blocked");
  });

  it("정책 검사 API가 없거나 microphone을 허용하면 통과한다", () => {
    stubGoodEnvironment();
    vi.stubGlobal("document", { permissionsPolicy: { allowsFeature: () => true } });
    expect(codeOf()).toBeUndefined();
    vi.stubGlobal("document", {});
    expect(codeOf()).toBeUndefined();
  });

  it("정책 검사 API가 예외를 던지면 차단으로 단정하지 않고 허용으로 본다", () => {
    stubGoodEnvironment();
    vi.stubGlobal("document", {
      permissionsPolicy: {
        allowsFeature: () => {
          throw new Error("검사 실패");
        },
      },
    });
    expect(codeOf()).toBeUndefined();
  });
});
