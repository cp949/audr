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
  });

  test("길이 0 소리에서도 편집기가 오류 없이 보이고 효과와 복사를 눌러도 깨지지 않는다", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.getByRole("button", { name: "New empty sound" }).click();
    await expect(page.locator("svg[data-waveform]")).toBeVisible();
    await expect(page.getByText("Length 0.00 s")).toBeAttached();
    for (const name of ["Louder", "Echo", "Reverse", "Robot", "Copy", "Play"]) {
      await page.getByRole("button", { name, exact: true }).click();
    }
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
