import { test, expect } from "@playwright/test";

test.describe("Landing", () => {
  test("renders the Neon AI Lab brand and the hero headline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Neon AI Lab/i).first()).toBeVisible();
    await expect(page.getByText(/24-hour recording/i)).toBeVisible();
    await expect(page.getByText(/five-minute highlight/i)).toBeVisible();
  });

  test("renders both call-to-action buttons", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Open Studio/i }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Try the 12-hour sample|Try the sample/i }).first(),
    ).toBeVisible();
  });

  test("Open Studio CTA navigates to /dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Open Studio/i }).first().click();
    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
