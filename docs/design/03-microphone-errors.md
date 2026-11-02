# 03. 마이크 오류 분류와 녹음 중 끊김

녹음 대화상자가 마이크 실패를 원인별로 나누어 호스트와 화면에 알리는 구조와, 녹음 중 마이크가 끊겼을 때의 처리 흐름을 적는다.

- 사용자에게 보이는 `onError` 계약, `code` 목록, 알려진 제약은 `packages/audr/README.md`의 "RecordDialog"와 "알려진 제약"이 소유한다. 여기서는 반복하지 않는다.
- 분류와 사전 검사는 `packages/audr-core/src/microphoneError.ts`, 녹음기는 `packages/audr-core/src/audioRecorder.ts`에 있다.
- 대화상자 쪽 흐름은 `packages/audr/src/hooks/useRecordingStep.ts`, `useRecordDialog.ts`에 있다.

## 분류를 core에 둔다

- 오류 이름(`NotAllowedError` 등)을 코드로 바꾸는 `classifyMicrophoneError`와 `MicrophoneError`는 `@cp949/audr-core`에 있다.
- `AudioRecorder`가 `getUserMedia` 실패를 직접 보기 때문이다. 이름 매핑을 UI 훅에 두면 `AudioRecorder`를 직접 쓰는 호스트가 같은 매핑을 다시 써야 한다.
- `AudioRecorder`는 어떤 실패든 `MicrophoneError`로 감싸 `onError`에 넘긴다. UI는 이름 문자열을 보지 않고 `code`만 본다.
- 원본 예외는 `MicrophoneError.cause`에 둔다. `RecordDialogError.cause`는 이 원본을 그대로 넘긴다. 이전에 `cause`로 받던 값과 같은 값이라 호스트가 `cause.name`을 읽는 코드가 그대로 동작한다.
- 분류는 `instanceof`가 아니라 `name`을 읽는다. 다른 realm(iframe)의 `DOMException`은 `instanceof Error`가 거짓일 수 있다.

## 코드 집합

react-webcam의 `WebcamErrorCode`에서 마이크에 맞게 줄였다.

- 뺀 것: `constraints-unsatisfied`. `getUserMedia({ audio: true })`에는 제약이 없어 `OverconstrainedError`가 나올 수 없다. 나오면 `unknown`이다.
- 합친 것: `security-error`는 `policy-blocked`로 보낸다.
  - `SecurityError`는 사용자의 권한 선택이 아니라 문서 단위로 미디어 사용이 꺼진 경우다. 페이지 정책과 브라우저 설정이 모두 해당한다.
  - 사용자에게 할 말("이 페이지는 마이크를 쓸 수 없게 설정되어 있다")이 Permissions Policy 차단과 같다.
  - `allow="microphone"`으로 풀리지 않는 `SecurityError`도 있다. 이 경우를 구분해야 하는 호스트는 `cause.name`을 읽는다.
  - 이 대응은 브라우저별 실측이 아니라 오류 이름의 의미에 기댄 판단이다.
- 이름 바꾼 것: `unsupported-browser`는 `unsupported`다. `AudioContext`를 만들 수 없는 경우도 같은 코드로 둔다. 사용자에게 할 말이 같다("이 브라우저에서는 녹음할 수 없다"). 원인 구분이 필요하면 `cause`를 본다.

## 사전 검사

`AudioRecorder.startListening`은 `getUserMedia` 호출 전에 `assertMicrophoneAvailable`을 부른다. 순서는 다음과 같다.

1. 보안 컨텍스트: `isSecureContext === false`이면 `insecure-context`.
2. 지원 여부: `navigator.mediaDevices.getUserMedia`가 없으면 `unsupported`.
3. Permissions Policy: `document.permissionsPolicy ?? document.featurePolicy`의 `allowsFeature("microphone")`이 거짓이면 `policy-blocked`.

이유:

- 보안 컨텍스트를 먼저 본다. 비보안 컨텍스트에서는 `navigator.mediaDevices` 자체가 없어서 지원 여부를 먼저 보면 원인이 `unsupported`로 잘못 나온다.
- `isSecureContext`가 `undefined`인 환경(jsdom 등)은 비보안으로 단정하지 않는다. `=== false`로만 판정한다.
- 정책 검사 API가 없거나 예외를 던지면 허용으로 본다. 차단으로 단정하면 실제로는 쓸 수 있는 마이크를 막는다. 실제로 막혔다면 `getUserMedia`가 거부하고 `permission-denied`로 나온다.
- 사전 검사는 동기로 던지고 기존 `try`가 받는다. 다른 실패와 같은 경로(`onError` 한 번, dispose 뒤 호출 금지)를 탄다.

## 녹음 중 끊김

`AudioRecorder`는 스트림을 받으면 오디오 트랙마다 `ended` 리스너를 건다. 트랙이 끝나면 다음을 한다.

1. `recording`을 끄고 `onLimitReached`를 비운다.
2. `track-ended`인 `MicrophoneError`로 `onError`를 한 번 부른다.

`recording`을 끄는 이유:

- 트랙이 끝나도 `ScriptProcessorNode`는 무음 버퍼를 계속 보낸다. 끊긴 뒤 녹음이 무음으로 늘어나 길이 상한까지 간다.
- Chromium 실측: `track.stop()`으로 트랙이 `ended` 상태가 된 뒤에도 `onaudioprocess`가 계속 불렸고 버퍼는 모두 무음이었다.
- 실제 장치 분리는 만들지 못해 확인하지 않았다.
- `stop()`은 그때까지 쌓은 버퍼를 그대로 돌려준다.

리스너 수명:

- 리스너는 노드 연결을 마친 뒤에 건다. 연결 중 예외는 이미 `onError`로 가므로, 먼저 걸면 나중의 `ended`가 `onError`를 한 번 더 부른다.
- `dispose`는 `addEventListener`에 넘긴 같은 함수로 리스너를 제거한다.
- `reported` 플래그가 한 번만 알리게 하고 `disposed`이면 부르지 않는다.

### 이미 녹음한 소리는 살린다

녹음 중에 끊기면 오류로 버리지 않고 멈춘 것으로 처리해 재생·trim 단계로 넘긴다.

- 이미 녹음한 소리를 잃는 쪽이 사용자에게 더 놀랍다. 편집 한도 길이에 닿아 저절로 멈추는 기존 흐름(`limit`)과 같은 모양이라 새 개념이 적다.
- 호스트에는 `onError`(`kind: "microphone"`, `code: "track-ended"`)로도 알린다. 대화상자 안에서는 안내 문구(`recordingInterrupted`)가 재생 단계에 보인다.

흐름:

1. `useRecordingStep`의 `onError` 처리기가 `track-ended`이고 녹음 중이면(`recordingRef`) `recorder.stop()`의 결과를 `partial`로 만든다.
2. `useRecordDialog.onMicrophoneError(error, partial)`가 호스트에 알린다(녹음 단계마다 한 번).
3. `partial`이 있으면 `stopRecording(partial, "microphone-lost")`로 재생·trim 단계로 넘긴다. `AutoStopReason`은 `limit`과 `microphone-lost`다.
4. `partial`에 샘플이 없으면 단계를 넘기지 않고 녹음 중 상태(`recording`)만 푼다. 이 상태가 남으면 닫을 때 버릴 것이 없는데 확인창이 뜬다.

녹음 단계에 머무는 경우(샘플 없음, 녹음 전)에는 `RecordingStep`이 원인별 안내를 파형 대신 보이고 녹음 버튼을 비활성한다. 파형을 숨기는 이유는 녹음 중에 끊겨 샘플이 없을 때 오래된 파형이 안내를 가리기 때문이다.

## 알림은 녹음 단계마다 한 번

- `microphoneReportedRef`가 녹음 단계 하나에서 마이크 실패를 한 번만 호스트에 알린다.
- StrictMode의 effect 이중 실행에서 앞 녹음기는 `dispose`되어 알리지 않는다. 플래그는 녹음기 밖에서 한 번 더 막는 장치다.
- Re-record(`back`)가 플래그를 푼다. 끊김 뒤 새 녹음기가 마이크를 다시 열지 못하면 호스트가 그 원인(예: `device-not-found`)을 받아야 하기 때문이다.
- 녹음 단계에서 마이크 실패가 나면 녹음 버튼이 비활성이라 재생 단계로 갈 수 없다. 그래서 같은 실패가 Re-record를 거쳐 되풀이 알려지지 않는다.
