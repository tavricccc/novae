import { expect, test } from "@playwright/test";
import { E2E_USERS, signInWithEmulator } from "./support/accounts";
import { expectBackendAction } from "./support/backend-action";

for (const width of [390, 1280]) {
  test(`facility text survives reload and can be cleared (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signInWithEmulator(page, E2E_USERS.ordinary);
    await page.goto("/facilities/new");
    const title = page.locator("#composer-title");
    const location = page.locator("#facility-location");
    const content = page.locator("#composer-content");
    await title.fill("Draft report");
    await location.fill("Library entrance");
    await content.fill("The light is broken.");
    await expect.poll(() => page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((key) => key.startsWith("novae:composer-draft:") && key.endsWith(":facility"));
      return key ? JSON.parse(sessionStorage.getItem(key)!).value : null;
    })).toMatchObject({ title: "Draft report", location: "Library entrance", content: "The light is broken." });
    await page.reload();
    await expect(title).toHaveValue("Draft report");
    await expect(location).toHaveValue("Library entrance");
    await expect(content).toContainText("The light is broken.");
    await expect(page.getByRole("status").filter({ hasText: /restored|已恢復/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/composer-draft-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: /Clear text draft|清除文字草稿/ }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: /Clear text draft|清除文字草稿/ }).click();
    await expect(title).toHaveValue("");
    await expect(location).toHaveValue("");
    await expect(content).toHaveText("");
    await page.reload();
    await expect(title).toHaveValue("");
  });
}

test("proposal drafts stay in their category and clear after a successful submission", async ({ page }) => {
  await signInWithEmulator(page, E2E_USERS.ordinary);
  await page.goto("/issues/proposal-a/compose/new");
  await page.locator("#composer-title").fill("Draft category A");
  await page.locator("#composer-content").fill("Keep this draft in category A.");
  await page.goto("/issues/proposal-b/compose/new");
  await expect(page.locator("#composer-title")).toHaveValue("");
  await page.locator("#composer-title").fill("Draft category B");
  await page.goto("/issues/proposal-a/compose/new");
  await expect(page.locator("#composer-title")).toHaveValue("Draft category A");
  await expect(page.locator("#composer-content")).toContainText("Keep this draft in category A.");
  await expectBackendAction(page, "createIssue", async () => {
    await page.getByRole("button", { name: /Submit proposal|送出提案/ }).click();
  });
  await expect(page).toHaveURL(/\/issues\/proposal-a\/(?!compose)[^/]+$/);
  await page.goto("/issues/proposal-a/compose/new");
  await expect(page.locator("#composer-title")).toHaveValue("");
  await page.goto("/issues/proposal-b/compose/new");
  await expect(page.locator("#composer-title")).toHaveValue("Draft category B");
});
