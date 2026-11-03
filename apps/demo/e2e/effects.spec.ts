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
    ["faster", 33923],
    ["slower", 58800],
    ["echo", 97020],
    ["higher", 44100],
    ["lower", 44100],
    ["fade in", 44100],
    ["fade out", 44100],
    ["reverse", 44100],
    ["robot", 52920],
    ["cyborg", 52920],
    ["alien", 44100],
    ["broadcast", 61740],
    ["walkie", 54243],
    ["reverse reverb", 110250],
    ["scratch", 44100],
    ["coaster", 44100],
    ["stutter", 44100],
    ["vibrato", 44100],
  ];
  for (const [name, expected] of cases) {
    test(`${name}: 전체 구간 적용 후 샘플 수가 ${expected}이고 무음이 아니다`, async ({ page }) => {
      const stats = await runCoreEffect(page, name, 0, 1);
      expect(stats.length).toBe(expected);
      expect(stats.peak).toBeGreaterThan(0.05);
      expect(stats.peak).toBeLessThanOrEqual(1);
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

  test("higher/lower: rms 비가 1.5와 0.6에 가깝다", async ({ page }) => {
    const higher = await runCoreEffect(page, "higher", 0, 1);
    const lower = await runCoreEffect(page, "lower", 0, 1);
    expect(higher.rms / INPUT_RMS).toBeCloseTo(1.5, 1);
    expect(lower.rms / INPUT_RMS).toBeCloseTo(0.6, 1);
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
    ["Faster", 33923, [0.05, Infinity]],
    ["Slower", 58800, [0.05, Infinity]],
    ["Louder", 44100, [0.7, 0.8]], // 0.5 × 1.5
    ["Softer", 44100, [0.25, 0.35]], // 0.5 × 0.6
    ["Fade in", 44100, [0.05, Infinity]],
    ["Fade out", 44100, [0.05, Infinity]],
    ["Cyborg", 52920, [0.05, Infinity]],
    ["Robot", 52920, [0.05, Infinity]],
    ["Alien", 44100, [0.05, Infinity]],
    ["Echo", 97020, [0.05, Infinity]],
    ["Broadcast", 61740, [0.05, Infinity]],
    ["Walkie-talkie", 54243, [0.05, Infinity]],
    ["Reverse reverb", 110250, [0.05, Infinity]],
    ["Scratch", 44100, [0.05, Infinity]],
    ["Roller coaster", 44100, [0.05, Infinity]],
    ["Stutter", 44100, [0.05, Infinity]],
    ["Vibrato", 44100, [0.05, Infinity]],
    ["Reverse", 44100, [0.05, Infinity]],
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

  test("음소거 버튼은 화면에 없다", async ({ page }) => {
    await expect(editorButton(page, "Mute")).toHaveCount(0);
  });

  test("효과 버튼 18개는 9칸 × 2줄이고 서로 겹치지 않는다", async ({ page }) => {
    const titles = [
      "Faster",
      "Slower",
      "Louder",
      "Softer",
      "Fade in",
      "Fade out",
      "Cyborg",
      "Robot",
      "Alien",
      "Echo",
      "Broadcast",
      "Walkie-talkie",
      "Reverse reverb",
      "Scratch",
      "Roller coaster",
      "Stutter",
      "Vibrato",
      "Reverse",
    ];
    const boxes = [];
    for (const title of titles) {
      const box = await editorButton(page, title).boundingBox();
      if (!box) throw new Error(`${title} 버튼의 위치를 구하지 못했다`);
      boxes.push(box);
    }
    const rows = [boxes.slice(0, 9), boxes.slice(9)];
    for (const row of rows) {
      // 한 줄의 위 가장자리가 모두 같다
      for (const box of row) expect(box.y).toBeCloseTo(row[0]!.y, 1);
      // 왼쪽에서 오른쪽으로 놓이고 이웃과 가로로 겹치지 않는다
      for (let i = 0; i < row.length - 1; i++) {
        expect(row[i]!.x + row[i]!.width).toBeLessThanOrEqual(row[i + 1]!.x + 0.5);
      }
    }
    // 2줄째는 1줄째의 가장 낮은 아래 가장자리 이후에서 시작한다
    const firstRowBottom = Math.max(...rows[0]!.map((b) => b.y + b.height));
    expect(rows[1]![0]!.y).toBeGreaterThanOrEqual(firstRowBottom - 0.5);
  });

  test("효과 격자의 오른쪽 끝은 파형의 오른쪽 끝을 넘지 않는다", async ({ page }) => {
    const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
    const last = await editorButton(page, "Reverse").boundingBox();
    if (!wave || !last) throw new Error("파형이나 버튼의 위치를 구하지 못했다");
    expect(last.x + last.width).toBeLessThanOrEqual(wave.x + wave.width + 0.5);
  });

  test("전체 길이는 파형 아래 오른쪽 끝에 있고 파형을 가리지 않는다", async ({ page }) => {
    const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
    const length = await page.getByText(/^\d+\.\d\d s$/).boundingBox();
    const play = await editorButton(page, "Play").boundingBox();
    if (!wave || !length || !play) throw new Error("요소의 위치를 구하지 못했다");
    // 파형 바로 아래: 파형 밑변보다 아래이고 재생 버튼 줄보다 위다
    expect(length.y).toBeGreaterThanOrEqual(wave.y + wave.height - 0.5);
    expect(length.y + length.height).toBeLessThanOrEqual(play.y);
    // 오른쪽 끝을 파형의 오른쪽 끝에 맞춘다
    expect(Math.abs(length.x + length.width - (wave.x + wave.width))).toBeLessThanOrEqual(1);
  });

  /** 선택 범위 문구와 파형 상자의 위치. x는 파형 안쪽(테두리 1px 안) 기준이다 */
  async function selectionLabelGeometry(page: Page) {
    const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
    const label = await page.getByText(/^\d+\.\d\d–\d+\.\d\d s \(/).boundingBox();
    if (!wave || !label) throw new Error("파형이나 범위 문구의 위치를 구하지 못했다");
    return { wave, label, innerX: wave.x + 1, innerWidth: wave.width - 2 };
  }

  test("선택 범위 문구는 파형 바로 위에 있고 소리 전체일 때의 적용 범위 문구는 보이지 않는다", async ({
    page,
  }) => {
    const whole = await page.getByText("Effects apply to: whole sound").boundingBox();
    expect(whole && whole.width <= 1).toBe(true);
    await dragSelect(page, 0.2, 0.8);
    const { wave, label } = await selectionLabelGeometry(page);
    // 파형 윗변 위에 있고, 위 줄(편집 버튼)과 겹치지 않을 만큼만 올라온다
    expect(label.y + label.height).toBeLessThanOrEqual(wave.y + 0.5);
    expect(wave.y - label.y).toBeLessThanOrEqual(20);
  });

  test("선택이 넓으면 범위 문구가 선택의 가운데에 온다", async ({ page }) => {
    await dragSelect(page, 0.2, 0.8);
    const { label, innerX, innerWidth } = await selectionLabelGeometry(page);
    const selectionCenter = innerX + innerWidth * 0.5;
    expect(Math.abs(label.x + label.width / 2 - selectionCenter)).toBeLessThanOrEqual(2);
  });

  // 선택 핸들은 시작선 왼쪽과 끝선 오른쪽으로 30px 나온다. 좁은 선택의 문구는 그 바깥에 둔다
  test("선택이 좁으면 끝 핸들 오른쪽에 둔다", async ({ page }) => {
    await dragSelect(page, 0.05, 0.07);
    const { label, innerX, innerWidth } = await selectionLabelGeometry(page);
    expect(Math.abs(label.x - (innerX + innerWidth * 0.07 + 30))).toBeLessThanOrEqual(2);
  });

  test("선택이 좁고 오른쪽 끝에 붙어 있으면 시작 핸들 왼쪽에 두어 파형 안에 머문다", async ({
    page,
  }) => {
    await dragSelect(page, 0.93, 0.95);
    const { wave, label, innerX, innerWidth } = await selectionLabelGeometry(page);
    expect(Math.abs(label.x + label.width - (innerX + innerWidth * 0.93 - 30))).toBeLessThanOrEqual(
      2,
    );
    expect(label.x + label.width).toBeLessThanOrEqual(wave.x + wave.width);
  });

  test("기본 글꼴 크기를 150%로 키워도 이웃한 효과 라벨이 겹치지 않는다", async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "24px";
    });
    for (const [left, right] of [
      ["Broadcast", "Walkie-talkie"],
      ["Walkie-talkie", "Reverse reverb"],
      ["Reverse reverb", "Scratch"],
      ["Scratch", "Roller coaster"],
      ["Roller coaster", "Stutter"],
    ]) {
      const a = await editorButton(page, left!).locator("div").boundingBox();
      const b = await editorButton(page, right!).locator("div").boundingBox();
      if (!a || !b) throw new Error(`${left}, ${right} 라벨의 위치를 구하지 못했다`);
      expect(a.x + a.width, `${left}와 ${right}`).toBeLessThanOrEqual(b.x + 0.5);
    }
  });

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

  test("Undo/Redo: 효과 뒤 Undo는 44100으로, Redo는 33923으로 돌린다", async ({ page }) => {
    await editorButton(page, "Faster").click();
    await expect(activeItem(page)).toHaveAttribute("data-samples", "33923");
    await editorButton(page, "Undo").click();
    await expect(activeItem(page)).toHaveAttribute("data-samples", "44100");
    await editorButton(page, "Redo").click();
    await expect(activeItem(page)).toHaveAttribute("data-samples", "33923");
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
