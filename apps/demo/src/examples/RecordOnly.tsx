import { RecordDialog, type RecordedSound } from "@cp949/audr";
import { useEffect, useRef, useState } from "react";

/**
 * 예제: 녹음 대화상자만 쓴다. 에디터 없이 마이크 녹음 결과를 받는 가장 작은 구성이다.
 *
 * - `onSave`가 trim한 구간의 `samples`, `sampleRate`와 16비트 PCM `wav`(Blob)를 준다.
 * - 대화상자를 닫는 일은 호스트가 한다. `onCancel`과 `onSave`에서 `open`을 끈다.
 * - `onError`의 `error.kind`가 `"microphone"`이면 `error.code`로 원인을 나눌 수 있다.
 */
export function RecordOnlyExample() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ recorded: RecordedSound; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  // 화면을 떠날 때 마지막 URL을 해제한다
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  // 재생과 내려받기에 쓸 URL을 Blob에서 만든다. 새 녹음이 오면 이전 URL을 해제한다.
  const save = (recorded: RecordedSound) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(recorded.wav);
    setResult({ recorded, url: urlRef.current });
    setError(null);
    setOpen(false);
  };

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        녹음하기
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div>
          <p>
            길이 {(result.recorded.samples.length / result.recorded.sampleRate).toFixed(2)}초,{" "}
            {result.recorded.sampleRate}Hz, WAV {result.recorded.wav.size}바이트
          </p>
          <audio controls src={result.url} />
          <p>
            <a href={result.url} download="recording.wav">
              recording.wav 내려받기
            </a>
          </p>
        </div>
      )}
      <RecordDialog
        open={open}
        onCancel={() => setOpen(false)}
        onSave={save}
        onError={(e) =>
          setError(
            e.kind === "microphone" ? `마이크를 쓸 수 없다 (${e.code})` : "녹음을 저장하지 못했다",
          )
        }
      />
    </div>
  );
}
