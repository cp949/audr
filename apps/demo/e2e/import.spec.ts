import { expect, test } from "@playwright/test";

/** 16비트 PCM 모노 WAV 바이트를 만든다 (440Hz 사인파). */
function makeWav(seconds: number, sampleRate: number): Buffer {
  const count = Math.round(seconds * sampleRate);
  const buf = Buffer.alloc(44 + count * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + count * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // 모노
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const v = Math.round(0.5 * 32767 * Math.sin((2 * Math.PI * 440 * i) / sampleRate));
    buf.writeInt16LE(v, 44 + i * 2);
  }
  return buf;
}

test.describe("파일 가져오기 (decodeAudioFile)", () => {
  test("WAV 파일을 올리면 소리 목록에 항목이 생기고 샘플이 있다", async ({ page }) => {
    await page.goto("/");
    const items = page.locator(".sound-item");
    await expect(items).toHaveCount(1);

    await page.getByLabel("Import sound").setInputFiles({
      name: "beep.wav",
      mimeType: "audio/wav",
      buffer: makeWav(0.1, 22050),
    });

    await expect(items).toHaveCount(2);
    const added = items.nth(1);
    await expect(added.locator(".sound-name")).toHaveText("beep");
    // 컨텍스트 레이트(44100 또는 48000)로 리샘플된 0.1초 분량이어서 4000샘플보다 많다
    const samples = Number(await added.getAttribute("data-samples"));
    expect(samples).toBeGreaterThan(4000);
    expect(Number(await added.getAttribute("data-peak"))).toBeGreaterThan(0.1);
    await expect(added).toHaveAttribute("aria-current", "true");
  });

  test("Blob.arrayBuffer가 없는 브라우저(Chrome 75)에서도 파일을 가져온다", async ({ page }) => {
    // Chrome 76 미만을 흉내 낸다. 자동 검증 하한인 Chrome 83에도 이 API가 있어 일부러 지운다.
    await page.addInitScript(() => {
      delete (Blob.prototype as { arrayBuffer?: unknown }).arrayBuffer;
    });
    await page.goto("/");
    expect(await page.evaluate(() => typeof Blob.prototype.arrayBuffer)).toBe("undefined");
    const items = page.locator(".sound-item");
    await expect(items).toHaveCount(1);

    await page.getByLabel("Import sound").setInputFiles({
      name: "beep.wav",
      mimeType: "audio/wav",
      buffer: makeWav(0.1, 22050),
    });

    await expect(items).toHaveCount(2);
    expect(Number(await items.nth(1).getAttribute("data-samples"))).toBeGreaterThan(4000);
  });
});
