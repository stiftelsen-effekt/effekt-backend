import { expect, test, type Page } from "@playwright/test";

// Rows open their record as a panel over the list; links in a panel stack another on top.
// The stack is the `panel` search param, so Back, reload and copied links keep it.

const panels = (page: Page) => page.locator("[data-slot=panel]:not([data-closing])");
const donorPanel = (page: Page) => page.getByRole("region", { name: "Donor #1387" });

async function openFirstDonation(page: Page) {
  await page.goto("/design/list");
  const row = page.getByRole("table", { name: "Donations" }).locator("tbody tr[data-row]").first();
  await row.click();
  await expect(page).toHaveURL(/[?&]panel=donation(:|%3A)\d+($|&)/);
  const id = /donation(?::|%3A)(\d+)/.exec(page.url())![1]!;
  const panel = page.getByRole("region", { name: `Donation #${id}`, exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { level: 1 })).toBeVisible();
  return { row, panel, id };
}

async function stackDonor(page: Page, panel: ReturnType<Page["getByRole"]>) {
  await panel.getByRole("link", { name: /.+/ }).filter({ hasNotText: "Donations" }).first().click();
  await expect(donorPanel(page)).toBeVisible();
  await expect(page).toHaveURL(/panel=donation(:|%3A)\d+(,|%2C)donor($|&)/);
}

test("a row opens a panel, a link stacks another, Esc closes the top", async ({ page }) => {
  const { panel } = await openFirstDonation(page);
  await stackDonor(page, panel);
  await expect(panels(page)).toHaveCount(2);

  await page.keyboard.press("Escape");
  await expect(donorPanel(page)).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(page).not.toHaveURL(/donor/);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/design\/list$/);
});

test("Back pops one panel", async ({ page }) => {
  const { panel } = await openFirstDonation(page);
  await stackDonor(page, panel);
  await page.goBack();
  await expect(donorPanel(page)).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.goBack();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/design\/list$/);
});

test("reload keeps the stack", async ({ page }) => {
  const { panel } = await openFirstDonation(page);
  await stackDonor(page, panel);
  await page.reload();
  await expect(panel).toBeVisible();
  await expect(donorPanel(page)).toBeVisible();
  await expect(panels(page)).toHaveCount(2);
  // The lower panel's edge closes the one above it.
  await panel
    .getByRole("button", { name: /^Back to Donation/ })
    .click({ position: { x: 4, y: 300 } });
  await expect(donorPanel(page)).toHaveCount(0);
  await expect(panel).toBeVisible();
});

test("Full page goes to the record's own route", async ({ page }) => {
  const { panel, id } = await openFirstDonation(page);
  await panel.getByRole("button", { name: "Open full page" }).click();
  await expect(page).toHaveURL(new RegExp(`/design/donations/${id}$`));
  await expect(panels(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("focus moves into the panel and back to the row", async ({ page }) => {
  await page.goto("/design/list");
  const row = page.getByRole("table", { name: "Donations" }).locator("tbody tr[data-row]").nth(2);
  await row.focus();
  await page.keyboard.press("Enter");
  const panel = page.locator("[data-slot=panel]");
  await expect(panel).toBeFocused();
  await expect(row).toHaveAttribute("data-open", "true");

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(row).toBeFocused();
});
