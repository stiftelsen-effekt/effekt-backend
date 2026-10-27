import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { NOW, settle, type Theme } from "../helpers";
import { stubRegrantingApi } from "../regranting-fixtures";

/** axe on the regranting pages, with the dev sign-in and tRPC API stubbed (regranting-fixtures). */
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function open(page: Page, path: string, theme: Theme) {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await stubRegrantingApi(page);
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  await page.goto(path);
  await settle(page);
}

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

const pages = [
  { name: "balances", path: "/regranting", heading: "Balances" },
  { name: "rounds", path: "/regranting/rounds", heading: "Rounds" },
  { name: "round builder", path: "/regranting/rounds/7", heading: "September 2026 regular round" },
  {
    name: "recipient statement",
    path: "/regranting/recipients/1",
    heading: "Statement: GiveWell All Grants Fund",
  },
  { name: "projects", path: "/regranting/projects", heading: "Projects" },
  { name: "project page", path: "/regranting/projects/3", heading: "Cash transfers in Malawi" },
  { name: "adjustments", path: "/regranting/adjustments", heading: "Adjustments" },
  { name: "payees", path: "/regranting/settings", heading: "Payees & funds" },
  { name: "routing", path: "/regranting/settings?section=routing", heading: "Payees & funds" },
  { name: "own funds", path: "/regranting/settings?section=funds", heading: "Payees & funds" },
  { name: "holds", path: "/regranting/settings?section=holds", heading: "Payees & funds" },
];

for (const theme of ["light", "dark"] as Theme[]) {
  test.describe(`regranting ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    for (const p of pages) {
      test(p.name, async ({ page }) => {
        await open(page, p.path, theme);
        await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
        await scan(page);
      });
    }

    test("balances with an expanded recipient and peek", async ({ page }) => {
      await open(page, "/regranting", theme);
      await page.getByRole("button", { name: "Show projects of GiveDirectly" }).click();
      await page.getByRole("table", { name: "Balances" }).locator("tbody tr").nth(1).click();
      await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
      await scan(page);
    });

    test("new round dialog", async ({ page }) => {
      await open(page, "/regranting/rounds", theme);
      await page.getByRole("button", { name: "New round" }).click();
      await page.getByRole("radio", { name: /Major donor/ }).click();
      await expect(page.getByRole("dialog", { name: "New round" })).toBeVisible();
      await scan(page);
    });

    test("approve confirmation", async ({ page }) => {
      await open(page, "/regranting/rounds/7", theme);
      await page.getByRole("button", { name: "Approve round" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await scan(page);
    });

    test("fund grant dialog", async ({ page }) => {
      await open(page, "/regranting/rounds/7", theme);
      await page.getByRole("button", { name: "Grant from GEBF" }).click();
      await expect(page.getByRole("dialog", { name: /Grant from/ })).toBeVisible();
      await scan(page);
    });

    test("new adjustment dialog", async ({ page }) => {
      await open(page, "/regranting/adjustments", theme);
      await page.getByRole("button", { name: "New adjustment" }).click();
      await expect(page.getByRole("dialog", { name: "New adjustment" })).toBeVisible();
      await scan(page);
    });
  });
}
