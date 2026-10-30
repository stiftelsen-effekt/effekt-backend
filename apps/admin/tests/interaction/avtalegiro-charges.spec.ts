import { expect, test, type Page } from "@playwright/test";
import { stubAnalysisApi } from "../analysis-fixtures";

/**
 * AvtaleGiro charges against a stubbed API: the list (newest due date first, summary, status
 * counts, URL filters, a charge's dialog with its links) and the charges on the agreement page.
 */
const charge = (overrides: Record<string, unknown> = {}) => ({
  id: 41,
  agreementId: 167,
  KID: "000951394512895",
  dueDate: "2026-10-28",
  amount: "200.00",
  status: "COMPLETED",
  shipmentId: 301,
  deletionShipmentId: null,
  donationId: 17662,
  donorId: 951,
  donorName: "Ola Hansen",
  created: "2026-10-22T08:00:05.000Z",
  lastUpdated: "2026-10-29T18:00:00.000Z",
  ...overrides,
});

const deleted = charge({
  id: 40,
  dueDate: "2026-11-05",
  amount: "350.50",
  status: "DELETED",
  donationId: null,
  deletionShipmentId: 305,
});
/** Unpaid long after its due date */
const overdue = charge({ id: 12, dueDate: "2026-08-28", status: "CLAIMED", donationId: null });

const statuses = [
  "CLAIMED",
  "COMPLETED",
  "SUPERSEDED",
  "DELETION_REQUESTED",
  "DELETION_SENT",
  "DELETED",
];
const summary = {
  count: 3,
  sum: "750.50",
  byStatus: statuses.map((status) => ({
    status,
    count: status === "CLAIMED" ? 1 : status === "COMPLETED" ? 1 : status === "DELETED" ? 1 : 0,
    sum: "0.00",
  })),
};

const agreement = {
  ID: 167,
  active: true,
  amount: 200,
  KID: "000951394512895",
  payment_date: 28,
  created: "2025-10-12T16:31:28.000Z",
  cancelled: null,
  last_updated: "2025-11-12T17:31:28.000Z",
  notice: true,
  full_name: "Ola Hansen",
  donorId: 951,
  distribution: { kid: "000951394512895", donorId: 951, taxUnitId: null, causeAreas: [] },
};

type Input = {
  filter?: Record<string, unknown>;
  sort?: { id: string; desc: boolean };
  page: number;
};

async function signIn(page: Page, inputs: Input[]) {
  await stubAnalysisApi(page, {
    extra: {
      "giro.avtalegiro.get": agreement,
      "giro.avtalegiro.payments": { KIDs: [agreement.KID], donations: [] },
      "giro.avtalegiro.charges.byAgreement": [deleted, charge(), overdue],
    },
    overrides: {
      "giro.avtalegiro.charges.list": (input) => {
        inputs.push(input as Input);
        return { rows: [deleted, charge(), overdue], summary, pages: 1 };
      },
    },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
}

test("AvtaleGiro charges: list, summary, URL filters and a charge's links", async ({ page }) => {
  const inputs: Input[] = [];
  await signIn(page, inputs);

  // Reached from ⌘K by a Norwegian word
  await page
    .getByRole("button", { name: /^Search/ })
    .first()
    .click();
  await page.getByRole("combobox").fill("trekk");
  await page.getByRole("option", { name: /AvtaleGiro charges/ }).click();
  await expect(page).toHaveURL(/\/avtalegiro-charges/);
  await expect(page.getByRole("heading", { level: 1, name: "AvtaleGiro charges" })).toBeVisible();
  await expect.poll(() => inputs.at(-1)?.sort).toEqual({ id: "dueDate", desc: true });

  const table = page.getByRole("table", { name: "AvtaleGiro charges" });
  const first = table.getByRole("row").nth(1);
  await expect(first).toContainText("05.11.2026");
  await expect(first).toContainText("Deleted");
  await expect(first).toContainText("350,50 kr");
  await expect(table.getByRole("row").nth(2)).toContainText("Paid");

  // Totals in whole kroner, then the count per status
  const footer = page.getByText("Total", { exact: true }).locator("xpath=ancestor::ul");
  await expect(footer).toContainText("751 kr");
  await expect(footer).toContainText("Paid 1");
  await expect(footer).toContainText("Deleted 1");

  // Filters go into the URL and the request
  await page.getByRole("searchbox").fill("Ola");
  await expect.poll(() => inputs.at(-1)?.filter?.donor).toBe("Ola");
  await page.goto("/avtalegiro-charges?agreement=167&status=CLAIMED,DELETED&matched=false");
  await expect
    .poll(() => inputs.at(-1)?.filter)
    .toEqual({ agreementId: 167, statuses: ["CLAIMED", "DELETED"], matched: false });

  await table.getByRole("button", { name: "Amount" }).click();
  await expect.poll(() => inputs.at(-1)?.sort?.id).toBe("amount");

  // An overdue claim opens a dialog that says so and links to the day in the AvtaleGiro check
  await table.getByRole("row").filter({ hasText: "28.08.2026" }).getByRole("cell").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No payment has been matched");
  await expect(
    dialog.getByRole("link", { name: "Open the AvtaleGiro check for 28.08.2026" }),
  ).toHaveAttribute("href", /\/avtalegiro-check\?date=2026-08-28/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // A paid one links to its donation, donor and agreement; the agreement opens as a panel
  await table.getByRole("row").filter({ hasText: "28.10.2026" }).getByRole("cell").first().click();
  await expect(dialog.getByRole("link", { name: "#17662" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Ola Hansen" })).toBeVisible();
  await dialog.getByRole("link", { name: "167" }).click();
  await expect(page).toHaveURL(/[?&]panel=agreement%3Aavtalegiro%3A167/);
});

test("AvtaleGiro agreement: recent charges, overdue flagged, link to all charges", async ({
  page,
}) => {
  await signIn(page, []);
  await page.goto("/agreements/avtalegiro/167");

  const charges = page.getByRole("table", { name: "Charges" });
  await expect(charges.getByRole("row")).toHaveCount(4);
  await expect(charges.getByRole("row").nth(1)).toContainText("Deleted");
  await expect(charges.getByRole("row").nth(3)).toContainText("No payment");

  await page.getByRole("link", { name: "All charges" }).click();
  await expect(page).toHaveURL(/\/avtalegiro-charges\?agreement=167/);
});
