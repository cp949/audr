import { expect, test } from "@playwright/test";

test.describe("데모의 언어 선택", () => {
  test("기본은 영어이고 소수점이 점이다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+\.\d\d s$/)).toBeVisible();
  });

  test("한국어를 고르면 내장 한국어 문구로 바뀐다", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Language").selectOption("ko");
    await expect(page.getByRole("button", { name: "재생", exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+\.\d\d초$/)).toBeVisible();
  });

  test("독일어를 고르면 넘긴 문구와 쉼표 소수점을 쓰고 나머지는 영어다", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Language").selectOption("de");
    await expect(page.getByRole("button", { name: "Abspielen", exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+,\d\d s$/)).toBeVisible();
    // messages에 없는 키는 영어로 남는다
    await expect(page.getByRole("button", { name: "Cyborg", exact: true })).toBeVisible();
  });

  test("녹음 대화상자도 고른 언어를 따른다", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Language").selectOption("de");
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await expect(page.getByRole("button", { name: "Aufnehmen", exact: true })).toBeVisible();
  });
});
