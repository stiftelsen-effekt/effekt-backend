import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { settle, viewports, type Theme } from "../helpers";

/**
 * axe on the real feature pages, against a running admin with the local dev stack (seeded
 * API + mock auth). Skipped unless A11Y_APP_URL points at that admin, e.g.
 *
 *   VITE_AUTH_MODE=dev VITE_API_URL=http://localhost:5050 pnpm dev --port 5203
 *   A11Y_APP_URL=http://localhost:5203 pnpm test:a11y app.spec
 */
const appUrl = process.env.A11Y_APP_URL?.replace(/\/$/, "");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const appRoutes = [
  { name: "home", path: "/" },
  { name: "settings: cause areas", path: "/settings" },
  { name: "settings: referral types", path: "/settings?section=referrals" },
  { name: "settings: data owners", path: "/settings?section=owners" },
  { name: "settings: matching rules", path: "/settings?section=matching" },
  { name: "import log", path: "/logs" },
  { name: "reports", path: "/reports" },
  { name: "import", path: "/import" },
  { name: "review queue", path: "/import/review?status=open,registered,ignored" },
  { name: "review item", path: "/import/review/1" },
];

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

async function open(page: Page, path: string, theme: Theme) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.goto(`${appUrl}${path}`);
  const signIn = page.getByRole("button", { name: /sign in with dev token/i });
  if (await signIn.isVisible().catch(() => false)) {
    await signIn.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }
  await settle(page);
}

test.describe("app pages", () => {
  test.skip(!appUrl, "Set A11Y_APP_URL to a running admin with the dev stack");
  test.use({ viewport: viewports.desktop });

  for (const theme of ["light", "dark"] as Theme[]) {
    for (const route of appRoutes) {
      test(`${theme}: ${route.name}`, async ({ page }) => {
        await open(page, route.path, theme);
        await scan(page);
      });
    }

    test(`${theme}: import log entry`, async ({ page }) => {
      await open(page, "/logs", theme);
      const firstId = page
        .getByRole("table", { name: "Import log" })
        .locator("tbody tr")
        .first()
        .locator("td")
        .first();
      await expect(firstId).toHaveText(/^\d+$/);
      await open(page, `/logs/${(await firstId.textContent())!.trim()}`, theme);
      await scan(page);
    });
  }
});
