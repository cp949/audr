import { describe, expect, it } from "vitest";
import * as core from "../src/index";

describe("@cp949/audr-core", () => {
  it("패키지가 로드된다", () => {
    expect(core).toBeDefined();
  });
});
