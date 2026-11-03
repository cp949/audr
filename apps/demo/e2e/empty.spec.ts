import { expect, test } from "@playwright/test";

test.describe("소리 0개 상태", () => {
  test("마지막 소리를 지우면 안내가 보이고 편집기는 사라진다", async ({ page }) => {
    await page.goto("/");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Remove sound" }).click();
    await expect(page.getByText("No sounds yet")).toBeVisible();
    await expect(page.locator("svg[data-waveform]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove sound" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Download WAV" })).toBeDisabled();
    await page.screenshot({ path: process.env.EMPTY_SHOT ?? "empty.png" });
  });
});
