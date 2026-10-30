import { expect, test, type Page } from "@playwright/test";
import { stubAnalysisApi } from "../analysis-fixtures";
import { donor } from "../donor-register-fixtures";

/**
 * Donation intents against a stubbed API: the donor page's callout for unpaid intents, the
 * Intents list's URL filters, and the Home attention item that links to it.
 */
const intent = (overrides: Record<string, unknown> = {}) => ({
  id: 25135,
  KID: "000569112233445",
  donorId: donor.id,
  donorName: donor.name,
  amount: "5000.00",
  methodId: 2,
  method: "Bank",
  created: "2026-10-12T10:00:00.000Z",
  status: "awaiting",
  newDonor: true,
  matchedDonation: null,
  followUps: { count: 1, last: "2026-10-19T06:00:00.000Z" },
  ...overrides,
});

const received = intent({
  id: 20001,
  methodId: 7,
  method: "AvtaleGiro",
  amount: "250.00",
  created: "2026-03-02T10:00:00.000Z",
  status: "received",
  newDonor: false,
  matchedDonation: { id: 75625, date: "2026-03-20T00:00:00.000Z", sum: "250.00" },
  followUps: { count: 0, last: null },
});

async function signIn(page: Page, options: Parameters<typeof stubAnalysisApi>[1]) {
  await stubAnalysisApi(page, options);
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
}

const text = (locator: ReturnType<Page["locator"]>) =>
  locator.innerText().then((t) => t.replace(/\s+/g, " ").trim());

test("a new donor's unpaid bank intent is a warning at the top of the donor page", async ({
  page,
}) => {
  await signIn(page, {
    extra: { "donors.get": donor, "intents.forDonor": [intent(), received] },
  });
  await page.goto("/donors/569");

  const callout = page.locator("[data-slot=callout]").filter({ hasText: "first payment" });
  await expect(callout).toBeVisible();
  await expect(callout).toHaveAttribute("role", "alert");
  expect(await text(callout.getByTestId("awaiting-intents"))).toBe(
    "Said they'd give 5 000,00 kr by bank transfer on 12.10.2026 · not received yet · reminder sent 19.10.2026 · KID 000569112233445",
  );

  // History, received one included, in the Intents tab
  await page.getByRole("tab", { name: /Intents/ }).click();
  await expect(page).toHaveURL(/[?&]tab=intents/);
  const table = page.getByRole("table", { name: "Donation intents" });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table).toContainText("Received");
  await expect(table.getByRole("link", { name: /250,00 kr on 20\.03\.2026/ })).toBeVisible();
});

test("a returning donor's unpaid intent is a quiet note; none when everything arrived", async ({
  page,
}) => {
  let intents = [intent({ newDonor: false, followUps: { count: 0, last: null } })];
  await signIn(page, {
    extra: { "donors.get": donor },
    overrides: { "intents.forDonor": () => intents },
  });
  await page.goto("/donors/569");
  const callout = page.locator("[data-slot=callout]").filter({ hasText: "Said they'd give" });
  await expect(callout).toHaveAttribute("role", "status");
  await expect(callout).toContainText("Payment said, not received yet");
  await expect(callout).not.toContainText("reminder");

  intents = [received];
  await page.goto("/donors/570");
  await expect(page.getByRole("tab", { name: /Intents/ })).toBeVisible();
  await expect(
    page.locator("[data-slot=callout]").filter({ hasText: "Said they'd give" }),
  ).toHaveCount(0);
});

test("Home links to the new donors waiting on a first payment, and the list keeps its filters in the URL", async ({
  page,
}) => {
  const listInputs: { filter?: Record<string, unknown>; sort?: unknown; page: number }[] = [];
  await signIn(page, {
    extra: { "donors.get": donor, "intents.forDonor": [intent()] },
    overrides: {
      "intents.attention": () => ({ donors: 3, intents: 4, days: 30, methodIds: [2, 7] }),
      "intents.list": (input) => {
        listInputs.push(input as (typeof listInputs)[number]);
        return {
          rows: [{ ...intent(), orgSplit: [] }],
          count: 1,
          pages: 1,
        };
      },
    },
  });
  await page.goto("/");

  const item = page.getByRole("link", { name: /See intents/ });
  await expect(
    page.getByText("New donors waiting on their first bank/AvtaleGiro payment"),
  ).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(/\/intents\?/);
  await expect(page.getByRole("heading", { level: 1, name: "Intents" })).toBeVisible();
  await expect
    .poll(() => listInputs.at(-1)?.filter)
    .toEqual({
      statuses: ["awaiting"],
      methodIds: [2, 7],
      newDonorsOnly: true,
    });

  // Adding a status keeps the others and goes into the URL
  await page
    .locator("[data-slot=filter-chip][data-field=status]")
    .getByRole("button")
    .first()
    .click();
  const editor = page.getByRole("dialog", { name: "Status filter" });
  await editor.getByRole("checkbox", { name: "Received", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/status=awaiting(%2C|,)received/);
  await expect.poll(() => listInputs.at(-1)?.filter?.statuses).toEqual(["awaiting", "received"]);

  // Searching by KID
  await page.getByRole("searchbox").fill("000569112233445");
  await expect.poll(() => listInputs.at(-1)?.filter?.KID).toBe("000569112233445");

  // A row opens the donor as a panel over the list, with the unpaid intent on top
  const table = page.getByRole("table", { name: "Intents" });
  await expect(table).toContainText("5 000,00 kr");
  await table.getByRole("row").nth(1).click();
  await expect(page).toHaveURL(/[?&]panel=donor%3A569/);
  await expect(page.getByText("Waiting on this donor's first payment")).toBeVisible();
});
