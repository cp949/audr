// 문자열: 한국어와 영어 단순 객체를 내장하고, 호스트가 `messages`로 문구를 덮어쓴다. react-intl은 쓰지 않는다.

import type { MicrophoneErrorCode } from "@cp949/audr-core";

/**
 * BCP 47 언어 태그(`"ko"`, `"en-US"`, `"de"` 등).
 * 내장 문구는 `en`, `ko`이고, 지역 태그는 언어 부분으로 찾는다. 그 밖의 언어는 영어 문구를 쓴다.
 * 숫자 표기(소수점 기호)는 이 태그를 그대로 따른다. 다른 언어 문구는 `messages`로 넘긴다.
 */
export type Locale = string;

const en = {
  sound: "Sound",
  play: "Play",
  stop: "Stop",
  copy: "Copy",
  paste: "Paste",
  copyToNew: "Copy to New",
  delete: "Delete",
  undo: "Undo",
  redo: "Redo",
  faster: "Faster",
  slower: "Slower",
  echo: "Echo",
  robot: "Robot",
  cyborg: "Cyborg",
  alien: "Alien",
  broadcast: "Broadcast",
  walkie: "Walkie-talkie",
  reverseReverb: "Reverse reverb",
  scratch: "Scratch",
  coaster: "Roller coaster",
  stutter: "Stutter",
  vibrato: "Vibrato",
  louder: "Louder",
  /** Louder가 비활성인 이유. 스크린 리더 설명과 마우스 툴팁에 쓴다 */
  tooLoudHint: "Too loud to make louder",
  softer: "Softer",
  reverse: "Reverse",
  fadeOut: "Fade out",
  fadeIn: "Fade in",
  mute: "Mute",
  selectionStart: "Selection start",
  selectionEnd: "Selection end",
  trimStart: "Trim start",
  trimEnd: "Trim end",
  /** 핸들 위치를 시간으로 읽을 때 쓴다. {seconds}는 초다. 소리가 1초 이상이면 소수 둘째 자리, 1초 미만이면 셋째 자리까지 쓴다 */
  seconds: "{seconds} seconds",
  /**
   * 소리 전체 길이. 파형 아래 오른쪽에는 `timeLengthValue`만 보이고, 보조기기는 `timeLength`를 읽는다.
   * {seconds}, {start}, {end}, {length}는 소수 둘째 자리 초다
   */
  timeLength: "Length {seconds} s",
  timeLengthValue: "{seconds} s",
  /** 선택 구간. 파형 위에는 `timeSelectionValue`만 보이고, 보조기기는 `timeSelection`을 읽는다 */
  timeSelection: "Selection {start}–{end} s ({length} s)",
  timeSelectionValue: "{start}–{end} s ({length} s)",
  timePlaying: "Playing {seconds} s",
  /** 효과 버튼이 적용되는 범위. 확정된 선택이 있으면 선택 구간, 없으면 소리 전체다. 시간 표시줄에 보이고 효과 버튼의 설명으로도 읽힌다 */
  effectScopeWhole: "Effects apply to: whole sound",
  effectScopeSelection: "Effects apply to: selection",
  /** 에디터 맨 아래 줄의 단축키 목록 열기 버튼과 목록 항목 */
  shortcutsToggle: "Shortcuts",
  shortcutActions: {
    playStop: "Play / Stop",
    delete: "Delete selection",
    keepSelection: "Keep only selection",
    clearSelection: "Clear selection",
    selectAll: "Select all",
    undo: "Undo",
    redo: "Redo",
    copy: "Copy",
    paste: "Paste",
  },
  recordTitle: "Record Sound",
  beginRecord: "Begin recording by clicking the button below",
  /** {arrow}는 화살표 이모지로 바뀐다 */
  permission: "{arrow}We need your permission to use your microphone",
  stopRecording: "Stop recording",
  record: "Record",
  /** 마이크를 쓸 수 없는 원인별 안내. 녹음 단계의 안내 자리에 보인다. 할 수 있는 행동을 함께 적는다 */
  microphoneErrors: {
    "permission-denied":
      "Microphone access is blocked. Allow it in your browser's site settings and your computer's privacy settings, then reopen this dialog.",
    "policy-blocked":
      "This page is not allowed to use the microphone. If it is embedded in another page, that page must allow it.",
    "insecure-context": "The microphone only works on a secure page (HTTPS or localhost).",
    unsupported: "This browser cannot record audio.",
    "device-not-found": "No microphone found. Connect one, then reopen this dialog.",
    "device-in-use":
      "The microphone is in use by another app. Close that app, then reopen this dialog.",
    "track-ended":
      "The microphone was disconnected. Check the connection, then reopen this dialog.",
    aborted: "The browser stopped the microphone request. Reopen this dialog to try again.",
    unknown: "Could not start recording",
  } satisfies Record<MicrophoneErrorCode, string>,
  playbackStop: "Stop",
  playbackPlay: "Play",
  loading: "Loading…",
  save: "Save",
  reRecord: "Re-record",
  close: "Close",
  /** 녹음을 버릴 수 있는 동작(닫기, 다시 녹음) 앞에서 묻는 확인창 */
  discardTitle: "Discard this recording?",
  discardOnClose: "The sound you recorded will be lost.",
  discardOnReRecord: "If you record again, the current recording will be lost.",
  discardKeep: "Go back",
  discardConfirm: "Discard",
  /** 녹음이 편집 한도 길이에 닿아 저절로 멈췄을 때 재생 단계에 보인다 */
  recordingLimitReached: "Recording stopped because it reached the maximum length.",
  /** 녹음 중 마이크가 끊겨 저절로 멈췄을 때 재생 단계에 보인다. 그때까지의 녹음은 남아 있다 */
  recordingInterrupted: "Recording stopped because the microphone was disconnected.",
  /** 재생·trim 단계 버튼 줄 가운데. trim 구간대로 저장될 길이다. {seconds}는 소수 둘째 자리 초다 */
  recordSavedLength: "Length {seconds} s",
  /** 편집 실패 알림. 원인과 할 수 있는 행동을 함께 적는다 */
  editErrorApply:
    "Could not apply the edit. The result is too long to save, or converting it failed. Try a shorter selection or a shorter sound.",
  editErrorPaste:
    "Could not paste. The copied sound could not be converted to fit this sound. Try again.",
  editErrorEffect:
    "Could not apply the effect. This browser could not process the sound. Try again.",
};

export type Messages = typeof en;

const ko: Messages = {
  sound: "소리",
  play: "재생",
  stop: "멈추기",
  copy: "복사",
  paste: "붙이기",
  copyToNew: "새로운 소리로 복사",
  delete: "삭제",
  undo: "되돌리기",
  redo: "다시 실행",
  faster: "빠르게",
  slower: "느리게",
  echo: "메아리",
  robot: "로봇",
  cyborg: "기계 인간",
  alien: "외계인",
  broadcast: "방송",
  walkie: "무전기",
  reverseReverb: "거꾸로 울림",
  scratch: "스크래치",
  coaster: "롤러코스터",
  stutter: "따따따",
  vibrato: "떨림",
  louder: "크게",
  tooLoudHint: "소리가 너무 커서 더 키울 수 없음",
  softer: "작게",
  reverse: "뒤집기",
  fadeOut: "점점 작게",
  fadeIn: "점점 크게",
  mute: "음소거",
  selectionStart: "선택 시작",
  selectionEnd: "선택 끝",
  trimStart: "자르기 시작",
  trimEnd: "자르기 끝",
  seconds: "{seconds}초",
  timeLength: "길이 {seconds}초",
  timeLengthValue: "{seconds}초",
  timeSelection: "선택 {start}–{end}초 ({length}초)",
  timeSelectionValue: "{start}–{end}초 ({length}초)",
  timePlaying: "재생 {seconds}초",
  effectScopeWhole: "효과 적용 범위: 소리 전체",
  effectScopeSelection: "효과 적용 범위: 선택 구간",
  shortcutsToggle: "단축키",
  shortcutActions: {
    playStop: "재생 / 멈추기",
    delete: "선택 구간 삭제",
    keepSelection: "선택 구간만 남기기",
    clearSelection: "선택 해제",
    selectAll: "전체 선택",
    undo: "되돌리기",
    redo: "다시 실행",
    copy: "복사",
    paste: "붙이기",
  },
  recordTitle: "소리 녹음하기",
  beginRecord: "아래에 있는 버튼을 눌러서 녹음을 시작하세요",
  permission: "{arrow}마이크를 사용하려면 사용자의 허락이 필요합니다",
  stopRecording: "녹음 멈추기",
  record: "녹음하기",
  microphoneErrors: {
    "permission-denied":
      "마이크 사용이 차단되었습니다. 브라우저 사이트 설정과 컴퓨터의 개인정보 보호 설정에서 마이크를 허용한 뒤 창을 다시 여세요.",
    "policy-blocked":
      "이 페이지는 마이크를 쓸 수 없게 설정되어 있습니다. 다른 페이지 안에 삽입된 경우 그 페이지가 마이크를 허용해야 합니다.",
    "insecure-context": "마이크는 보안 페이지(HTTPS 또는 localhost)에서만 쓸 수 있습니다.",
    unsupported: "이 브라우저에서는 녹음할 수 없습니다.",
    "device-not-found": "마이크를 찾을 수 없습니다. 마이크를 연결한 뒤 창을 다시 여세요.",
    "device-in-use": "다른 앱이 마이크를 쓰고 있습니다. 그 앱을 종료한 뒤 창을 다시 여세요.",
    "track-ended": "마이크 연결이 끊겼습니다. 연결을 확인한 뒤 창을 다시 여세요.",
    aborted: "브라우저가 마이크 요청을 중단했습니다. 창을 다시 열어 보세요.",
    unknown: "녹음을 시작할 수 없음",
  },
  playbackStop: "멈추기",
  playbackPlay: "재생",
  loading: "로딩 중…",
  save: "저장",
  reRecord: "다시 녹음하기",
  close: "닫기",
  discardTitle: "녹음을 버릴까요?",
  discardOnClose: "녹음한 소리가 사라집니다.",
  discardOnReRecord: "다시 녹음하면 지금 녹음이 사라집니다.",
  discardKeep: "돌아가기",
  discardConfirm: "버리기",
  recordingLimitReached: "최대 길이에 도달해 녹음을 멈췄습니다.",
  recordingInterrupted: "마이크 연결이 끊겨 녹음을 멈췄습니다.",
  recordSavedLength: "저장할 길이 {seconds}초",
  editErrorApply:
    "편집을 반영하지 못했습니다. 결과가 너무 길어 저장할 수 없거나 변환에 실패했습니다. 선택 구간이나 소리를 더 짧게 해서 다시 해 보세요.",
  editErrorPaste:
    "붙이지 못했습니다. 복사한 소리를 이 소리에 맞게 바꾸지 못했습니다. 다시 해 보세요.",
  editErrorEffect:
    "효과를 적용하지 못했습니다. 브라우저가 소리를 처리하지 못했습니다. 다시 해 보세요.",
};

const catalogs: Record<string, Messages> = { en, ko };

/**
 * 호스트가 덮어쓸 문구. 넘긴 키만 바꾸고 나머지는 로케일 문구를 쓴다.
 * 중첩 객체(`shortcutActions`, `microphoneErrors`)도 키 단위로 합친다.
 */
export type MessageOverrides = {
  [K in keyof Messages]?: Messages[K] extends string ? string : Partial<Messages[K]>;
};

/** 로케일 태그의 언어 부분("ko-KR" → "ko")으로 내장 문구를 찾는다. 없으면 영어다. */
function findCatalog(locale: Locale): Messages {
  const language = locale.toLowerCase().split(/[-_]/)[0] ?? "";
  // 객체 프로토타입의 이름("constructor" 등)이 로케일로 들어와도 카탈로그로 읽지 않는다
  return Object.prototype.hasOwnProperty.call(catalogs, language) ? catalogs[language]! : en;
}

/**
 * 로케일에 맞는 문자열 객체를 돌려준다. 내장 카탈로그는 바꾸지 않는다.
 * `overrides`가 있으면 그 키만 덮어쓰고, `undefined` 값은 무시한다.
 */
export function getMessages(locale: Locale = "en", overrides?: MessageOverrides): Messages {
  const base = findCatalog(locale);
  if (!overrides) return base;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const original = merged[key];
    merged[key] =
      typeof original === "object" && original !== null && typeof value === "object"
        ? { ...original, ...dropUndefined(value) }
        : value;
  }
  return merged as Messages;
}

function dropUndefined(value: object): object {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
