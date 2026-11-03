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
