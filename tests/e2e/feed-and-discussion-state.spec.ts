import { mkdir } from "node:fs/promises";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { E2E_USERS, signInWithEmulator } from "./support/accounts";
import { expectBackendAction } from "./support/backend-action";
import { createAnnouncement } from "./pages/content-pages";
import { completeInitialSetup } from "./pages/setup-page";

const captureDirectory = "test-results/feed-and-discussion-state";
const searchLabel = "Search titles, locations, content, or reporters…";
let authenticated: Awaited<ReturnType<BrowserContext["storageState"]>>;
let announcementUrl: string;
const firstComment = "Draft isolation: first discussion thread";
const secondComment = "Draft isolation: second discussion thread";

function choice(page: Page, name: string) {
  return page.getByRole("combobox", { name, exact: true })
    .or(page.getByRole("button", { name, exact: true }));
}

async function choose(page: Page, name: string, option: string) {
  await choice(page, name).click();
  await page.getByRole("option", { name: option, exact: true })
    .or(page.getByRole("radio", { name: option, exact: true })).click();
}

function commentRow(page: Page, text: string) {
  return page.locator("[data-comment-id]").filter({ hasText: text }).first();
}

async function addComment(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Enter a comment", exact: true }).fill(text);
  await expectBackendAction(page, "createAnnouncementComment", () =>
    page.getByRole("button", { name: "Post", exact: true }).click());
  await expect(commentRow(page, text)).toBeVisible();
  await expect(page.getByRole("button", { name: "Post", exact: true })).toBeDisabled();
}

test.describe.serial("shareable feeds and isolated discussion drafts", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    await mkdir(captureDirectory, { recursive: true });
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    try {
      // This suite can run with --no-deps against a fresh local seed.
      await signInWithEmulator(page, E2E_USERS.admin);
      if (/\/setup$/u.test(page.url())) await completeInitialSetup(page);
      announcementUrl = await createAnnouncement(page, `Draft state ${Date.now()}`);
      await addComment(page, firstComment);
      await addComment(page, secondComment);
      authenticated = await context.storageState({ indexedDB: true });
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  for (const width of [390, 1440]) {
    const size = width === 390 ? "mobile" : "desktop";
    test(`facility filters survive history, sharing and reload on ${size}`, async ({ browser }) => {
      const context = await browser.newContext({
        serviceWorkers: "block", storageState: authenticated, viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      try {
        await page.goto("/facilities?category=facility-a&source=e2e#list");
        await expect(choice(page, "Choose category")).toContainText("Facility A");
        await choose(page, "Choose category", "Facility B");
        await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe("facility-b");
        await choose(page, "Sort order", "Most affected");
        await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("most-affected");
        await page.getByRole("tab", { name: "Closed", exact: true }).click();
        await expect.poll(() => new URL(page.url()).searchParams.get("bucket")).toBe("closed");

        const beforeTyping = page.url();
        await page.getByRole("button", { name: searchLabel, exact: true }).click();
        const search = page.getByRole("textbox", { name: searchLabel, exact: true });
        await search.fill(`圖書館 ${size}`);
        expect(page.url()).toBe(beforeTyping);
        await page.getByRole("button", { name: "Search", exact: true }).click();
        await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(`圖書館 ${size}`);
        const shared = page.url();
        expect(new URL(shared).searchParams.get("source")).toBe("e2e");
        expect(new URL(shared).hash).toBe("#list");
        await page.keyboard.press("Escape");

        await page.reload();
        await expect(choice(page, "Choose category")).toContainText("Facility B");
        await expect(page.getByRole("tab", { name: "Closed", exact: true })).toHaveAttribute("aria-selected", "true");
        await page.getByRole("button", { name: searchLabel, exact: true }).click();
        await expect(search).toHaveValue(`圖書館 ${size}`);
        await page.keyboard.press("Escape");

        await page.goBack();
        await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBeNull();
        await expect(page.getByRole("tab", { name: "Closed", exact: true })).toHaveAttribute("aria-selected", "true");
        await page.goBack();
        await expect.poll(() => new URL(page.url()).searchParams.get("bucket")).toBeNull();
        await page.goBack();
        await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBeNull();
        await page.goBack();
        await expect(choice(page, "Choose category")).toContainText("Facility A");

        const sharedPage = await context.newPage();
        await sharedPage.goto(shared);
        await expect(choice(sharedPage, "Choose category")).toContainText("Facility B");
        await expect(sharedPage.getByRole("tab", { name: "Closed", exact: true })).toHaveAttribute("aria-selected", "true");
        await sharedPage.getByRole("button", { name: searchLabel, exact: true }).click();
        await expect(sharedPage.getByRole("textbox", { name: searchLabel, exact: true })).toHaveValue(`圖書館 ${size}`);
        await expect(sharedPage.locator('[data-slot="popover-content"]')).toHaveCSS("opacity", "1");
        // Windows WebKit can stall while capturing a full page with an open popover.
        // Keep its functional assertions above; traces still provide visual evidence.
        if (browser.browserType().name() !== "webkit") {
          await sharedPage.screenshot({ path: `${captureDirectory}/${size}-feed.png`, fullPage: true, animations: "disabled" });
        }
      } finally {
        await context.close();
      }
    });

    test(`root and reply drafts survive reload and target switches on ${size}`, async ({ browser }) => {
      const context = await browser.newContext({
        serviceWorkers: "block", storageState: authenticated, viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      const rootText = `尚未送出的一般留言 ${size}`;
      const firstText = `保留第一則的回覆 ${size}`;
      const secondText = `第二則有不同的草稿 ${size}`;
      try {
        await page.goto(announcementUrl);
        const rootInput = page.getByRole("textbox", { name: "Enter a comment", exact: true });
        const replyInput = page.getByRole("textbox", { name: "Enter a reply", exact: true });
        const dock = page.locator(".discussion-composer-dock");
        await rootInput.fill(rootText);
        await page.reload();
        await expect(rootInput).toHaveValue(rootText);
        await expect(dock.getByRole("status")).toHaveText("Comment draft restored.");

        await commentRow(page, firstComment).getByRole("button", { name: "Reply", exact: true }).click();
        await expect(replyInput).toHaveValue("");
        await replyInput.fill(firstText);
        await commentRow(page, secondComment).getByRole("button", { name: "Reply", exact: true }).click();
        await expect(replyInput).toHaveValue("");
        await replyInput.fill(secondText);
        await dock.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(rootInput).toHaveValue(rootText);

        await page.reload();
        await expect(rootInput).toHaveValue(rootText);
        await commentRow(page, firstComment).getByRole("button", { name: "Reply", exact: true }).click();
        await expect(replyInput).toHaveValue(firstText);
        await commentRow(page, secondComment).getByRole("button", { name: "Reply", exact: true }).click();
        await expect(replyInput).toHaveValue(secondText);
        await expect(dock.locator('[data-update-defer="true"]')).toBeVisible();
        await expect(dock.getByRole("status")).toHaveText("Comment draft restored.");
        // The assertions above verify the fixed composer. WebKit on Windows
        // can stall while scrolling this nested sheet for an element capture;
        // retain the test runner's trace instead of adding that capture here.
      } finally {
        await context.close();
      }
    });
  }
});
