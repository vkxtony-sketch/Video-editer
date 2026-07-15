import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("renders the New project button on a clean dashboard", async ({ page, context }) => {
    // Use a fresh session id per browser context so projects.list is empty.
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("neon:session", `u_pw_${Math.random()}`);
      } catch (_e) {
        /* ignore */
      }
    });
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /New project/i })).toBeVisible();
  });

  test("shows the empty state when no projects exist for the session", async ({ page, context }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("neon:session", `u_pw_empty_${Math.random()}`);
      } catch (_e) {
        /* ignore */
      }
    });
    await page.goto("/dashboard");
    await expect(page.getByText(/No projects yet/i)).toBeVisible();
  });

  test("brand link returns to landing", async ({ page }) => {
    await page.goto("/dashboard");
    const brand = page.locator("a").filter({ hasText: /Neon AI Lab/i }).first();
    await brand.click();
    await page.waitForURL(/.*\//);
    await expect(page).toHaveURL(/\/$|\/index\.html/);
  });
});
