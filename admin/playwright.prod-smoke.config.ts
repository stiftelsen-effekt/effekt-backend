import { defineConfig, devices } from "@playwright/test";
import { devPort } from "./scripts/dev-port.mjs";

/**
 * Production-build smoke test: `vite build` with Auth0 auth (as deployed), served by `vite
 * preview`. The Auth0 tenant is fake and every request to it is stubbed in the test, so this
 * needs neither the network nor the API. Catches crashes that only happen with the real auth
 * provider, which the dev-auth suites never load.
 *
 *   pnpm test:prod-smoke      (part of `pnpm gate`)
 */
// Own port, next to the checkout's dev-server port range (4400-4999), so it never reuses a dev server.
const port = devPort() + 1000;

export const smokeAuth = {
  domain: "auth.smoke.test",
  clientId: "prod-smoke",
  audience: "https://api.smoke.test",
} as const;

export default defineConfig({
  testDir: "tests/prod-smoke",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  outputDir: "test-results/prod-smoke",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${port}`,
    locale: "nb-NO",
    timezoneId: "Europe/Oslo",
    trace: "retain-on-failure",
  },
  webServer: {
    // One build per run, into node_modules so it never lands next to a real dist/.
    command:
      `pnpm exec vite build --outDir node_modules/.prod-smoke --emptyOutDir --logLevel error && ` +
      `pnpm exec vite preview --outDir node_modules/.prod-smoke --port ${port} --strictPort`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    env: {
      VITE_AUTH_MODE: "auth0",
      VITE_AUTH_DOMAIN: smokeAuth.domain,
      VITE_AUTH_CLIENT_ID: smokeAuth.clientId,
      VITE_AUTH_AUDIENCE: smokeAuth.audience,
      VITE_API_URL: "https://api.smoke.test",
      VITE_FEATURE_REGRANTING: "false",
    },
    timeout: 60_000,
  },
});
