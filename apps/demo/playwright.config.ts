import { defineConfig } from "@playwright/test";

// e2e 전용 포트. 개발 서버(5173)와 겹치지 않게 고정하고 --strictPort로 충돌 시 실패시킨다.
const PORT = 5199;

// AUDR_CHROME83=1이면 Chrome 83 floor 검증으로 돈다(pnpm test:e2e:chrome83, docker/chrome83 컨테이너 안).
// - 공식 하한은 Chrome 75다(docs/adr/0001). Playwright가 CDP Browser.setDownloadBehavior(Chrome 82+)를
//   무조건 호출해 75~81을 구동할 수 없어서 83으로 대신한다.
// - vite dev 서버는 build.target을 적용하지 않는다. 그래서 build 산출물을 vite preview로 서빙한다.
// - effects.spec의 코어 직접 호출 테스트는 dev 서버의 /@fs 경로에 기대므로 뺀다.
const chrome83 = process.env.AUDR_CHROME83 === "1";

const mediaArgs = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    permissions: ["microphone"],
    launchOptions: { args: mediaArgs },
  },
  projects: chrome83
    ? [
        {
          name: "chrome83",
          testMatch: ["effects.spec.ts", "import.spec.ts"],
          grep: /UI 경유|파일 가져오기/,
          use: {
            browserName: "chromium",
            launchOptions: {
              executablePath: "/usr/bin/chromium",
              // 컨테이너 안이라 Chrome sandbox가 동작하지 않는다
              args: [...mediaArgs, "--no-sandbox"],
            },
          },
        },
      ]
    : [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    // chrome83은 호스트에서 미리 빌드한 dist를 서빙만 한다(test:e2e:chrome83이 빌드한다)
    command: chrome83
      ? `pnpm exec vite preview --port ${PORT} --strictPort`
      : `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
