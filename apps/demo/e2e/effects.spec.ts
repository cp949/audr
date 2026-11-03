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

  test("음소거 버튼은 효과 상자에 보이고 누르면 전체가 무음이 된다", async ({ page }) => {
    const mute = editorButton(page, "Mute");
    await expect(mute).toHaveCount(1);
    await mute.click();
    await expect(activeItem(page)).toHaveAttribute("data-peak", "0.0000");
  });

  /** 효과 칩 19개. 화면 순서이자 Tab 순서다 */
  const CHIPS = [
    "Louder",
    "Softer",
    "Fade in",
    "Fade out",
    "Mute",
    "Faster",
    "Slower",
    "Reverse",
    "Scratch",
    "Robot",
    "Cyborg",
    "Alien",
    "Walkie-talkie",
    "Echo",
    "Reverse reverb",
    "Broadcast",
    "Vibrato",
    "Stutter",
    "Roller coaster",
  ];

  /** 두 상자가 겹치는지 */
  const overlap = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) =>
    a.x < b.x + b.width - 0.5 &&
    b.x < a.x + a.width - 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    b.y < a.y + a.height - 0.5;

  /** 효과 칩 19개의 상자를 화면 순서대로 모은다 */
  async function chipBoxes(page: Page) {
    const boxes = [];
    for (const title of CHIPS) {
      const box = await editorButton(page, title).boundingBox();
      if (!box) throw new Error(`${title} 버튼의 위치를 구하지 못했다`);
      boxes.push({ title, ...box });
    }
    return boxes;
  }

  test("효과 버튼 19개는 하나의 flex-wrap 상자에 현재 순서대로 나열되고 서로 겹치지 않는다", async ({
    page,
  }) => {
    const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
    const play = await editorButton(page, "Play").boundingBox();
    if (!wave || !play) throw new Error("파형이나 재생 버튼의 위치를 구하지 못했다");
    // 효과 상자는 하나이고 직계 자식이 칩 19개다
    const group = page.getByRole("group", { name: "Effects" });
    await expect(group).toHaveCount(1);
    await expect(group).toHaveCSS("display", "flex");
    await expect(group).toHaveCSS("flex-wrap", "wrap");
    await expect(group.locator("> button")).toHaveCount(19);
    expect(await group.locator("> button").allInnerTexts()).toEqual(CHIPS);
    const boxes = await chipBoxes(page);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlap(boxes[i]!, boxes[j]!), `${boxes[i]!.title}와 ${boxes[j]!.title}`).toBe(
          false,
        );
      }
    }
    // 모든 칩이 재생 버튼 아래, 파형 폭 안에 있다
    for (const box of boxes) {
      expect(box.y, box.title).toBeGreaterThanOrEqual(play.y + play.height - 0.5);
      expect(box.x, box.title).toBeGreaterThanOrEqual(wave.x - 0.5);
      expect(box.x + box.width, box.title).toBeLessThanOrEqual(wave.x + wave.width + 0.5);
    }
    // 읽는 순서(위 줄에서 아래 줄, 같은 줄은 왼쪽에서 오른쪽)가 나열 순서와 같다
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1]!;
      const b = boxes[i]!;
      const nextLine = b.y > a.y + a.height / 2;
      expect(nextLine || b.x >= a.x + a.width - 0.5, `${a.title} 다음 ${b.title}`).toBe(true);
    }
    // 폭이 모자라면 줄바꿈하므로 줄이 2개 이상이다(칩 한 줄에 19개는 들어가지 않는다)
    expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBeGreaterThan(1);
  });

  test("파형 영역은 부모 div의 너비를 가득 채우고 막대 그림도 같은 폭이다", async ({ page }) => {
    for (const frameWidth of [629, 420]) {
      await page.evaluate((w) => {
        const frame = document.querySelector<HTMLElement>(".editor-frame");
        if (frame) frame.style.width = `${w}px`;
      }, frameWidth);
      const wave = page.locator('[class*="waveformContainer"]').first();
      // 폭이 바뀐 뒤 ResizeObserver가 막대 그림을 다시 그릴 때까지 기다린다
      await expect(async () => {
        const parent = await wave.evaluate((el) => el.parentElement?.getBoundingClientRect().width);
        const box = await wave.boundingBox();
        expect(box?.width, `${frameWidth}px`).toBeCloseTo(parent ?? -1, 0);
        // 막대 그림(svg)도 상자 폭을 채우고 높이는 160px이다
        const svg = await page.locator("svg[data-waveform]").boundingBox();
        expect(svg?.width, `${frameWidth}px svg`).toBeCloseTo(box?.width ?? -1, 0);
        expect(svg?.height, `${frameWidth}px svg`).toBeCloseTo(160, 0);
      }).toPass();
    }
  });

  test("폭이 좁아도 효과 칩이 에디터 오른쪽 끝을 넘지 않는다", async ({ page }) => {
    // 데모의 기본 배치는 auto라 420px에서는 overflow가 된다. 펼친 배치의 줄바꿈을 보려고 expanded로 둔다
    await page.getByLabel("Effects layout").selectOption("expanded");
    // 좁은 호스트를 흉내 내려 폭만 줄인다
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>(".editor-frame");
      if (frame) frame.style.width = "420px";
    });
    const editor = await page.locator('[class*="editorContainer"]').first().boundingBox();
    if (!editor) throw new Error("에디터의 위치를 구하지 못했다");
    for (const box of await chipBoxes(page)) {
      expect(box.x + box.width, box.title).toBeLessThanOrEqual(editor.x + editor.width + 0.5);
    }
  });

  // 호스트 폭 슬라이더로 부모 폭을 바꿔 사용 계약(width: 100% + min-width + max-width)을 확인한다.
  // 데모의 .editor-frame은 min-width 320px, max-width 800px이다. 값은 demo.css와 같아야 한다.
  for (const [hostWidth, frameWidth] of [
    [200, 320],
    [320, 320],
    [420, 420],
    [629, 629],
    [1000, 800],
  ] as const) {
    test(`호스트 폭 ${hostWidth}px에서 에디터는 ${frameWidth}px이고 가로로 넘치지 않는다`, async ({
      page,
    }) => {
      await page.getByRole("slider", { name: "Host width" }).fill(String(hostWidth));
      const frame = page.locator(".editor-frame");
      await expect(async () => {
        const box = await frame.boundingBox();
        expect(box?.width).toBeCloseTo(frameWidth, 0);
        // 에디터 안 어떤 요소도 에디터 오른쪽을 넘지 않는다
        const overflow = await page
          .locator('[class*="editorContainer"]')
          .first()
          .evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        // 파형 SVG도 상자 폭을 따라 다시 그려진다
        const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
        const svg = await page.locator("svg[data-waveform]").boundingBox();
        expect(svg?.width).toBeCloseTo(wave?.width ?? -1, 0);
      }).toPass();
    });
  }

  // effectsLayout. 데모 상단의 Effects layout 선택 상자로 바꾼다. 호스트 폭 420px에서 효과 칩은 여러 줄로 나뉜다.
  test.describe("effectsLayout", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("slider", { name: "Host width" }).fill("420");
    });

    /** 칩이 에디터 안쪽에 들어와 있는지 */
    async function expectInsideEditor(page: Page, title: string) {
      const editor = await page.locator('[class*="editorContainer"]').first().boundingBox();
      const box = await editorButton(page, title).boundingBox();
      if (!editor || !box) throw new Error(`${title}의 위치를 구하지 못했다`);
      expect(box.x, title).toBeGreaterThanOrEqual(editor.x - 0.5);
      expect(box.x + box.width, title).toBeLessThanOrEqual(editor.x + editor.width + 0.5);
    }

    test("minimized: Effects 버튼 하나만 보이고, 열면 칩 19개가 에디터 안에 뜬다. 효과를 적용하면 닫힌다", async ({
      page,
    }) => {
      await page.getByLabel("Effects layout").selectOption("minimized");
      await expect(editorButton(page, "Louder")).toHaveCount(0);
      const toggle = page.locator('[class*="editorContainer"]').getByRole("button", {
        name: /^Effects/,
      });
      const before = await page.locator('[class*="editorContainer"]').first().boundingBox();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      for (const title of CHIPS) await expectInsideEditor(page, title);
      // 팝오버는 레이아웃을 밀지 않는다
      const after = await page.locator('[class*="editorContainer"]').first().boundingBox();
      expect(after?.height).toBeCloseTo(before?.height ?? -1, 0);
      await editorButton(page, "Slower").click();
      await expect.poll(() => samplesOf(page)).toBe(58800);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(editorButton(page, "Louder")).toHaveCount(0);
    });

    test("overflow: 첫 줄만 보이고 나머지는 더보기 팝오버에 있다. 효과를 적용하면 닫힌다", async ({
      page,
    }) => {
      await page.getByLabel("Effects layout").selectOption("overflow");
      const more = page.getByRole("button", { name: "More effects" });
      await expect(more).toBeVisible();
      // 첫 줄의 칩은 보이고 둘째 줄 이후의 칩은 보이지 않는다(포커스도 받지 않는다)
      await expect(editorButton(page, "Louder")).toBeVisible();
      await expect(editorButton(page, "Roller coaster")).toBeHidden();
      const visibleCount = (
        await Promise.all(CHIPS.map((c) => editorButton(page, c).isVisible()))
      ).filter(Boolean).length;
      expect(visibleCount).toBeGreaterThan(0);
      expect(visibleCount).toBeLessThan(CHIPS.length);
      // 첫 줄의 칩은 모두 같은 높이(한 줄)에 있다
      const tops = new Set<number>();
      for (const title of CHIPS.slice(0, visibleCount)) {
        const box = await editorButton(page, title).boundingBox();
        tops.add(Math.round(box?.y ?? -1));
      }
      expect(tops.size).toBe(1);
      const before = await page.locator('[class*="editorContainer"]').first().boundingBox();

      await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "true");
      for (const title of CHIPS) {
        await expect(editorButton(page, title)).toBeVisible();
        await expectInsideEditor(page, title);
      }
      // 팝오버는 레이아웃을 밀지 않는다
      const after = await page.locator('[class*="editorContainer"]').first().boundingBox();
      expect(after?.height).toBeCloseTo(before?.height ?? -1, 0);

      await editorButton(page, "Slower").click();
      await expect.poll(() => samplesOf(page)).toBe(58800);
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect(editorButton(page, "Roller coaster")).toBeHidden();
    });

    test("overflow: 폭을 줄이면 첫 줄에 보이는 칩 수가 줄어든다", async ({ page }) => {
      await page.getByLabel("Effects layout").selectOption("overflow");
      const count = async () =>
        (await Promise.all(CHIPS.map((c) => editorButton(page, c).isVisible()))).filter(Boolean)
          .length;
      await page.getByRole("slider", { name: "Host width" }).fill("629");
      await expect.poll(count).toBeGreaterThan(5);
      const wide = await count();
      await page.getByRole("slider", { name: "Host width" }).fill("320");
      await expect.poll(count).toBeLessThan(wide);
    });

    test("auto: 효과 상자 폭이 560px 이상이면 펼치고 미만이면 overflow로 바뀐다", async ({
      page,
    }) => {
      await page.getByLabel("Effects layout").selectOption("auto");
      const slider = page.getByRole("slider", { name: "Host width" });
      const more = page.getByRole("button", { name: "More effects" });
      const visibleChips = async () =>
        (await Promise.all(CHIPS.map((c) => editorButton(page, c).isVisible()))).filter(Boolean)
          .length;
      // 호스트 폭 600px는 효과 상자 572px(3줄), 560px는 532px(4줄)다
      await slider.fill("600");
      await expect(more).toHaveCount(0);
      await expect.poll(visibleChips).toBe(CHIPS.length);
      await slider.fill("560");
      await expect(more).toBeVisible();
      await expect.poll(visibleChips).toBeLessThan(CHIPS.length);
      // 다시 넓히면 펼친다
      await slider.fill("629");
      await expect(more).toHaveCount(0);
      await expect.poll(visibleChips).toBe(CHIPS.length);
    });
  });

  test("재생 버튼은 파형 아래 가로 가운데에 있다", async ({ page }) => {
    const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
    const play = await editorButton(page, "Play").boundingBox();
    if (!wave || !play) throw new Error("파형이나 재생 버튼의 위치를 구하지 못했다");
    expect(Math.abs(play.x + play.width / 2 - (wave.x + wave.width / 2))).toBeLessThanOrEqual(1);
    expect(play.y).toBeGreaterThanOrEqual(wave.y + wave.height - 0.5);
  });

  test("전체 길이는 눈금자의 오른쪽 끝에 있고 파형 막대 영역을 가리지 않는다", async ({ page }) => {
    const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
    const length = await page.getByText(/^\d+\.\d\d s$/).boundingBox();
    if (!wave || !length) throw new Error("요소의 위치를 구하지 못했다");
    // 눈금자는 파형 상자 위쪽 22px이다
    expect(length.y).toBeGreaterThanOrEqual(wave.y - 0.5);
    expect(length.y + length.height).toBeLessThanOrEqual(wave.y + 22 + 0.5);
    // 오른쪽 끝에서 6px 안쪽이다
    expect(wave.x + wave.width - (length.x + length.width)).toBeLessThanOrEqual(8);
    expect(wave.x + wave.width - (length.x + length.width)).toBeGreaterThanOrEqual(4);
  });

  for (const [ratio, text] of [
    [0.25, "0.25"],
    [0.5, "0.50"],
    [0.75, "0.75"],
  ] as const) {
    test(`눈금 ${text}은 파형 폭의 ${ratio * 100}% 눈금선 오른쪽에 붙는다`, async ({ page }) => {
      const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
      const tick = await page.locator('[class*="rulerTick"]', { hasText: text }).boundingBox();
      if (!wave || !tick) throw new Error("눈금의 위치를 구하지 못했다");
      // 눈금 상자는 눈금선 위치에서 시작하고 글자는 4px 안쪽에서 시작한다
      expect(Math.abs(tick.x - (wave.x + wave.width * ratio))).toBeLessThanOrEqual(1.5);
      expect(tick.y + tick.height).toBeLessThanOrEqual(wave.y + 22 + 0.5);
    });
  }

  test("선택이 없으면 모든 막대가 불투명도 0.7이고, 선택하면 선택 구간의 막대만 1이 된다", async ({
    page,
  }) => {
    const rects = page.locator("svg[data-waveform] rect");
    const count = await rects.count();
    const first = rects.first();
    const middle = rects.nth(Math.floor(count / 2));
    const last = rects.last();
    for (const bar of [first, middle, last]) await expect(bar).toHaveCSS("opacity", "0.7");
    await dragSelect(page, 0.2, 0.8);
    await expect(first).toHaveCSS("opacity", "0.7");
    await expect(middle).toHaveCSS("opacity", "1");
    await expect(last).toHaveCSS("opacity", "0.7");
  });

  test("선택 도구 막대는 선택이 없으면 없고, 선택하면 눈금자 아래 파형 상자 안에 선택 가운데로 뜬다", async ({
    page,
  }) => {
    const group = page.getByRole("group", { name: "Selection actions" });
    await expect(group).toHaveCount(0);
    await dragSelect(page, 0.2, 0.8);
    const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
    const box = await group.boundingBox();
    if (!wave || !box) throw new Error("파형이나 도구 막대의 위치를 구하지 못했다");
    expect(box.y).toBeGreaterThanOrEqual(wave.y + 22 - 0.5);
    expect(box.x).toBeGreaterThanOrEqual(wave.x);
    expect(box.x + box.width).toBeLessThanOrEqual(wave.x + wave.width);
    // 선택 0.2~0.8의 가운데(0.5)에 막대 가운데가 온다
    expect(Math.abs(box.x + box.width / 2 - (wave.x + wave.width * 0.5))).toBeLessThanOrEqual(2);
  });

  test("오른쪽 끝에 붙은 좁은 선택에서도 도구 막대가 파형 상자 밖으로 나가지 않는다", async ({
    page,
  }) => {
    await dragSelect(page, 0.96, 1);
    const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
    const box = await page.getByRole("group", { name: "Selection actions" }).boundingBox();
    if (!wave || !box) throw new Error("파형이나 도구 막대의 위치를 구하지 못했다");
    expect(box.x + box.width).toBeLessThanOrEqual(wave.x + wave.width + 0.5);
    expect(box.x).toBeGreaterThanOrEqual(wave.x - 0.5);
  });

  test("선택 구간만 남기기 버튼: 25%~75% 선택이면 약 절반이 남는다", async ({ page }) => {
    await dragSelect(page, 0.25, 0.75);
    await editorButton(page, "Keep only selection").click();
    // 끌기 좌표가 픽셀 단위라 정확히 절반이 되지는 않는다
    await expect.poll(() => samplesOf(page)).toBeLessThan(44100);
    expect(await samplesOf(page)).toBeGreaterThan(21900);
    expect(await samplesOf(page)).toBeLessThan(22200);
  });

  /** 선택 범위 문구와 파형 상자의 위치. x는 파형 안쪽(테두리 1px 안) 기준이다 */
  async function selectionLabelGeometry(page: Page) {
    const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
    const label = await page.getByText(/^\d+\.\d\d–\d+\.\d\d s \(/).boundingBox();
    if (!wave || !label) throw new Error("파형이나 범위 문구의 위치를 구하지 못했다");
    return { wave, label, innerX: wave.x + 1, innerWidth: wave.width - 2 };
  }

  test("선택 범위 문구는 파형 바로 위에 있고 효과 적용 범위 문구는 화면에 보이지 않는다", async ({
    page,
  }) => {
    const whole = await page.getByText("Effects apply to: whole sound").boundingBox();
    expect(whole && whole.width <= 1).toBe(true);
    await dragSelect(page, 0.2, 0.8);
    const selection = await page.getByText("Effects apply to: selection").boundingBox();
    expect(selection && selection.width <= 1).toBe(true);
    const { wave, label } = await selectionLabelGeometry(page);
    // 파형 윗변 위에 있고, 위 줄(편집 버튼)과 겹치지 않을 만큼만 올라온다
    expect(label.y + label.height).toBeLessThanOrEqual(wave.y + 0.5);
    expect(wave.y - label.y).toBeLessThanOrEqual(20);
  });

  test("가로 기준선은 눈금자 아래 파형 높이의 가운데에 파형 폭만큼 놓인다", async ({ page }) => {
    const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
    const guide = await page.locator('[class*="guideHorizontal"]').boundingBox();
    if (!wave || !guide) throw new Error("파형이나 기준선의 위치를 구하지 못했다");
    // 눈금자(22px)를 뺀 파형 높이의 가운데다
    expect(
      Math.abs(guide.y + guide.height / 2 - (wave.y + 22 + (wave.height - 22) / 2)),
    ).toBeLessThanOrEqual(1);
    expect(guide.height).toBeLessThanOrEqual(1.5);
    expect(guide.width).toBeGreaterThanOrEqual(wave.width - 2);
  });

  for (const ratio of [0.25, 0.5, 0.75]) {
    test(`세로 기준선은 파형 안쪽 폭의 ${ratio * 100}% 지점에 파형 높이만큼 놓인다`, async ({
      page,
    }) => {
      const wave = await page.locator('[class*="waveformContainer"]').first().boundingBox();
      const guides = page.locator('[class*="guideVertical"]');
      const guide = await guides.nth([0.25, 0.5, 0.75].indexOf(ratio)).boundingBox();
      if (!wave || !guide) throw new Error("파형이나 기준선의 위치를 구하지 못했다");
      // 좌표는 테두리(1px) 안쪽 기준이다
      const expected = wave.x + 1 + (wave.width - 2) * ratio;
      expect(Math.abs(guide.x + guide.width / 2 - expected)).toBeLessThanOrEqual(1.5);
      expect(guide.width).toBeLessThanOrEqual(1.5);
      expect(guide.height).toBeGreaterThanOrEqual(wave.height - 2);
    });
  }

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

  test("기본 글꼴 크기를 150%로 키워도 효과 칩이 서로 겹치지 않는다", async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "24px";
    });
    const boxes = await chipBoxes(page);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlap(boxes[i]!, boxes[j]!), `${boxes[i]!.title}와 ${boxes[j]!.title}`).toBe(
          false,
        );
      }
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
