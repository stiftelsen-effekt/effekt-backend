import { expect, test, type Page } from "@playwright/test";
import { viewports } from "../helpers";

// The admin on a phone: the sidebar is a menu button and drawer, panels take the full width,
// and nothing scrolls the page sideways.
test.use({ viewport: viewports.narrow });

async function expectNoSideways(page: Page) {
  const overflow = await page.evaluate(() => {
    const scroller = document.querySelector("[data-page-scroll]");
    return Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
    );
  });
  expect(overflow).toBe(0);
}

test("menu, navigate, open a row panel and close it at 390 px", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // measure the panel, not its slide-in
  await page.goto("/design/detail");
  await expectNoSideways(page);

  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Design system" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/\/design$/);

  await page.getByRole("link", { name: "List", exact: true }).click();
  await expect(page).toHaveURL(/\/design\/list$/);
  await expectNoSideways(page);

  await page
    .getByRole("table", { name: "Donations" })
    .locator("tbody tr[data-row]")
    .first()
    .click();
  const panel = page.locator("[data-slot=panel]");
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(viewports.narrow.width);

  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator("[data-slot=panel-stack]")).toHaveCount(0);
  await expect(page).toHaveURL(/\/design\/list$/);
});

test("the search button in the top bar opens ⌘K", async ({ page }) => {
  await page.goto("/design/list");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("combobox")).toBeFocused();
});
