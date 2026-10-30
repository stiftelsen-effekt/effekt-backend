import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { stubAnalysisApi } from "../analysis-fixtures";
import { NOW, settle, type Theme } from "../helpers";

/** axe on the analysis pages, with the dev sign-in and tRPC API stubbed (analysis-fixtures). */
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function open(page: Page, path: string, theme: Theme) {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await stubAnalysisApi(page);
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

for (const theme of ["light", "dark"] as Theme[]) {
  test.describe(`analysis ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("overview", async ({ page }) => {
      await open(page, "/analysis", theme);
      await expect(page.getByRole("heading", { level: 1, name: "Analysis" })).toBeVisible();
      await expect(page.locator("[data-slot=count-up]")).toHaveText("170 245 588 kr");
      await scan(page);
    });

    test("pledges", async ({ page }) => {
      await open(page, "/analysis/pledges", theme);
      await expect(page.getByRole("heading", { level: 1, name: "Pledges" })).toBeVisible();
      await scan(page);
    });

    test("add pledge dialog", async ({ page }) => {
      await open(page, "/analysis/pledges", theme);
      await page.getByRole("button", { name: "Add pledge" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Add pledge" }).click();
      await expect(page.getByText("Enter the amount")).toBeVisible();
      await scan(page);
    });

    test("mark received dialog with a donation", async ({ page }) => {
      await open(page, "/analysis/pledges", theme);
      await page.getByRole("button", { name: "Mark received" }).first().click();
      await page.getByRole("textbox", { name: "Donation ID" }).fill("75625");
      await expect(page.getByRole("link", { name: "Donation #75625" })).toBeVisible();
      await scan(page);
    });

    test("delete confirmation", async ({ page }) => {
      await open(page, "/analysis/pledges", theme);
      await page.getByRole("button", { name: /^Delete the pledge of 350 000 kr/ }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await scan(page);
    });
  });
}
