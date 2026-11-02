import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 테스트마다 렌더 결과를 정리한다
afterEach(() => {
  cleanup();
});
