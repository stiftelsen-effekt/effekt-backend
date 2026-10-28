import { expect, test, type Page } from "@playwright/test";
import { stubAnalysisApi } from "../analysis-fixtures";

// Driving the admin from the keyboard alone: the list cursor, panels, go-to keys, dialogs.

const rows = (page: Page) =>
  page.getByRole("table", { name: "Donations" }).locator("tbody tr[data-row]");
const panels = (page: Page) => page.locator("[data-slot=panel]");

/** The donation id of a list row (its second cell holds the id link or text). */
async function rowId(page: Page, index: number) {
  const id = await rows(page).nth(index).getAttribute("data-row-id");
  return id!;
}

async function openList(page: Page) {
  await page.goto("/design/list");
  await expect(rows(page).first()).toBeVisible();
}

test("j/k move a visible row cursor and Enter opens the row as a panel", async ({ page }) => {
  await openList(page);
  await page.keyboard.press("j");
  await expect(rows(page).nth(0)).toBeFocused();
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await page.keyboard.press("k");
  await expect(rows(page).nth(1)).toBeFocused();
  await expect(rows(page).nth(1)).toHaveAttribute("tabindex", "0");

  const id = await rowId(page, 1);
  await page.keyboard.press("Enter");
  const panel = page.getByRole("region", { name: `Donation #${id}`, exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();

  // Esc closes and focus returns to the row
  await page.keyboard.press("Escape");
  await expect(panels(page)).toHaveCount(0);
  await expect(rows(page).nth(1)).toBeFocused();
});

test("j/k in a panel swap it for the next or previous row's; f opens the full page", async ({
  page,
}) => {
  await openList(page);
  const [first, second, third] = [await rowId(page, 0), await rowId(page, 1), await rowId(page, 2)];
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: `Donation #${first}`, exact: true })).toBeVisible();

  await page.keyboard.press("j");
  await expect(
    page.getByRole("region", { name: `Donation #${second}`, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("j");
  await expect(page.getByRole("region", { name: `Donation #${third}`, exact: true })).toBeVisible();
  await page.keyboard.press("k");
  await expect(
    page.getByRole("region", { name: `Donation #${second}`, exact: true }),
  ).toBeVisible();
  await expect(panels(page)).toHaveCount(1);
  await expect(rows(page).nth(1)).toHaveAttribute("data-open", "true");
  // Swaps replace the stack: one Back (or Esc) returns to the list
  await expect(page).toHaveURL(new RegExp(`panel=donation(:|%3A)${second}$`));

  // Esc puts focus on the row whose panel was open
  await page.keyboard.press("Escape");
  await expect(panels(page)).toHaveCount(0);
  await expect(rows(page).nth(1)).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(panels(page)).toHaveCount(1);
  await page.keyboard.press("f");
  await expect(page).toHaveURL(new RegExp(`/design/donations/${second}$`));
});

test("[ and ] page the list, / focuses search and ↓ returns to the rows", async ({ page }) => {
  await openList(page);
  await page.keyboard.press("]");
  await expect(page).toHaveURL(/page=2/);
  await page.keyboard.press("[");
  await expect(page).not.toHaveURL(/page=2/);

  await page.keyboard.press("/");
  const search = page.getByRole("searchbox", { name: "Search" });
  await expect(search).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(rows(page).first()).toBeFocused();
});

test("no single-key shortcut fires while typing or under a dialog", async ({ page }) => {
  await openList(page);
  await page.keyboard.press("/");
  await page.keyboard.type("jkx[]g");
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("jkx[]g");
  await expect(page).toHaveURL(/\/design\/list/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(panels(page)).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Search" }).press("Escape");
  await page.getByRole("searchbox", { name: "Search" }).press("Escape");
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  // Lists the go-to keys from the nav
  await expect(dialog).toContainText("Donors");
  await page.keyboard.press("g");
  await page.keyboard.press("d");
  await page.keyboard.press("j");
  await expect(page).toHaveURL(/\/design\/list/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("tbody tr[data-row]:focus")).toHaveCount(0);
});

test("g then a letter goes to a page", async ({ page }) => {
  await stubAnalysisApi(page, { extra: { "donors.list": { rows: [], pages: 0, total: 0 } } });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("g");
  await page.keyboard.press("d");
  await expect(page).toHaveURL(/\/donors$/);
  await page.keyboard.press("g");
  await page.keyboard.press("r");
  await expect(page).toHaveURL(/\/import\/review(\?|$)/);
  await page.keyboard.press("g");
  await page.keyboard.press("h");
  await expect(page).toHaveURL(/\/$/);
  // g alone, then a key that isn't a page, does nothing
  await page.keyboard.press("g");
  await page.keyboard.press("z");
  await expect(page).toHaveURL(/\/$/);
});

test("dialogs focus the first field, submit on ⌘Enter and ask before Esc drops typing", async ({
  page,
}) => {
  const created: unknown[] = [];
  await stubAnalysisApi(page, {
    extra: { "donors.list": { rows: [], pages: 0, total: 0 } },
    overrides: {
      "donors.create": (input: unknown) => {
        created.push(input);
        return { id: 4242, name: "Kari Nordmann", email: "kari@example.org" };
      },
    },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  await page.goto("/donors");

  await page.getByRole("button", { name: "Create donor" }).click();
  const dialog = page.getByRole("dialog", { name: "Create donor" });
  await expect(dialog.getByRole("textbox", { name: "Email" })).toBeFocused();
  await page.keyboard.type("kari@example.org");

  // Esc with typing asks first; keeping on editing keeps what was typed
  await page.keyboard.press("Escape");
  const discard = page.getByRole("alertdialog");
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: /keep editing/i }).click();
  await expect(dialog.getByRole("textbox", { name: "Email" })).toHaveValue("kari@example.org");

  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("textbox", { name: "Name" })).toBeFocused();
  await page.keyboard.type("Kari Nordmann");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect.poll(() => created).toEqual([{ email: "kari@example.org", name: "Kari Nordmann" }]);
});
