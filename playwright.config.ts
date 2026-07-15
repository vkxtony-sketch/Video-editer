import { defineConfig, devices } from "@playwright/test";

const SKIP_E2E = process.env.SKIP_E2E === "1";
const CI = !!process.env.CI;

const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!CI,
  retries: CI ? 1 : 0,
  workers: CI ? 1 : undefined,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // When SKIP_E2E is set, we still produce a config but skip running by
  // exposing 0 projects. Playwright will report 0 tests and exit 0.
  projects: SKIP_E2E
    ? []
    : [
        {
          name: "chromium",
          use: { ...devices["Desktop Chrome"] },
        },
      ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: SKIP_E2E
    ? undefined
    : {
        command: `bun dev --port ${PORT} --host 127.0.0.1`,
        url: BASE_URL,
        reuseExistingServer: !CI,
        timeout: 60_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
