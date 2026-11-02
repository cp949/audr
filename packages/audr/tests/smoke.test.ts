import { describe, expect, it } from "vitest";
import * as ui from "../src/index";

describe("@cp949/audr", () => {
  it("패키지가 로드된다", () => {
    expect(ui).toBeDefined();
  });
});
