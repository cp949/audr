# @cp949/audr

저장소: <https://github.com/cp949/audr>

사운드 에디터와 녹음 대화상자를 제공하는 React 컴포넌트 라이브러리다. 소리는 모노 `Float32Array`와 샘플레이트로 다룬다.

이 패키지는 `private: true`이고 발행하지 않는다. 같은 워크스페이스 안의 Vite 앱에서 쓰는 것만 지원한다. 워크스페이스 밖 앱(`file:`, `link:`)과 번들러 없는 Node ESM 직접 import는 지원하지 않는다.

## 사용 준비

앱의 `package.json`에 두 패키지를 워크스페이스 의존성으로 추가한다. `decodeAudioFile` 같은 오디오 helper는 `@cp949/audr-core`에 있다.

```json
{
  "dependencies": {
    "@cp949/audr": "workspace:*",
    "@cp949/audr-core": "workspace:*"
  }
}
```

두 패키지는 빌드 산출물(`dist`)을 내보낸다. 앱을 실행하기 전에 한 번 빌드한다.

```sh
pnpm --filter @cp949/audr... build
```

스타일은 앱 진입점에서 한 번 불러온다.

```ts
import "@cp949/audr/style.css";
```

`react`와 `react-dom` 19가 peer 의존성이다.

## SoundEditor

```tsx
import { SoundEditor } from "@cp949/audr";

<SoundEditor
  soundId={sound.id}
  samples={sound.samples}
  sampleRate={sound.sampleRate}
  name={sound.name}
  onChange={({ samples, sampleRate }) => update({ samples, sampleRate })}
  onCopyToNew={(buffer) => addSound(buffer, sound.name)}
  onRename={(name) => update({ name })}
/>;
```

| prop          | 타입                                | 설명                                                                                                                                                                                                                              |
| ------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `soundId`     | `string \| number`                  | 소리를 가리키는 식별자. 다른 소리로 바꿀 때 함께 바꾼다. 바뀌면 내용이 같아도 다른 소리로 보고 undo 이력, 선택, 편집 실패 알림, 입력 중인 이름, 끌던 선택을 지운다. 복사한 내용은 유지한다. 생략하면 `samples` 내용으로 판단한다. |
| `samples`     | `Float32Array`                      | 모노 샘플. 길이 0도 받는다. 재생기만 무음 1샘플로 대신하고 편집은 길이 0으로 다룬다. 복사할 샘플이 0개면(길이 0 소리 등) Copy, Copy to New는 아무것도 하지 않는다.                                                                |
| `sampleRate`  | `number`                            | 샘플레이트(Hz).                                                                                                                                                                                                                   |
| `name`        | `string`                            | 이름 입력란에 보이는 이름.                                                                                                                                                                                                        |
| `onChange`    | `(buffer: SoundBuffer) => void`     | 편집, undo, redo가 끝날 때마다 새 `samples`와 `sampleRate`로 호출한다. 이 콜백이 던진 예외는 `console.error`로만 남기고 편집은 반영된 채로 둔다.                                                                                  |
| `onCopyToNew` | `(buffer: SoundBuffer) => void`     | Copy to New. 선택 구간(없으면 전체)을 넘긴다.                                                                                                                                                                                     |
| `onRename`    | `(name: string) => void`            | 이름 입력란에서 Enter 또는 blur 했을 때 호출한다.                                                                                                                                                                                 |
| `onError`     | `(error: SoundEditorError) => void` | 편집을 반영하지 못했을 때 호출한다. `error.kind`는 `"apply"`(용량 초과 등으로 반영 실패), `"paste"`, `"effect"`이고 `error.cause`에 원인이 있다. 화면 알림은 `errorNotice`가 따로 보인다.                                         |
| `errorNotice` | `boolean`                           | 편집 실패를 에디터 안에 보이는 기본 알림. 기본값은 `true`. 호스트가 자체 알림을 쓰면 `false`로 끈다. `onError`는 켜고 꺼도 호출한다. 자세한 내용은 아래 "편집 실패 알림".                                                         |
| `locale`      | `"en" \| "ko"`                      | 문구 언어. 기본값은 `"en"`.                                                                                                                                                                                                       |
| `theme`       | `"blue" \| "teal"`                  | 색 테마. 생략하면 보라. 자세한 내용은 "테마".                                                                                                                                                                                     |

호스트는 `onChange`로 받은 `samples`를 그대로 다시 내려 주면 된다.

에디터 맨 아래 줄에 전체 길이, 선택 구간(시작–끝과 길이), 재생 중이면 재생 위치를 소수 둘째 자리 초로 보인다. 예: `Length 1.00 s`, `Selection 0.25–0.75 s (0.50 s)`, `Playing 0.37 s`. 선택은 드래그하는 동안에도 갱신한다. 에디터 폭이 좁으면 항목 단위로 다음 줄로 넘기므로, 재생을 시작할 때 표시줄 높이가 한 줄(1rem) 늘 수 있다. 화면용 정보라 `aria-live`를 달지 않는다.

효과 버튼은 재생 버튼 오른쪽에 9칸 × 2줄로 놓인다. 음소거 버튼은 없다.

효과 적용 범위 표시:

- 전체 길이 옆에 `Effects apply to: whole sound` 또는 `Effects apply to: selection`을 보인다. 한국어는 `효과 적용 범위: 소리 전체`, `효과 적용 범위: 선택 구간`이다.
- 효과(Faster, Slower, Louder, Softer, Fade in, Fade out, Cyborg, Robot, Alien, Echo, Broadcast, Walkie-talkie, Reverse reverb, Scratch, Roller coaster, Stutter, Vibrato, Reverse)는 확정된 선택이 있으면 그 구간에, 없으면 소리 전체에 적용된다. 문구는 이 기준을 따른다.
- Copy와 Copy to New도 선택이 있으면 그 구간을, 없으면 전체를 복사한다. 이 두 버튼에는 문구를 연결하지 않았다.
- Delete는 선택이 있을 때만 켜진다. Paste는 선택이 있으면 그 구간을 교체하고, 없으면 끝에 붙인다.
- 문구는 효과가 실제로 쓰는 선택 값을 따른다. 파형을 끄는 동안 시간 표시줄의 선택 구간에 보이는 임시 범위는 쓰지 않는다.
- 파형을 누르는 순간 그 지점에 길이 0 선택이 잡혀 문구가 선택 구간으로 바뀐다. 0.5초 안에 1% 미만만 움직이고 떼면 선택이 풀려 소리 전체로 돌아간다.
- 누른 채 0.5초 넘게 있다가 움직이지 않고 떼면 길이 0 선택이 남는다. 문구는 선택 구간이고, 효과는 소리 전체가 아닌 그 지점에 적용되어 소리가 거의 바뀌지 않는다. 시간 표시줄의 선택 길이(`0.00 s`)로 구분한다.
- 효과 버튼이 `aria-describedby`로 이 문구를 가리킨다. 버튼의 접근 가능한 이름은 그대로다. 문구가 바뀔 때 낭독하지 않는다.

편집 실패 알림(`errorNotice`):

- 용량 초과·붙이기·효과 실패마다 `kind`에 맞는 문구를 시간 표시줄 아래에 `role="alert"`로 보인다. 원인과 다시 시도할 방법을 함께 적는다.
- 다음 편집, undo, redo가 성공하면 지운다. 다른 소리로 바뀌어도 지운다.
- 닫기 버튼은 없고 포커스를 옮기지 않는다.
- 같은 실패가 다시 나면 알림 요소를 새로 넣어 문구가 같아도 스크린 리더가 다시 읽는다.
- 경고 글자는 `--audr-red-text`를 흰 배경 위에 쓴다.

단축키(Space, Delete, Shift+Delete, Esc, Ctrl/Cmd+Z·Shift+Z·C·V·A)는 마지막으로 누르거나 포커스한 곳이 에디터 안일 때만 동작한다. 에디터 밖을 누르면 Space 스크롤, Ctrl+A, Ctrl+C가 페이지 기본 동작으로 돌아간다. 페이지를 연 직후에는 에디터를 한 번 눌러야 단축키가 동작한다. Caps Lock 상태와 상관없이 동작하고, 라틴 문자가 아닌 자판(러시아어, 한글 IME 등)에서는 물리 키 위치로 판정한다. Ctrl/Cmd+Shift+C·V·A는 브라우저 단축키로 남겨 둔다. Ctrl·Cmd·Alt(AltGr 포함)를 함께 누른 Space·Delete·Backspace·Esc와 Alt(AltGr 포함)를 함께 누른 Ctrl/Cmd 글자 단축키는 처리하지 않고 기본 동작에 맡긴다. Shift+Space는 Space와 같이 재생·정지한다. Space와 Ctrl/Cmd+V는 누르고 있어도 처음 한 번만 동작한다(Space는 기본 동작을 막아 페이지가 스크롤되지 않는다). Ctrl/Cmd+Z·Shift+Z는 누르고 있으면 계속 되돌리고 다시 실행한다.

단축키 도움말:

- 시간 표시줄 오른쪽 끝의 `Shortcuts` 버튼(한국어 `단축키`)으로 목록을 펼치고 접는다. 기본은 접힌 상태다. 버튼은 `aria-expanded`로 상태를 알리고, 펼치면 `aria-controls`가 목록(`dl`)을 가리킨다.
- 목록은 `resolveShortcutCommand`(`useSoundEditor`의 `handleKeyDown`이 사용)가 처리하는 키만 적는다: Space(재생·정지), Delete·Backspace(선택 삭제), Shift+Delete·Shift+Backspace(선택만 남기기), Esc(선택 해제), Ctrl/Cmd+A·Z·Shift+Z·C·V. Ctrl+Y는 처리하지 않으므로 적지 않는다.
- Apple 플랫폼에서는 `⌘`와 `⇧`로 표기한다. `tests/keyCommand.test.ts`가 목록의 모든 키가 그 동작으로 판정되는지, 키와 수정자의 모든 조합 중 명령으로 판정되는 것이 목록에 같은 동작으로 있는지를 대조한다. `tests/SoundEditorShortcutHelp.test.tsx`는 목록의 모든 키를 눌러 훅이 처리하는지 확인한다.
- 모달이나 포털이 아니라 시간 표시줄 안에서 펼친다. 포커스를 가져가지 않고, 편집 실패 알림(`role="alert"`)은 목록 아래에 그대로 나온다.
- 버튼에 포커스가 있을 때 Space는 재생이 아니라 버튼을 누른다. 이 버튼에서 올라오는 Space만 문서까지 전달하지 않는다. 다른 버튼에 포커스가 있을 때의 Space는 기존처럼 재생·정지다.
- `?` 키로 여는 기능과 Esc로 접는 기능은 없다. Esc는 선택 해제에 쓰이므로 목록을 펼친 채 Esc를 누르면 선택만 해제된다.

효과 적용처럼 오래 걸리는 편집이 200ms를 넘게 이어지면 에디터 루트에 `aria-busy="true"`를 두고, 끝날 때까지 편집 버튼(Undo, Redo, Paste, Delete와 효과 버튼 전체)을 비활성한다. Copy, Copy to New는 누를 수 있고 앞 편집이 끝난 뒤 그 결과를 복사한다. 재생은 그대로 쓸 수 있다. 단축키 편집은 막지 않고 차례로 처리한다.

## RecordDialog

```tsx
import { RecordDialog } from "@cp949/audr";

<RecordDialog
  open={recording}
  onCancel={() => setRecording(false)}
  onSave={({ samples, sampleRate }) => {
    addSound({ samples, sampleRate }, "recording1");
    setRecording(false);
  }}
  onError={(error) =>
    setNotice(
      error.kind === "microphone"
        ? error.code === "permission-denied"
          ? "마이크 권한이 거부되었다"
          : "마이크를 사용할 수 없다"
        : "녹음을 저장하지 못했다",
    )
  }
/>;
```

| prop       | 타입                                                 | 설명                                                                                                                           |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `open`     | `boolean`                                            | `false`이면 아무것도 그리지 않고 마이크도 열지 않는다.                                                                         |
| `onCancel` | `() => void`                                         | 닫기를 확정하면 호출한다. 닫는 일은 호스트가 `open`으로 한다. 녹음 중이거나 녹음이 있으면 확인창에서 버리기를 골라야 호출한다. |
| `onSave`   | `(recorded: RecordedSound) => void \| Promise<void>` | Save를 누르면 trim 구간의 `samples`, `sampleRate`, 16비트 PCM `wav`(Blob)로 호출한다.                                          |
| `onError`  | `(error: RecordDialogError) => void`                 | 저장이나 마이크 사용에 실패하면 호출한다. 없으면 대화상자 문구와 `console.error`만 남는다.                                     |
| `locale`   | `"en" \| "ko"`                                       | 문구 언어. 기본값은 `"en"`.                                                                                                    |
| `theme`    | `"blue" \| "teal"`                                   | 색 테마. 생략하면 보라. 자세한 내용은 "테마".                                                                                  |

- `onSave`가 Promise를 돌려주면 끝날 때까지 Save 버튼이 `Loading...`으로 비활성이다.
- `onSave`가 reject하면 버튼은 `Save`로 돌아오고 대화상자는 열려 있다.
- `error.kind`는 `"save"`(`onSave`가 reject)와 `"microphone"`이고 `error.cause`에 원인이 있다.
- `RecordDialogError`는 `kind`로 좁히는 유니언이다. `kind`가 `"microphone"`이면 `error.code`(`MicrophoneErrorCode`)도 있다. `kind`와 `cause`만 읽는 코드는 그대로 동작한다.
- `error.code` 값과 `error.cause`:

| `code`              | 원인                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `permission-denied` | 사용자, 브라우저 설정, OS 개인정보 설정(macOS 시스템 설정 등)이 마이크를 막았다(`NotAllowedError`). |
| `policy-blocked`    | 페이지 보안 정책이 막았다. iframe에 `allow="microphone"`이 없는 경우가 대표적이다.                  |
| `insecure-context`  | HTTPS나 `localhost`가 아니다.                                                                       |
| `unsupported`       | 브라우저가 `getUserMedia`나 `AudioContext`를 제공하지 않는다.                                       |
| `device-not-found`  | 연결된 마이크가 없다(`NotFoundError`).                                                              |
| `device-in-use`     | 다른 앱이 쓰고 있거나 장치를 열지 못했다(`NotReadableError`).                                       |
| `track-ended`       | 마이크를 연 뒤 입력이 끊겼다(분리, 권한 회수).                                                      |
| `aborted`           | 브라우저가 요청을 중단했다(`AbortError`).                                                           |
| `unknown`           | 위에 해당하지 않는다.                                                                               |

- `code` 타입은 `MicrophoneErrorCode`이고 `@cp949/audr`에서 내보낸다.
- `cause`는 브라우저가 던진 원본 예외(`DOMException` 등)다. 원본이 없으면 `cause`는 오류 객체(`MicrophoneError`) 자신이다. 원본이 없는 경우는 `getUserMedia` 호출 전 사전 검사 실패(`insecure-context`, `getUserMedia`가 없는 `unsupported`, `policy-blocked`)와 `track-ended`다.
- `SecurityError`는 `policy-blocked`로 분류한다. 브라우저 설정이 문서의 미디어 사용을 끈 경우도 포함한다. 이 경우는 `allow="microphone"`으로 풀리지 않는다. 구분하려면 `cause.name`을 읽는다.
- 대화상자는 `code`마다 원인과 할 일을 적은 안내를 녹음 단계에 `role="alert"`로 보인다. 문구는 `locale`을 따른다.
- 마이크 실패는 녹음 단계마다 한 번만 알린다. 닫았다 다시 열거나 Re-record로 녹음 단계에 돌아오면 새 실패를 다시 알린다.
- 녹음 중에 마이크가 끊기면(`track-ended`) 그때까지 녹음한 소리를 버리지 않는다.
  - 녹음을 멈추고 재생·trim 단계로 넘어가며 "마이크 연결이 끊겨 녹음을 멈췄습니다" 안내를 보인다. 저장할 수 있다.
  - `onError`는 `code: "track-ended"`로 한 번 호출한다. 호스트가 알림을 띄워도 저장 흐름은 이어진다.
  - 녹음된 샘플이 아직 없으면 녹음 단계에 머물고 끊김 안내를 보인다. 녹음 버튼은 비활성이다.
  - 마이크가 열린 뒤 녹음 버튼을 누르기 전에 끊겨도 같은 안내와 비활성 상태가 된다.
- 끊긴 뒤에는 재시도 버튼이 없다. 대화상자를 닫았다 다시 열거나 Re-record로 새 녹음기를 만든다.
- `onError`가 던지는 예외는 삼키고 `console.error`로 남긴다.
- 대화상자는 Tab 순환을 가두고, 닫으면 열기 전에 포커스가 있던 요소로 돌아간다.
- 녹음 중이거나 녹음이 끝난 재생·trim 단계에서 Esc, 배경 클릭, ✕ 버튼을 누르면 바로 닫지 않고 대화상자 안에 확인창(`role="alertdialog"`)을 띄운다.
  - 녹음 전 단계는 확인 없이 `onCancel`을 호출한다.
  - 돌아가기를 고르면 확인창만 닫는다. 버리기를 고르면 `onCancel`을 호출한다.
  - 확인창이 뜨면 포커스는 돌아가기로 가고, 닫으면 열기 전 요소로 돌아온다.
  - 열기 전 요소가 사라졌으면 대화상자로 돌아온다. 확인창이 떠 있는 동안 자동 정지로 재생·trim 단계가 열렸다면 Play 버튼으로 간다.
  - 확인창이 떠 있는 동안 Esc와 배경 클릭, ✕ 버튼은 확인창만 닫는다.
  - 녹음 중에 확인창이 떠 있어도 녹음은 이어진다.
- 저장 중(Save를 눌러 `onSave`를 부른 뒤 끝나기 전)에는 호스트가 이미 녹음을 받았으므로 Esc, 배경 클릭, ✕ 버튼이 확인창 없이 `onCancel`을 호출한다.
  - Re-record 버튼은 비활성이다.
  - `onSave`가 reject하면 Re-record가 다시 활성이 되고, 닫기는 다시 확인창을 거친다.
  - Save 버튼이 비활성(`Loading…`)이 되어도 포커스는 body로 빠지지 않고 대화상자에 남는다.
  - `onSave`가 reject해 Save가 다시 활성이 되면, 포커스가 아직 대화상자나 body에 있을 때만 Save로 돌아온다. 사용자가 옮긴 포커스는 그대로 둔다.
- 포커스는 단계가 바뀔 때 다음 위치로 간다.
  - 녹음이 멈추면(Stop, 길이 한도 자동 정지) 재생·trim 단계의 Play 버튼으로 간다.
  - Re-record에서 버리기를 고르면 먼저 대화상자에 둔다. 새 녹음기가 마이크를 열어 Record 버튼이 활성이 되면 Record 버튼으로 옮긴다. 그 사이 사용자가 포커스를 옮겼으면 그대로 둔다.
  - 확인창이 떠 있는 동안 자동 정지가 일어나도 포커스는 확인창에 남는다. 확인창을 닫으면 Play 버튼으로 간다.
- trim 핸들(`role="slider"`)은 `aria-valuenow`(퍼센트)와 함께 `aria-valuetext`로 위치를 초로 알린다. 소리가 1초 이상이면 소수 둘째 자리, 1초 미만이면 셋째 자리까지 쓴다. 예: `1.25 seconds`, `0.125 seconds`, 한국어는 `1.25초`. `SoundEditor`의 선택 핸들도 같다.
- 재생·trim 단계에서 Re-record를 누르면 같은 확인창으로 "지금 녹음이 사라진다"를 묻는다. 버리기를 골라야 녹음 단계로 돌아간다.
- 녹음은 에디터가 편집할 수 있는 길이에서 자동으로 멈추고 재생·trim 단계로 넘어간다. 샘플레이트가 22050Hz 이상이면 약 226.8초다(44100Hz에서 9,999,999샘플).
  - 한도에 닿아 자동으로 멈춘 경우에만 재생·trim 단계에 "최대 길이에 도달해 녹음을 멈췄습니다." 안내(영어는 "Recording stopped because it reached the maximum length.")를 보인다.
  - 사용자가 직접 멈추면 안내를 보이지 않는다.
- 녹음 중에만 파형 영역 오른쪽 위에 경과 시간과 최대 길이를 `m:ss`로 보인다. 예: `0:12 / 3:46`.
  - 최대 길이는 녹음 샘플레이트 기준 편집 한도(`maxEditableSamples`)다. 소수점 아래는 버린다.
  - 경과 시간은 쌓인 샘플 수로 계산하고 8192샘플 버퍼가 도착할 때마다 늘어난다. 44100Hz에서 약 0.19초 단위다.
  - 남은 시간이 30초 이하이면 라벨이 진한 주황 글자(`--audr-red-text`)와 굵은 글씨로 바뀐다. 라벨 배경 위 대비는 세 테마 모두 4.5:1 이상이다.
  - 녹음 전과 재생·trim 단계에는 보이지 않는다.
- 재생·trim 단계의 버튼 줄(Re-record와 Save) 가운데에 저장될 구간 길이를 소수 둘째 자리 초로 보인다. 예: `Length 2.10 s`, 한국어는 `저장할 길이 2.10초`.
  - trim 핸들을 끄는 동안 실시간으로 갱신한다. Save가 `onSave`로 넘기는 샘플 수와 같은 값으로 계산한다.
  - 두 요소는 `position: absolute`라 다른 요소의 위치와 모달 높이를 바꾸지 않는다. 확인창이 뜨면 함께 숨는다.
  - 저장할 길이의 가로 위치는 모달 오버레이(뷰포트)의 가운데다. 모달이 뷰포트 가운데에 있어서 버튼 줄 가운데와 같다. 뷰포트가 모달 폭 600px보다 좁으면 어긋난다.
  - 두 표시 모두 화면용 정보라 `aria-live`를 달지 않는다.

## 테마

기본 색은 보라다. `SoundEditor`와 `RecordDialog`의 `theme` prop으로 `"blue"`(파랑)나 `"teal"`을 고른다. 생략하면 보라다.

```tsx
<SoundEditor theme="teal" {...props} />
<RecordDialog theme="teal" {...props} />
```

- 두 컴포넌트에 같은 값을 넘겨야 화면 색이 맞는다. `theme`은 각 컴포넌트 안쪽에만 적용된다.
- `RecordDialog`는 `body`에 포털로 그려져서 호스트의 래퍼 요소 속성이 닿지 않는다. 그래서 prop으로 받는다.
- 호스트의 자기 UI(상단 바 등)도 맞추려면 래퍼에 `data-audr-theme="teal"` 속성을 직접 걸면 된다. CSS 변수 `--audr-looks-secondary` 등을 물려받는다. `<html>`에 걸면 페이지 전체와 두 컴포넌트에 적용된다.
- 아이콘 SVG는 `<img>`로 불러 CSS 변수가 닿지 않는다. 테마가 `filter: hue-rotate()`로 색조를 옮긴다. UI 색 토큰은 같은 변환을 적용한 값이어서 아이콘과 어긋나지 않는다.
- 녹음 정지 아이콘, 녹음 시작 버튼, 녹음창 구간 핸들, 녹음 시간 라벨의 경고색 주황은 테마와 무관하게 유지한다. 경고색은 글자 대비를 위해 더 진한 `--audr-red-text`를 쓴다.
- 새 테마는 `src/styles/tokens.css`에 `[data-audr-theme="이름"]` 블록을 더하고 `src/theme.ts`의 `AudrTheme`에 이름을 추가해 만든다. 보라 토큰에 같은 각도의 `hue-rotate`를 적용한 값과 `--audr-icon-filter-*`를 함께 정한다.

## 파일을 소리로 바꾸기

`decodeAudioFile`은 오디오 파일(브라우저가 디코드하는 형식)을 `SoundBuffer`로 바꾼다.

```tsx
import { decodeAudioFile } from "@cp949/audr-core";

const buffer = await decodeAudioFile(file);
addSound(buffer, file.name.replace(/\.[^.]+$/, ""));
```

- 다채널은 채널 평균으로 모노로 합친다.
- 반환 `sampleRate`는 파일의 원래 레이트가 아니라 공유 `AudioContext`의 레이트다(장치에 따라 44100 또는 48000). `decodeAudioData`가 컨텍스트 레이트로 리샘플한 결과를 주기 때문이다. 에디터는 레이트에 의존하지 않으므로 그대로 재생된다.
- 디코드 실패는 브라우저 오류를 그대로 reject한다. 호스트가 처리한다.
- `decodeAudioFile`은 길이를 제한하지 않는다. 에디터가 편집할 수 있는 한도(`maxEditableSamples(sampleRate)`, 44100Hz에서 9,999,999샘플, 약 226.8초)를 넘는 소리는 모든 편집이 `onError`(`kind: "apply"`)로 실패한다. 호스트가 목록에 넣기 전에 확인한다.

```tsx
import { decodeAudioFile, maxEditableSamples } from "@cp949/audr-core";

const buffer = await decodeAudioFile(file);
if (buffer.samples.length > maxEditableSamples(buffer.sampleRate)) {
  // 목록에 넣지 않고 사용자에게 알린다
  return;
}
addSound(buffer, name);
```

## core의 공개 범위

`@cp949/audr-core`의 안정 API는 `SoundBuffer`, `decodeAudioFile`, `maxEditableSamples`, `createWavBlob`, `encodeWavPcm16`, `resample`, `applyEffect` 계열(`planEffect`, `reverseRange`)이다.

`AudioRecorder`, `AudioBufferPlayer`, `computeChunkedRMS`, `History`, `deleteRange` 같은 나머지 이름은 `@cp949/audr`가 쓰는 내부용이다. 내보내지만 변경될 수 있다.

## 지원 브라우저

공식 하한은 Chrome 75다. 결정 근거와 검증 방법은 [ADR 0001](../../docs/adr/0001-chrome-75-browser-floor.md)에 있다.

Chrome 75를 지원하려는 앱은 번들러 target을 `chrome75`로 둔다. 두 패키지의 `dist`는 이미 Chrome 75 문법으로 빌드되지만, 앱 번들에 함께 들어가는 React와 다른 의존성은 앱의 target이 낮춘다.

```ts
// vite.config.ts
export default defineConfig({
  build: { target: "chrome75" },
});
```

- 두 패키지는 전역 polyfill(`core-js` 등)을 넣지 않는다. Chrome 75에 없는 API는 내부에서 대체한다(예: `Blob.arrayBuffer` 대신 `Response`).
- 앱의 다른 의존성이 Chrome 75에 없는 ES API를 쓰면 앱 진입점 첫 줄에 `import "core-js/stable"`을 둔다. audr 자체에는 필요 없다.
- Chrome 75~85에는 `:focus-visible`이 없다. 에디터 버튼은 마우스로 눌러도 포커스 링이 보인다.
- Safari, Firefox의 하한은 정하지 않았다.

## 알려진 제약

- `SoundEditor`의 부모 요소는 flex 컨테이너(`display: flex; flex-direction: column`)여야 한다. 에디터 루트가 `flex-grow: 1`로 높이를 채운다. 아니면 높이가 내용 높이가 된다.
- 소리를 다른 소리로 바꿀 때는 `soundId`를 바꾼다. `key`로 다시 마운트하면 복사한 내용이 사라진다. `soundId` 없이 `samples`만 바꾸면 내용이 같은 다른 소리에서 이전 소리의 undo 이력이 남는다.
- `soundId`를 바꾸면 전환 전에 시작했거나 기다리던 편집(효과, 붙이기, Copy, Copy to New 등)은 버려진다. 결과는 `onChange`, `onCopyToNew`로 나가지 않는다. 버려지는 것은 전환할 때 앞 편집이 아직 처리 중이었던 경우뿐이다.
- 전환할 때 이전 소리의 효과가 처리 중이면, 그 처리가 끝날 때까지 새 소리의 편집은 뒤에서 기다리고 busy 표시도 남는다. 처리 결과는 버린다.
- `soundId` 없이 `samples` 내용만 바뀐 경우에도 처리 중이던 편집 결과를 버린다. 다만 새 `samples`를 반영하기 전에 끝난 편집은 막지 못해, 그 결과가 바뀐 뒤의 `onChange`로 나갈 수 있다. 다른 소리로 바꿀 때는 `soundId`를 쓴다.
- 복사한 내용은 소리를 바꿔도 유지된다. 샘플레이트가 다르면 붙일 때 현재 소리의 샘플레이트로 맞춘 사본을 붙이고, 복사한 내용은 바꾸지 않는다.
- `samples` 배열을 제자리에서 고쳐 같은 참조로 다시 내려 주면 에디터는 바뀐 내용을 반영하지 않는다. `samples`, `sampleRate`, `soundId`가 모두 그대로면 입력을 반영하는 effect가 다시 실행되지 않는다. `onChange`로 받은 배열도 같다. 내용을 바꾸려면 새 배열을 내려 준다.
- 에디터 루트가 글자 크기 `0.85rem`과 글자색 검정을 직접 정한다. 바꾸려면 호스트 CSS에서 덮어쓴다.
- 녹음은 `ScriptProcessorNode`를 쓴다. 브라우저가 deprecated로 보고하지만 아직 동작한다. AudioWorklet 이전은 하지 않았다.
- 마이크 권한은 HTTPS 또는 `localhost`에서만 얻을 수 있다. 아니면 `code: "insecure-context"`다.
- iframe 안에서 쓰면 호스트 페이지가 `allow="microphone"`을 주어야 한다. 아니면 `code: "policy-blocked"`다. Permissions Policy 검사 API가 없는 브라우저는 검사 없이 `getUserMedia`를 부르고, 거부되면 `permission-denied`로 나온다.
- 마이크 끊김은 오디오 트랙의 `ended` 이벤트로 감지한다. 실제 장치 분리로는 확인하지 않았다(`apps/demo/e2e/microphone.spec.ts`는 이벤트를 직접 낸다).
- 마이크 오류 뒤 재시도 버튼과 장치 선택(`devicechange`)은 없다.
- 다채널 편집, RTL은 지원하지 않는다.
- 터치 입력과 실제 소리 청취는 확인하지 않았다.
