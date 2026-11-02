import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 페이지에서 코어 소스를 vite 개발 서버로 직접 불러온다 (/@fs 접두사 + 절대경로)
const CORE_URL = `/@fs${path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/audr-core/src/index.ts",
)}`;

type EffectStats = {
  length: number;
  peak: number;
  rms: number;
  trimStart: number;
  trimEnd: number;
};

/** 440Hz 진폭 0.5 사인파 1초(44100Hz)에 효과를 적용하고 길이·크기를 돌려준다. */
async function runCoreEffect(
  page: Page,
  name: string,
  trimStart: number,
  trimEnd: number,
): Promise<EffectStats> {
  return page.evaluate(
    async ({ coreUrl, name, trimStart, trimEnd }) => {
      const core = await import(/* @vite-ignore */ coreUrl);
      const rate = 44100;
      const buffer = new AudioBuffer({ length: rate, sampleRate: rate, numberOfChannels: 1 });
      const input = buffer.getChannelData(0);
      for (let i = 0; i < rate; i++) input[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate);
      const result = await core.applyEffect(buffer, name, trimStart, trimEnd);
      const out: Float32Array = result.buffer.getChannelData(0);
      let peak = 0;
      let sum = 0;
      for (const v of out) {
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
      }
      return {
        length: result.buffer.length,
        peak,
        rms: Math.sqrt(sum / out.length),
        trimStart: result.trimStart,
        trimEnd: result.trimEnd,
      };
    },
    { coreUrl: CORE_URL, name, trimStart, trimEnd },
  );
}

/** 입력 사인파의 rms (진폭 0.5 → 0.5/√2) */
const INPUT_RMS = 0.5 / Math.SQRT2;

test.describe("applyEffect 실제 렌더링 (코어 직접 호출)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  const cases: [string, number][] = [
    ["faster", 35002],
    ["slower", 55562],
    ["echo", 77175],
    ["higher", 44100],
    ["lower", 44100],
    ["fade in", 44100],
    ["fade out", 44100],
    ["reverse", 44100],
    ["robot", 44100],
  ];
  for (const [name, expected] of cases) {
    test(`${name}: 전체 구간 적용 후 샘플 수가 ${expected}이고 무음이 아니다`, async ({ page }) => {
      const stats = await runCoreEffect(page, name, 0, 1);
      expect(stats.length).toBe(expected);
      expect(stats.peak).toBeGreaterThan(0.05);
      expect(stats.rms).toBeGreaterThan(0.02);
    });
  }

  test("mute: 구간 (0.25, 0.75)만 무음이고 양 끝은 그대로다", async ({ page }) => {
    const result = await page.evaluate(
      async ({ coreUrl }) => {
        const core = await import(/* @vite-ignore */ coreUrl);
        const rate = 44100;
        const buffer = new AudioBuffer({ length: rate, sampleRate: rate, numberOfChannels: 1 });
        const input = buffer.getChannelData(0);
        for (let i = 0; i < rate; i++) input[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate);
        const out: Float32Array = (
          await core.applyEffect(buffer, "mute", 0.25, 0.75)
        ).buffer.getChannelData(0);
        const peakOf = (from: number, to: number) => {
          let peak = 0;
          for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(out[i] as number));
          return peak;
        };
        return {
          length: out.length,
          head: peakOf(0, 8000),
          middle: peakOf(12000, 32000),
          tail: peakOf(36000, 44100),
        };
      },
      { coreUrl: CORE_URL },
    );
    expect(result.length).toBe(44100);
    expect(result.head).toBeGreaterThan(0.4);
    expect(result.middle).toBeLessThan(0.001);
    expect(result.tail).toBeGreaterThan(0.4);
  });

  test("higher/lower: rms 비가 1.25와 0.75에 가깝다", async ({ page }) => {
    const higher = await runCoreEffect(page, "higher", 0, 1);
    const lower = await runCoreEffect(page, "lower", 0, 1);
    expect(higher.rms / INPUT_RMS).toBeCloseTo(1.25, 1);
    expect(lower.rms / INPUT_RMS).toBeCloseTo(0.75, 1);
  });

  test("reverse: out[i]가 in[n-1-i]와 같다", async ({ page }) => {
    const maxError = await page.evaluate(
      async ({ coreUrl }) => {
        const core = await import(/* @vite-ignore */ coreUrl);
        const rate = 44100;
        const buffer = new AudioBuffer({ length: rate, sampleRate: rate, numberOfChannels: 1 });
        const input = buffer.getChannelData(0);
        // 비대칭 신호(램프 + 사인)라야 뒤집힌 방향을 구분할 수 있다
        for (let i = 0; i < rate; i++) input[i] = 0.5 * (i / rate) * Math.sin(i / 20);
        const out: Float32Array = (
          await core.applyEffect(buffer, "reverse", 0, 1)
        ).buffer.getChannelData(0);
        let worst = 0;
        for (let i = 0; i < rate; i++) {
          worst = Math.max(worst, Math.abs((out[i] as number) - (input[rate - 1 - i] as number)));
        }
        return worst;
      },
      { coreUrl: CORE_URL },
    );
    expect(maxError).toBeLessThan(1e-4);
  });

  test("fade in/out: 시작·끝 크기가 0에 가깝고 반대쪽 끝은 유지된다", async ({ page }) => {
    const measure = (name: string) =>
      page.evaluate(
        async ({ coreUrl, name }) => {
          const core = await import(/* @vite-ignore */ coreUrl);
          const rate = 44100;
          const buffer = new AudioBuffer({ length: rate, sampleRate: rate, numberOfChannels: 1 });
          const input = buffer.getChannelData(0);
          for (let i = 0; i < rate; i++) input[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate);
          const out: Float32Array = (
            await core.applyEffect(buffer, name, 0, 1)
          ).buffer.getChannelData(0);
          const peakOf = (from: number, to: number) => {
            let peak = 0;
            for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(out[i] as number));
            return peak;
          };
          return { head: peakOf(0, 400), tail: peakOf(out.length - 400, out.length) };
        },
        { coreUrl: CORE_URL, name },
      );
    const fadeIn = await measure("fade in");
    const fadeOut = await measure("fade out");
    expect(fadeIn.head).toBeLessThan(0.05);
    expect(fadeIn.tail).toBeGreaterThan(0.4);
    expect(fadeOut.head).toBeGreaterThan(0.4);
    expect(fadeOut.tail).toBeLessThan(0.05);
  });
});

/** 선택된 소리 항목(데모 목록)의 속성 */
function activeItem(page: Page): Locator {
  return page.locator('.sound-item[aria-current="true"]');
}
async function samplesOf(page: Page): Promise<number> {
  return Number(await activeItem(page).getAttribute("data-samples"));
}
/** 파형 컨테이너의 [from, to] 비율 구간을 마우스로 끌어 선택한다 */
async function dragSelect(page: Page, from: number, to: number) {
  const box = await page.locator('[class*="waveformContainer"]').first().boundingBox();
  if (!box) throw new Error("파형 컨테이너를 찾지 못했다");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * from, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((from + to) / 2), y, { steps: 5 });
  await page.mouse.move(box.x + box.width * to, y, { steps: 5 });
  await page.mouse.up();
}
const editorButton = (page: Page, title: string) =>
  page.locator('[class*="editorContainer"]').getByRole("button", { name: title, exact: true });

test.describe("UI 경유 (데모 화면)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(activeItem(page)).toHaveAttribute("data-samples", "44100");
  });

  // [버튼, 기대 샘플 수, 기대 peak 범위]. 입력은 진폭 0.5 사인파다.
  // 길이가 그대로인 효과는 샘플 수만으로는 버튼이 동작했는지 알 수 없어 Undo 활성과 peak로 확인한다.
  const uiCases: [string, number, [number, number]][] = [
    ["Faster", 35002, [0.05, Infinity]],
    ["Slower", 55562, [0.05, Infinity]],
    ["Louder", 44100, [0.6, 0.65]], // 0.5 × 1.25
    ["Softer", 44100, [0.35, 0.4]], // 0.5 × 0.75
    ["Mute", 44100, [0, 0.001]],
    ["Fade in", 44100, [0.05, Infinity]],
    ["Fade out", 44100, [0.05, Infinity]],
    ["Reverse", 44100, [0.05, Infinity]],
    ["Robot", 44100, [0.05, Infinity]],
  ];
  for (const [title, expected, [minPeak, maxPeak]] of uiCases) {
    test(`${title} 버튼: 편집이 적용되고 샘플 수가 ${expected}이 된다`, async ({ page }) => {
      await editorButton(page, title).click();
      // 편집이 실제로 적용되어야 undo 이력이 생긴다
      await expect(editorButton(page, "Undo")).toBeEnabled();
      await expect(activeItem(page)).toHaveAttribute("data-samples", String(expected));
      await expect(activeItem(page)).toHaveAttribute("data-sample-rate", "44100");
      const peak = Number(await activeItem(page).getAttribute("data-peak"));
      expect(peak).toBeGreaterThanOrEqual(minPeak);
      expect(peak).toBeLessThanOrEqual(maxPeak);
    });
  }

  test("선택 후 Delete 버튼: 25%~75% 선택이면 22050샘플이 남는다", async ({ page }) => {
    await dragSelect(page, 0.25, 0.75);
    await editorButton(page, "Delete").click();
    await expect.poll(() => samplesOf(page)).toBeLessThan(44100);
    expect(await samplesOf(page)).toBeGreaterThan(21900);
    expect(await samplesOf(page)).toBeLessThan(22200);
  });

  test("선택 후 Shift+Delete: 선택 밖을 지워 선택 구간만 남는다", async ({ page }) => {
    await dragSelect(page, 0.25, 0.75);
    await page.keyboard.press("Shift+Delete");
    await expect.poll(() => samplesOf(page)).toBeLessThan(44100);
    expect(await samplesOf(page)).toBeGreaterThan(21900);
    expect(await samplesOf(page)).toBeLessThan(22200);
  });

  test("선택 없이 Delete·Shift+Delete는 아무 일도 하지 않는다", async ({ page }) => {
    await page.keyboard.press("Delete");
    await page.keyboard.press("Shift+Delete");
    expect(await samplesOf(page)).toBe(44100);
    await expect(editorButton(page, "Undo")).toBeDisabled();
  });

  test("Copy → Paste: 선택 없이 붙이면 끝에 클립이 붙는다", async ({ page }) => {
    await dragSelect(page, 0.25, 0.75);
    await editorButton(page, "Copy").click();
    // 선택을 해제하려고 파형 밖 편집기 여백을 누른다
    await page.locator('[class*="editorContainer"]').click({ position: { x: 5, y: 5 } });
    await editorButton(page, "Paste").click();
    await expect.poll(() => samplesOf(page)).toBeGreaterThan(44100);
    const n = await samplesOf(page);
    expect(n).toBeGreaterThan(66000);
    expect(n).toBeLessThan(66300);
  });

  test("Undo/Redo: 효과 뒤 Undo는 44100으로, Redo는 35002로 돌린다", async ({ page }) => {
    await editorButton(page, "Faster").click();
    await expect(activeItem(page)).toHaveAttribute("data-samples", "35002");
    await editorButton(page, "Undo").click();
    await expect(activeItem(page)).toHaveAttribute("data-samples", "44100");
    await editorButton(page, "Redo").click();
    await expect(activeItem(page)).toHaveAttribute("data-samples", "35002");
  });

  test("Copy to New: 목록이 2개가 되고 새 소리가 선택된다", async ({ page }) => {
    await dragSelect(page, 0.25, 0.75);
    await editorButton(page, "Copy to New").click();
    await expect(page.locator(".sound-item")).toHaveCount(2);
    await expect(activeItem(page).locator(".sound-name")).toHaveText("Sine 440Hz2");
    expect(await samplesOf(page)).toBeGreaterThan(21900);
    expect(await samplesOf(page)).toBeLessThan(22200);
  });

  test("녹음 → 저장: fake 마이크 녹음이 목록에 추가된다", async ({ page }) => {
    await page.getByRole("button", { name: "Record", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Record Sound" });
    await expect(dialog).toBeVisible();
    const recordButton = dialog.getByRole("button", { name: "Record", exact: true });
    await expect(recordButton).toBeEnabled();
    await recordButton.click();
    await page.waitForTimeout(1500);
    await dialog.getByRole("button", { name: "Stop recording" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".sound-item")).toHaveCount(2);
    await expect(activeItem(page).locator(".sound-name")).toHaveText("recording1");
    expect(await samplesOf(page)).toBeGreaterThan(1000);
    expect(Number(await activeItem(page).getAttribute("data-peak"))).toBeGreaterThan(0.01);
  });
});
