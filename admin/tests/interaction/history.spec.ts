import { expect, test, type Page } from "@playwright/test";

// List state lives in the URL. Discrete changes (filter, sort, page) are history entries, so
// Back undoes them one at a time instead of leaving the list; refining a search replaces its
// entry.

async function openList(page: Page) {
  // Start somewhere else so "Back past the list" has somewhere to go.
  await page.goto("/design");
  await page.getByRole("link", { name: "List", exact: true }).first().click();
  await expect(page).toHaveURL(/\/design\/list$/);
  await expect(
    page.getByRole("table", { name: "Donations" }).getByRole("row").nth(1),
  ).toBeVisible();
}

test("filter, sort and page each add a history entry", async ({ page }) => {
  await openList(page);

  await page
    .getByRole("button", { name: /^(add filter|filter)$/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Payment method", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Payment method filter" })
    .getByRole("checkbox")
    .first()
    .click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/[?&]method=/);

  await page.getByRole("button", { name: "Amount", exact: true }).click();
  await expect(page).toHaveURL(/[?&]sort=/);

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/[?&]page=2/);

  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
  await expect(page).toHaveURL(/[?&]sort=/);

  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]sort=/);
  await expect(page).toHaveURL(/[?&]method=/);

  await page.goBack();
  await expect(page).toHaveURL(/\/design\/list$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/design$/);
});

test("refining a search replaces its entry; Back clears the search", async ({ page }) => {
  await openList(page);
  const search = page.getByRole("searchbox", { name: "Search" });

  await search.fill("ka");
  await expect(page).toHaveURL(/[?&]q=ka(&|$)/);
  await search.fill("kar");
  await expect(page).toHaveURL(/[?&]q=kar(&|$)/);
  await search.fill("kari");
  await expect(page).toHaveURL(/[?&]q=kari(&|$)/);

  await page.goBack();
  await expect(page).toHaveURL(/\/design\/list$/);
  await expect(search).toHaveValue("");
});
