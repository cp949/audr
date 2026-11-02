import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // 사용처 계약 재현: Chrome 75를 지원하는 앱은 번들러 target을 chrome75로 둔다(docs/adr/0001).
  // vite dev 서버는 이 값을 적용하지 않는다. floor 검증은 build + preview 산출물로 한다.
  build: { target: "chrome75" },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["tests/setup.ts"],
  },
});
