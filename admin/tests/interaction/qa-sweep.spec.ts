import { expect, test, type Page } from "@playwright/test";
import { stubAnalysisApi } from "../analysis-fixtures";

// Regressions found by using the admin against seeded data.

async function signIn(page: Page, extra: Record<string, unknown>) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  await stubAnalysisApi(page, { extra });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  return errors;
}

test("an import log entry opened directly shows its result", async ({ page }) => {
  const errors = await signIn(page, {
    "reports.logs.get": {
      ID: 1284,
      label: "OCR",
      displayLabel: "OCR",
      timestamp: "2026-10-28T20:00:00.000Z",
      result: { file: "NY000010", addedDonations: { valid: 21, invalid: 1 } },
    },
    "reports.logs.list": { rows: [], pages: 0, total: 0 },
  });
  // A link to the panel: no loader and no cached entry, so the placeholder renders first.
  await page.goto("/logs?panel=log:1284");
  await expect(page.getByRole("heading", { name: "OCR" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Result" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("addedDonations")).toBeVisible();
  expect(errors.filter((e) => /controlled|Tabs/.test(e))).toEqual([]);
});

test("Home's failed Vipps charges link to those charges", async ({ page }) => {
  const errors = await signIn(page, {
    "vipps.charges.list": {
      rows: [],
      pages: 1,
      statistics: { numCharges: 3, sumCharges: "900", avgCharge: "300" },
    },
  });
  const link = page.getByRole("link", { name: /Failed Vipps charges/ });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/charges\?status=FAILED&due=\d{4}-\d{2}-01\.\.\d{4}-\d{2}-\d{2}$/);
  expect(errors.filter((e) => /numCharges/.test(e))).toEqual([]);
});
