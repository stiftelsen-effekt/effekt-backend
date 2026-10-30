import { expect, test } from "@playwright/test";
import { designRoutes, growToContent, openDesign, settle, viewports, type Theme } from "../helpers";

const themes: Theme[] = ["light", "dark"];

for (const theme of themes) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test.describe(`${device} ${theme}`, () => {
      test.use({ viewport });

      for (const route of designRoutes) {
        test(`${route.name}`, async ({ page }) => {
          await openDesign(page, route.path, theme);
          await growToContent(page, viewport.width);
          await expect(page).toHaveScreenshot(`${route.name}-${device}-${theme}.png`, {
            fullPage: true,
          });
        });
      }
    });
  }
}

// Interaction states that a static page doesn't show. Desktop only; both themes.
for (const theme of themes) {
  test.describe(`states ${theme}`, () => {
    test.use({ viewport: viewports.desktop });

    test("list with stacked panels", async ({ page }) => {
      await openDesign(page, "/design/list?amount=1000..&method=4,8", theme);
      await page
        .getByRole("table", { name: "Donations" })
        .locator("tbody tr[data-row]")
        .first()
        .click();
      const donation = page.locator("[data-slot=panel]");
      await expect(donation).toBeVisible();
      await donation
        .getByRole("link", { name: /.+/ })
        .filter({ hasNotText: "Donations" })
        .first()
        .click();
      await expect(page.getByRole("region", { name: "Donor #1387" })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`state-list-panels-${theme}.png`);
    });

    test("filter editor", async ({ page }) => {
      await openDesign(page, "/design/list?amount=1000..", theme);
      await page.locator("[data-slot=filter-chip][data-field=amount] button").first().click();
      await expect(page.getByRole("dialog", { name: "Amount filter" })).toBeVisible();
      await expect(page).toHaveScreenshot(`state-filter-editor-${theme}.png`);
    });

    test("add a filter from the menu", async ({ page }) => {
      await openDesign(page, "/design/list", theme);
      await page.getByRole("button", { name: "Add filter" }).click();
      await page.getByRole("menuitem", { name: "Payment method" }).click();
      const editor = page.getByRole("dialog", { name: "Payment method filter" });
      await expect(editor).toBeVisible();
      await editor.getByRole("checkbox").nth(2).click();
      await expect(page).toHaveURL(/method=4/);
      // Wait for the filtered rows, not the refetch in flight.
      await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
      await expect(page).toHaveScreenshot(`state-add-filter-${theme}.png`);
    });

    test("command palette", async ({ page }) => {
      await openDesign(page, "/design/list", theme);
      await page.keyboard.press("ControlOrMeta+k");
      await page.getByRole("combobox").fill("sofie");
      await expect(page.getByRole("option").first()).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`state-command-palette-${theme}.png`);
    });

    test("confirm with typed amount", async ({ page }) => {
      await openDesign(page, "/design/components", theme);
      await page.getByRole("button", { name: "Confirm with typed amount" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page).toHaveScreenshot(`state-confirm-${theme}.png`);
    });

    test("donor picker", async ({ page }) => {
      await openDesign(page, "/design/components", theme);
      await page.getByRole("combobox", { name: "Donor", exact: true }).click();
      await page.getByRole("combobox", { name: "Search donors" }).fill("hansen");
      await expect(page.getByRole("option").first()).toBeVisible();
      await settle(page);
      const picker = page.getByRole("combobox", { name: "Donor", exact: true });
      const box = (await picker.boundingBox())!;
      await expect(page).toHaveScreenshot(`state-donor-picker-${theme}.png`, {
        clip: { x: box.x - 16, y: box.y - 40, width: Math.max(box.width, 320) + 32, height: 420 },
      });
    });

    test("import flow review step", async ({ page }) => {
      await openDesign(page, "/design/flow", theme);
      await page.getByRole("radio", { name: /Bank OCR/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.locator("input[type=file]").setInputFiles({
        name: "ocr-2026-10-23.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("NY000010"),
      });
      await page.getByRole("button", { name: "Process file" }).click();
      await page.getByRole("button", { name: /Review 4 transactions/ }).click();
      await page.getByRole("radio", { name: "New distribution" }).click();
      await settle(page);
      await growToContent(page, viewports.desktop.width);
      await expect(page).toHaveScreenshot(`state-review-${theme}.png`, { fullPage: true });
    });

    test("settings with unsaved changes", async ({ page }) => {
      await openDesign(page, "/design/settings", theme);
      await page.getByRole("textbox", { name: "Climate standard share" }).fill("10");
      await expect(page.getByRole("region", { name: "Unsaved changes" })).toBeVisible();
      await expect(page).toHaveScreenshot(`state-settings-dirty-${theme}.png`);
    });
  });
}

// Phone width: a row's panel over the list, and a detail page (donor) stacked on it.
for (const theme of themes) {
  test.describe(`states narrow ${theme}`, () => {
    test.use({ viewport: viewports.narrow });

    test("list with a panel, then a detail panel", async ({ page }) => {
      await openDesign(page, "/design/list?amount=1000..&method=4,8", theme);
      await page
        .getByRole("table", { name: "Donations" })
        .locator("tbody tr[data-row]")
        .first()
        .click();
      const donation = page.locator("[data-slot=panel]");
      await expect(donation).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`state-list-panel-narrow-${theme}.png`);

      await donation
        .getByRole("link", { name: /.+/ })
        .filter({ hasNotText: "Donations" })
        .first()
        .click();
      await expect(page.getByRole("region", { name: "Donor #1387" })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`state-detail-panel-narrow-${theme}.png`);
    });
  });
}

test("compact density", async ({ page }) => {
  await page.setViewportSize(viewports.desktop);
  await page.addInitScript(() =>
    localStorage.setItem(
      "effekt-admin-preferences",
      JSON.stringify({ theme: "light", density: "compact" }),
    ),
  );
  await openDesign(page, "/design/list", "light");
  await expect(page).toHaveScreenshot("state-list-compact-light.png");
});
