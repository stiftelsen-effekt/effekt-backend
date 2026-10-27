import { defineConfig, devices } from "@playwright/test";

/**
 * Stability tooling for the design system. Runs against /design, which needs neither the
 * API nor auth, on a dedicated Vite server.
 *
 *   pnpm test:visual          compare screenshots with the committed baselines
 *   pnpm test:visual:update   accept intended visual changes (review the diff first!)
 *   pnpm test:a11y            axe WCAG 2.1 A/AA checks, light and dark
 *
 * Baselines are per platform (the file names end in -darwin / -linux). CI should run in the
 * official Playwright Docker image and keep its own linux baselines.
 */
// Each checkout can pick its own port (PW_PORT) so parallel worktrees never test each other's
// dev server. An already running server is only reused when PW_REUSE_SERVER=1.
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/{testFileDir}/__screenshots__/{arg}-{platform}{ext}",
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 24,
      threshold: 0.15,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "nb-NO",
    timezoneId: "Europe/Oslo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "visual", testDir: "tests/visual", use: { ...devices["Desktop Chrome"] } },
    { name: "a11y", testDir: "tests/a11y", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}/design`,
    reuseExistingServer: process.env.PW_REUSE_SERVER === "1",
    env: { VITE_AUTH_MODE: "dev", VITE_LOCALE: "NO", VITE_API_URL: "http://localhost:5999" },
    timeout: 60_000,
  },
});
