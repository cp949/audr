// 마이크를 쓸 수 없는 원인의 분류와 getUserMedia 전 사전 검사.
// 코드를 core에 두는 이유와 끊김 처리 흐름은 docs/design/03-microphone-errors.md를 따른다.
// react-webcam의 getUserMedia 오류 처리를 마이크에 맞게 줄였다.
// camera 전용 코드(constraints-unsatisfied)는 `audio: true`에 제약이 없어 두지 않는다.

/**
 * 마이크를 쓸 수 없는 원인.
 * - permission-denied: 사용자나 브라우저 설정이 마이크를 막았다.
 * - policy-blocked: 페이지 보안 정책이 막았다. iframe에 `allow="microphone"`이 없는 경우가 대표적이다.
 * - insecure-context: HTTPS나 localhost가 아니다.
 * - unsupported: 브라우저가 마이크 입력이나 AudioContext를 제공하지 않는다.
 * - device-not-found: 연결된 마이크가 없다.
 * - device-in-use: 다른 앱이 마이크를 쓰고 있거나 하드웨어를 열지 못했다.
 * - track-ended: 마이크를 연 뒤 입력이 끊겼다(분리, 권한 회수).
 * - aborted: 브라우저가 요청을 중단했다.
 * - unknown: 위에 해당하지 않는다.
 */
export type MicrophoneErrorCode =
  | "permission-denied"
  | "policy-blocked"
  | "insecure-context"
  | "unsupported"
  | "device-not-found"
  | "device-in-use"
  | "track-ended"
  | "aborted"
  | "unknown";

/** 원인 코드를 가진 마이크 오류. 브라우저 예외를 감쌀 때는 원본을 `cause`에 둔다. */
export class MicrophoneError extends Error {
  readonly code: MicrophoneErrorCode;
  /** 감싼 원본 오류. 사전 검사처럼 원본이 없으면 undefined다 */
  readonly cause?: unknown;

  constructor(code: MicrophoneErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "MicrophoneError";
    this.code = code;
    // Error 생성자의 cause 옵션은 Chrome 75에 없어서 직접 대입한다
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * 오류 이름(`DOMException.name`)으로 원인 코드를 정한다. 구형 이름도 같은 코드로 본다.
 * `instanceof`를 쓰지 않는다. 다른 realm(iframe)의 DOMException은 `instanceof Error`가 아닐 수 있다.
 * SecurityError는 문서 단위로 미디어 사용이 꺼진 경우(페이지 정책, 브라우저 설정)라 policy-blocked로 본다.
 * 둘을 가려야 하면 원본의 name을 읽는다. 근거는 docs/design/03-microphone-errors.md의 "코드 집합"이다.
 */
export function classifyMicrophoneError(error: unknown): MicrophoneErrorCode {
  if (error instanceof MicrophoneError) return error.code;
  const name =
    typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "permission-denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "device-not-found";
    case "NotReadableError":
    case "TrackStartError":
      return "device-in-use";
    case "SecurityError":
      return "policy-blocked";
    case "AbortError":
      return "aborted";
    default:
      return "unknown";
  }
}

/**
 * 임의의 값을 MicrophoneError로 정규화한다. 이미 MicrophoneError면 그대로 돌려준다.
 * 분류 결과가 unknown일 때만 `fallbackCode`를 쓴다. 원본은 `cause`에 둔다.
 */
export function toMicrophoneError(
  error: unknown,
  fallbackCode: MicrophoneErrorCode = "unknown",
): MicrophoneError {
  if (error instanceof MicrophoneError) return error;
  const classified = classifyMicrophoneError(error);
  const code = classified === "unknown" ? fallbackCode : classified;
  const message = error instanceof Error ? error.message : String(error);
  return new MicrophoneError(code, message, error);
}

type PolicyApi = { allowsFeature: (feature: string) => boolean };

/** 정책 검사 API가 예외를 던지면 차단으로 단정하지 않고 허용으로 본다 */
function isMicrophoneAllowedByPolicy(policy: PolicyApi): boolean {
  try {
    return policy.allowsFeature("microphone");
  } catch {
    return true;
  }
}

/**
 * getUserMedia를 부르기 전에 실패가 확실한 경우를 MicrophoneError로 던진다.
 * 검사 순서는 보안 컨텍스트, 지원 여부, Permissions Policy다.
 * 비보안 컨텍스트에서는 `navigator.mediaDevices`가 없으므로 보안 컨텍스트를 먼저 봐야 원인이 맞다.
 */
export function assertMicrophoneAvailable(): void {
  // 값을 알 수 없는 환경(undefined)을 비보안으로 단정하지 않으려고 false와 직접 비교한다
  if ((globalThis as { isSecureContext?: boolean }).isSecureContext === false) {
    throw new MicrophoneError(
      "insecure-context",
      "마이크는 보안 컨텍스트(HTTPS 또는 localhost)에서만 쓸 수 있다",
    );
  }
  const mediaDevices =
    typeof navigator === "undefined"
      ? undefined
      : (navigator.mediaDevices as MediaDevices | undefined);
  if (!mediaDevices?.getUserMedia) {
    throw new MicrophoneError(
      "unsupported",
      "이 환경에서는 마이크를 쓸 수 없다 (navigator.mediaDevices.getUserMedia 없음)",
    );
  }
  if (typeof document === "undefined") return;
  const doc = document as Document & { permissionsPolicy?: PolicyApi; featurePolicy?: PolicyApi };
  const policy = doc.permissionsPolicy ?? doc.featurePolicy;
  if (policy?.allowsFeature && !isMicrophoneAllowedByPolicy(policy)) {
    throw new MicrophoneError("policy-blocked", "Permissions Policy가 마이크를 막고 있다");
  }
}
