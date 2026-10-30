import { defineConfig } from "cypress";
import { execFileSync } from "child_process";
import path from "path";

/**
 * Full-stack e2e: the real website -> API -> MySQL chain from compose.e2e.yml, logged in through
 * the local OIDC issuer. No fixtures or stubbed API responses, and no secrets.
 * Run with `pnpm e2e:fullstack` from the repository root (see docs/e2e.md).
 */

const repoRoot = path.resolve(__dirname, "../..");
const dbUrl =
  process.env.E2E_DB_URL ??
  `mysql://root:effekt-local@127.0.0.1:${process.env.E2E_DB_PORT ?? "3317"}/EffektDonasjonDB_Local`;

export default defineConfig({
  chromeWebSecurity: false,
  e2e: {
    setupNodeEvents(on, config) {
      require("cypress-fail-fast/plugin")(on, config);
      on("task", {
        /** Rewrites the e2e donor's rows (apps/api/prisma/e2e/seed.mjs), undoing earlier tests' changes */
        resetE2EData() {
          execFileSync("node", [path.join(repoRoot, "apps/api/prisma/e2e/seed.mjs")], {
            env: { ...process.env, DB_URL: dbUrl },
            stdio: "pipe",
          });
          return null;
        },
        /** Rows of a SELECT on the e2e database (apps/api/prisma/e2e/query.mjs) */
        queryE2EDb({ sql, params = [] }: { sql: string; params?: unknown[] }) {
          const out = execFileSync(
            "node",
            [path.join(repoRoot, "apps/api/prisma/e2e/query.mjs"), sql, JSON.stringify(params)],
            { env: { ...process.env, DB_URL: dbUrl }, stdio: ["ignore", "pipe", "pipe"] },
          );
          return JSON.parse(out.toString());
        },
      });
      return config;
    },
    supportFile: "cypress/support/e2e.js",
    baseUrl: "http://localhost:3100",
    fixturesFolder: false,
    specPattern: "cypress/e2e/fullstack/**/*.{js,jsx,ts,tsx}",
  },
  expose: {
    // Must match NEXT_PUBLIC_AUTH_DOMAIN of the web build (scripts/e2e-fullstack.sh)
    E2E_AUTH_ORIGIN: `http://localhost:${process.env.E2E_AUTH_PORT ?? "8191"}`,
  },
  retries: { runMode: 1, openMode: 0 },
  video: false,
  screenshotOnRunFailure: true,
  viewportHeight: 850,
  viewportWidth: 1280,
});
