import { describe, expect, it } from "vitest";
import { createSecondsFormat } from "../src/lib/secondsFormat";

describe("createSecondsFormat", () => {
  it("영어는 소수점이 점이고 기본 둘째 자리까지 쓴다", () => {
    const format = createSecondsFormat("en");
    expect(format(1)).toBe("1.00");
    expect(format(0.125, 3)).toBe("0.125");
  });

  it("로케일에 맞는 소수점 기호를 쓴다", () => {
    expect(createSecondsFormat("de")(1.5)).toBe("1,50");
    expect(createSecondsFormat("fr-FR")(0.125, 3)).toBe("0,125");
  });

  it("천 단위 구분 기호를 넣지 않는다", () => {
    expect(createSecondsFormat("en")(1234.5)).toBe("1234.50");
    expect(createSecondsFormat("de")(1234.5)).toBe("1234,50");
  });

  it("잘못된 로케일 태그는 영어 표기로 대체한다", () => {
    expect(createSecondsFormat("not a locale!!")(1.5)).toBe("1.50");
    expect(createSecondsFormat("")(1.5)).toBe("1.50");
  });
});
