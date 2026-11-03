import { RecordDialog, SoundEditor, type AudrTheme, type MessageOverrides } from "@cp949/audr";
import { useState } from "react";
import { createSine } from "./sampleSound";

/** 고를 수 있는 테마. 빈 값은 기본 청록이다. */
const THEMES: { value: "" | AudrTheme; label: string }[] = [
  { value: "", label: "청록(기본)" },
  { value: "blue", label: "파랑" },
  { value: "purple", label: "보라" },
];

/**
 * 독일어는 내장 문구가 없다. `locale`로 숫자 표기(소수점 쉼표)를 맞추고,
 * `messages`로 바꿀 문구만 넘긴다. 적지 않은 키는 영어를 쓴다.
 */
const MESSAGES_DE: MessageOverrides = {
  sound: "Klang",
  play: "Abspielen",
  stop: "Stopp",
  copy: "Kopieren",
  paste: "Einfügen",
  timeLength: "Dauer {seconds} s",
  recordTitle: "Klang aufnehmen",
};

/** 영어와 한국어는 `locale`만 넘기면 된다. */
const LANGUAGES: { locale: string; label: string; messages?: MessageOverrides }[] = [
  { locale: "en", label: "English" },
  { locale: "ko", label: "한국어" },
  { locale: "de", label: "Deutsch", messages: MESSAGES_DE },
];

/**
 * 예제: 테마와 언어를 호스트가 고른다.
 *
 * - `theme`는 `SoundEditor`와 `RecordDialog`에 같은 값을 넘긴다. 각 컴포넌트 안쪽에만 적용된다.
 * - `RecordDialog`는 `body`에 포털로 그려져서 호스트의 래퍼 속성이 닿지 않는다. 그래서 prop으로 받는다.
 * - 호스트 자신의 UI 색도 맞추려면 래퍼에 `data-audr-theme`를 직접 건다.
 * - `locale`은 문구와 숫자 표기를 정한다. 내장 문구는 `en`, `ko`뿐이다.
 */
export function ThemeAndLocaleExample() {
  const [sound, setSound] = useState(() => ({ name: "Sine 440Hz", ...createSine() }));
  const [themeValue, setThemeValue] = useState<"" | AudrTheme>("");
  const [language, setLanguage] = useState(LANGUAGES[1]);
  const [recording, setRecording] = useState(false);
  // 빈 값은 기본 청록이므로 prop을 생략한다
  const theme = themeValue || undefined;

  return (
    <div data-audr-theme={theme}>
      <p style={{ color: "var(--audr-accent)" }}>
        이 줄은 호스트 UI다. 래퍼의 `data-audr-theme`를 따라 색이 바뀐다.
      </p>
      <label>
        테마{" "}
        <select
          value={themeValue}
          onChange={(event) => setThemeValue(event.target.value as "" | AudrTheme)}
        >
          {THEMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>{" "}
      <label>
        언어{" "}
        <select
          value={language.locale}
          onChange={(event) =>
            setLanguage(LANGUAGES.find((l) => l.locale === event.target.value) ?? LANGUAGES[0])
          }
        >
          {LANGUAGES.map((l) => (
            <option key={l.locale} value={l.locale}>
              {l.label}
            </option>
          ))}
        </select>
      </label>{" "}
      <button type="button" onClick={() => setRecording(true)}>
        녹음 대화상자 열기
      </button>
      <div style={{ display: "flex", flexDirection: "column", height: 600, maxWidth: 800 }}>
        <SoundEditor
          samples={sound.samples}
          sampleRate={sound.sampleRate}
          name={sound.name}
          theme={theme}
          locale={language.locale}
          messages={language.messages}
          onChange={({ samples, sampleRate }) =>
            setSound((prev) => ({ ...prev, samples, sampleRate }))
          }
          // 이 예제는 소리가 하나라 복사본을 따로 두지 않는다
          onCopyToNew={() => {}}
          onRename={(name) => setSound((prev) => ({ ...prev, name }))}
        />
      </div>
      <RecordDialog
        open={recording}
        theme={theme}
        locale={language.locale}
        messages={language.messages}
        onCancel={() => setRecording(false)}
        onSave={() => setRecording(false)}
      />
    </div>
  );
}
