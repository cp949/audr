import type { MessageOverrides } from "@cp949/audr";

/**
 * 독일어 문구 일부. 라이브러리에 내장되지 않은 언어를 `messages`로 붙이는 예다.
 * 적지 않은 키는 영어 문구를 쓴다.
 */
export const MESSAGES_DE: MessageOverrides = {
  sound: "Klang",
  play: "Abspielen",
  stop: "Stopp",
  copy: "Kopieren",
  paste: "Einfügen",
  copyToNew: "In neuen Klang kopieren",
  delete: "Löschen",
  undo: "Rückgängig",
  redo: "Wiederholen",
  faster: "Schneller",
  slower: "Langsamer",
  louder: "Lauter",
  softer: "Leiser",
  reverse: "Rückwärts",
  echo: "Echo",
  robot: "Roboter",
  timeLength: "Dauer {seconds} s",
  timeSelection: "Auswahl {start}–{end} s ({length} s)",
  timePlaying: "Wiedergabe {seconds} s",
  recordTitle: "Klang aufnehmen",
  record: "Aufnehmen",
  stopRecording: "Aufnahme stoppen",
  recordSavedLength: "Dauer {seconds} s",
};
