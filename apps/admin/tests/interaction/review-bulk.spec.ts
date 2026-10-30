import { expect, test, type Page } from "@playwright/test";
import { stubAnalysisApi } from "../analysis-fixtures";

/** Ignoring several review items at once: the ticked ones, or all open from one import. */
const item = (id: number, importLogId: number | null = 88) => ({
  id,
  source: "vipps",
  reason: "Could not find valid KID or matching parsing rule",
  KID: null,
  amount: "250.00",
  date: "2026-10-24T00:00:00.000Z",
  externalId: `vipps.${id}`,
  paymentId: 4,
  message: null,
  name: null,
  location: "Gi Slæpp - Til inntekt for A-vitamin",
  importLogId,
  metaOwnerId: null,
  status: "open",
  resolvedBy: null,
  resolvedAt: null,
  note: null,
  donationId: null,
  created: "2026-10-29T10:00:00.000Z",
});

const rows = [item(11), item(12), item(13), item(14, 90)];

async function openQueue(page: Page, overrides: Record<string, (input: unknown) => unknown>) {
  await stubAnalysisApi(page, {
    overrides,
    extra: {
      "reports.reviewQueue.counts": { open: 30, registered: 0, ignored: 0 },
      "reports.reviewQueue.list": {
        rows,
        total: rows.length,
        pages: 1,
        counts: { open: 30, registered: 0, ignored: 0 },
      },
    },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  await page.goto("/import/review");
  await expect(page.getByRole("table", { name: "Review queue" })).toBeVisible();
}

const tick = (page: Page, id: number) =>
  page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: String(id), exact: true }) })
    .getByRole("checkbox", { name: "Select row" })
    .click();

test("ignoring the ticked items sends them with one note", async ({ page }) => {
  const calls: unknown[] = [];
  await openQueue(page, {
    "reports.reviewQueue.ignoreMany": (input: unknown) => {
      calls.push(input);
      return { ignored: 2, skipped: 0 };
    },
    "reports.reviewQueue.importOpenCount": () => ({ importLogId: 88, open: 2 }),
  });
  await tick(page, 11);
  await tick(page, 12);
  // Two of two open from import 88 are ticked, so there is nothing more to offer for the import
  await expect(page.getByRole("button", { name: /from this import/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Ignore selected" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Ignore 2 items?" });
  await dialog.getByRole("textbox", { name: "Note" }).fill("Wrong file uploaded");
  await dialog.getByRole("button", { name: "Ignore 2 items" }).click();
  await expect(dialog).toBeHidden();
  expect(calls).toEqual([{ ids: [11, 12], note: "Wrong file uploaded" }]);
  await expect(page.getByText("Ignored 2 items")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ignore selected" })).toHaveCount(0);
});

test("ticked items from one import offer to ignore all its open items", async ({ page }) => {
  const calls: unknown[] = [];
  await openQueue(page, {
    "reports.reviewQueue.importOpenCount": () => ({ importLogId: 88, open: 312 }),
    "reports.reviewQueue.ignoreImport": (input: unknown) => {
      calls.push(input);
      return { ignored: 312 };
    },
  });
  await tick(page, 11);
  await page.getByRole("button", { name: "Ignore all 312 open from this import" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: /Ignore all 312 items still open from import #88/,
  });
  await dialog.getByRole("button", { name: "Ignore 312 items" }).click();
  await expect(dialog).toBeHidden();
  expect(calls).toEqual([{ importLogId: 88 }]);

  // Rows from two imports: only the ticked ones can be ignored
  await tick(page, 12);
  await tick(page, 14);
  await expect(page.getByRole("button", { name: "Ignore selected" })).toBeVisible();
  await expect(page.getByRole("button", { name: /from this import/ })).toHaveCount(0);
});
