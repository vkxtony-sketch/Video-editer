import { test, expect } from "@playwright/test";

test.describe("Studio", () => {
  test("renders the Studio page scaffold for an arbitrary project id", async ({ page }) => {
    await page.goto("/studio/abc123");
    // Without a backend the page settles on the loading skeleton; either way it
    // must not crash. We just assert the root tree mounted.
    await expect(page.locator("#root")).toBeVisible();
    // Brand chrome should be visible
    await expect(page.getByText(/Neon AI Lab/i).first()).toBeVisible();
  });

  test("renders the Empty skeleton state for an invalid id", async ({ page }) => {
    await page.goto("/studio/test-id");
    // The skeleton state surfaces an indefinite loading panel (animate-pulse) -
    // we just want to confirm the page did not throw a runtime error.
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    const errorOverlay = page.locator("vite-error-overlay");
    await expect(errorOverlay).toHaveCount(0);
  });
});
