// Test giao dien tu dong (trinh duyet that). Chay: npm run test:e2e
// Tu khoi dong Supabase gia lap + server app (tests/e2e/support/server.ts), khong dung du lieu that.
import { defineConfig, devices } from "@playwright/test";
import { APP_URL } from "./tests/e2e/support/env.ts";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  // Cac test dung chung 1 DB gia lap -> chay lan luot
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/e2e-report" }]],
  outputDir: "test-results/e2e-artifacts",
  use: {
    baseURL: APP_URL,
    locale: "vi-VN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests/e2e/support/server.ts",
    url: `${APP_URL}/index.html`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: "pipe"
  }
});
