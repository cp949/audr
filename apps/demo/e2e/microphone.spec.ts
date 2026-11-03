// 마이크 오류 원인 분류와 녹음 중 끊김 흐름을 실제 Chromium에서 확인한다.
// 실제 권한 거부와 장치 분리는 만들 수 없어서 getUserMedia만 바꿔 넣는다.
// - 거부 계열은 실제 `DOMException`(이름만 지정)을 reject해, 브라우저 객체가 분류를 거치는 경로를 확인한다.
// - 끊김은 fake 마이크 스트림을 받아 둔 뒤 트랙에 ended 이벤트를 직접 낸다. 트랙은 실제로 끝나지 않는다.
// 규칙이 사는 곳: docs/design/03-microphone-errors.md.
import { expect, test, type Page } from "@playwright/test";

/** getUserMedia를 지정한 이름의 DOMException으로 reject하게 한다 */
async function rejectGetUserMedia(page: Page, name: string) {
  await page.addInitScript((errorName) => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("테스트용 거부", errorName));
  }, name);
}

async function openRecordDialog(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Record", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Record Sound" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("마이크 오류 원인", () => {
  test("권한 거부(NotAllowedError)는 permission-denied 안내와 호스트 notice로 나온다", async ({
    page,
  }) => {
    await rejectGetUserMedia(page, "NotAllowedError");
    const dialog = await openRecordDialog(page);
    await expect(dialog.getByRole("alert")).toContainText(
      "Allow it in your browser's site settings",
    );
    await expect(dialog.getByRole("button", { name: "Record", exact: true })).toBeDisabled();
    await expect(page.getByText("마이크 권한이 거부되었다")).toBeVisible();
  });

  test("장치 없음(NotFoundError)은 device-not-found 안내로 나온다", async ({ page }) => {
    await rejectGetUserMedia(page, "NotFoundError");
    const dialog = await openRecordDialog(page);
    await expect(dialog.getByRole("alert")).toContainText("No microphone found");
    await expect(page.getByText("마이크를 찾을 수 없다")).toBeVisible();
  });

  test("다른 앱이 쓰는 중(NotReadableError)은 device-in-use 안내로 나온다", async ({ page }) => {
    await rejectGetUserMedia(page, "NotReadableError");
    const dialog = await openRecordDialog(page);
    await expect(dialog.getByRole("alert")).toContainText("in use by another app");
    await expect(page.getByText("다른 앱이 마이크를 쓰고 있다")).toBeVisible();
  });
});

test.describe("마이크 끊김", () => {
  /** fake 마이크 스트림을 window에 보관해 테스트가 트랙에 ended를 낼 수 있게 한다 */
  async function captureStream(page: Page) {
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        (window as unknown as { __micStream: MediaStream }).__micStream = stream;
        return stream;
      };
    });
  }

  const endTrack = (page: Page) =>
    page.evaluate(() => {
      const stream = (window as unknown as { __micStream: MediaStream }).__micStream;
      for (const track of stream.getAudioTracks()) track.dispatchEvent(new Event("ended"));
    });

  test("대기 중에 끊기면 track-ended 안내를 보이고 녹음 버튼이 비활성이 된다", async ({ page }) => {
    await captureStream(page);
    const dialog = await openRecordDialog(page);
    const recordButton = dialog.getByRole("button", { name: "Record", exact: true });
    await expect(recordButton).toBeEnabled();
    await endTrack(page);
    await expect(dialog.getByRole("alert")).toContainText("microphone was disconnected");
    await expect(recordButton).toBeDisabled();
    await expect(page.getByText("마이크 연결이 끊겼다")).toBeVisible();
  });

  test("녹음 중에 끊기면 그때까지의 녹음을 살려 재생 단계로 넘기고 저장할 수 있다", async ({
    page,
  }) => {
    await captureStream(page);
    const dialog = await openRecordDialog(page);
    const recordButton = dialog.getByRole("button", { name: "Record", exact: true });
    await expect(recordButton).toBeEnabled();
    await recordButton.click();
    await page.waitForTimeout(1500);
    await endTrack(page);
    await expect(dialog.getByRole("status")).toHaveText(
      "Recording stopped because the microphone was disconnected.",
    );
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".sound-item")).toHaveCount(2);
    await expect(page.getByText("마이크 연결이 끊겼다")).toBeVisible();
  });
});

test.describe("좁은 화면", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("375px 폭에서도 닫기와 Save가 화면 안에 있고 길이 문구가 버튼과 겹치지 않는다", async ({
    page,
  }) => {
    const dialog = await openRecordDialog(page);
    await dialog.getByRole("button", { name: "Record", exact: true }).click();
    await page.waitForTimeout(1200);
    await dialog.getByRole("button", { name: "Stop recording" }).click();

    const box = async (loc: ReturnType<typeof dialog.locator>) => {
      const b = await loc.boundingBox();
      if (!b) throw new Error("요소가 그려지지 않았다");
      return b;
    };
    const close = await box(dialog.getByRole("button", { name: "Close" }));
    const save = await box(dialog.getByRole("button", { name: "Save" }));
    const reRecord = await box(dialog.getByRole("button", { name: "Re-record" }));
    const length = await box(dialog.getByText(/^Length /));

    expect(close.x + close.width).toBeLessThanOrEqual(375);
    expect(save.x + save.width).toBeLessThanOrEqual(375);
    // 길이 문구는 버튼 줄 위에 있어 Re-record와 세로로 겹치지 않는다
    expect(length.y + length.height).toBeLessThanOrEqual(reRecord.y);
  });
});
