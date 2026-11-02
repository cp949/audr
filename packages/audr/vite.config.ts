import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    // 공식 browser floor가 Chrome 75다(docs/adr/0001). JS 문법과 CSS(cssTarget 기본값)를 함께 낮춘다.
    target: "chrome75",
    // 라이브러리 모드: CSS Modules와 SVG를 함께 번들한다.
    // entry.ts는 토큰 CSS를 불러온 뒤 index.ts를 다시 내보낸다(선언 파일에 .css가 새지 않게 분리).
    lib: {
      entry: "src/entry.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "@cp949/audr-core"],
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["tests/setup.ts"],
  },
});
