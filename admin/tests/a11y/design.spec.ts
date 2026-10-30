import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { designRoutes, openDesign, viewports, type Theme } from "../helpers";

/**
 * Automated WCAG 2.1 A/AA checks with axe on every /design page and the main interaction
 * states, in both themes. Automated checks catch roughly a third of issues; keyboard and
 * screen reader checks are in DESIGN.md › Accessibility.
 */
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: import("@playwright/test").Page) {
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
  test.describe(theme, () => {
    test.use({ viewport: viewports.desktop });

    for (const route of designRoutes) {
      test(route.name, async ({ page }) => {
        await openDesign(page, route.path, theme);
        await scan(page);
      });
    }

    test("list with peek and active filters", async ({ page }) => {
      await openDesign(page, "/design/list?amount=1000..&method=4", theme);
      await page.getByRole("table", { name: "Donations" }).locator("tbody tr").first().click();
      await scan(page);
    });

    test("command palette", async ({ page }) => {
      await openDesign(page, "/design/list", theme);
      await page.keyboard.press("ControlOrMeta+k");
      await page.getByRole("combobox").fill("sofie");
      await expect(page.getByRole("option").first()).toBeVisible();
      await scan(page);
    });

    test("confirm dialog", async ({ page }) => {
      await openDesign(page, "/design/components", theme);
      await page.getByRole("button", { name: "Confirm with typed amount" }).click();
      await scan(page);
    });
  });
}

test("narrow navigation sheet", async ({ page }) => {
  await page.setViewportSize(viewports.narrow);
  await openDesign(page, "/design/list", "light");
  await page.getByRole("button", { name: "Open menu" }).click();
  await scan(page);
});
