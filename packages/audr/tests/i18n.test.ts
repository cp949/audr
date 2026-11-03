import { describe, expect, it } from "vitest";
import { getMessages } from "../src/i18n";

const NEW_KEYS = [
  "cyborg",
  "alien",
  "echo",
  "broadcast",
  "walkie",
  "reverseReverb",
  "scratch",
  "coaster",
  "stutter",
  "vibrato",
] as const;

describe("효과 라벨", () => {
  it("새 효과 라벨은 영어와 한국어 지정 문구다", () => {
    const pick = (locale: "en" | "ko") => NEW_KEYS.map((key) => getMessages(locale)[key]);

    expect(pick("en")).toEqual([
      "Cyborg",
      "Alien",
      "Echo",
      "Broadcast",
      "Walkie-talkie",
      "Reverse reverb",
      "Scratch",
      "Roller coaster",
      "Stutter",
      "Vibrato",
    ]);
    expect(pick("ko")).toEqual([
      "기계 인간",
      "외계인",
      "메아리",
      "방송",
      "무전기",
      "거꾸로 울림",
      "스크래치",
      "롤러코스터",
      "따따따",
      "떨림",
    ]);
  });
});

describe("getMessages 로케일 해석", () => {
  it("지역 태그가 붙은 로케일은 언어 부분으로 내장 문구를 찾는다", () => {
    expect(getMessages("ko-KR").play).toBe("재생");
    expect(getMessages("KO_kr").play).toBe("재생");
    expect(getMessages("en-US").play).toBe("Play");
  });

  it("내장 문구가 없는 로케일은 영어로 대체한다", () => {
    expect(getMessages("fr").play).toBe("Play");
    expect(getMessages("").play).toBe("Play");
  });

  it("Object.prototype의 이름과 같은 로케일도 영어로 대체한다", () => {
    expect(getMessages("constructor").play).toBe("Play");
    expect(getMessages("__proto__").play).toBe("Play");
  });
});

describe("getMessages 문구 덮어쓰기", () => {
  it("넘긴 키만 바꾸고 나머지는 로케일 문구를 유지한다", () => {
    const m = getMessages("ko", { play: "재생하기" });
    expect(m.play).toBe("재생하기");
    expect(m.stop).toBe("멈추기");
  });

  it("내장 문구가 없는 로케일에도 호스트 번역을 얹을 수 있다", () => {
    const m = getMessages("fr", { play: "Lire" });
    expect(m.play).toBe("Lire");
    expect(m.stop).toBe("Stop");
  });

  it("중첩 문구는 넘긴 키만 바꾸고 나머지를 유지한다", () => {
    const base = getMessages("en");
    const m = getMessages("en", { microphoneErrors: { unsupported: "No recording" } });
    expect(m.microphoneErrors.unsupported).toBe("No recording");
    expect(m.microphoneErrors["device-not-found"]).toBe(base.microphoneErrors["device-not-found"]);
    expect(m.shortcutActions).toEqual(base.shortcutActions);
  });

  it("undefined 값은 덮어쓰지 않는다", () => {
    expect(getMessages("en", { play: undefined }).play).toBe("Play");
  });

  it("덮어써도 내장 카탈로그는 바뀌지 않는다", () => {
    getMessages("en", { play: "X", microphoneErrors: { unsupported: "X" } });
    const m = getMessages("en");
    expect(m.play).toBe("Play");
    expect(m.microphoneErrors.unsupported).toBe("This browser cannot record audio.");
  });
});
