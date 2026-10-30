import { expect, test, type Page } from "@playwright/test";
import { stubAnalysisApi } from "../analysis-fixtures";

/**
 * The Cancelled agreements list against a stubbed API: newest cancellation first, the summary,
 * the reason with its tooltip, filters in the URL and the agreement panel from a row.
 */
const row = (overrides: Record<string, unknown> = {}) => ({
  provider: "avtalegiro",
  id: "1449",
  KID: "012588149336299",
  amount: "2500.00",
  created: "2025-12-28T07:55:47.000Z",
  cancelled: "2026-10-23",
  donorId: 12588,
  donorName: "Hanne Svendsen",
  hasOtherActiveAgreement: false,
  otherActiveProviders: [],
  donorStats: {
    latestDonation: "2026-10-12T00:00:00.000Z",
    donationSum: "22500.00",
    donationCount: 9,
  },
  reasons: [
    { reasonId: 11, name: "Annet", comment: "Studerer nå", recorded: "2026-10-23T19:00:00.000Z" },
  ],
  orgSplit: [],
  ...overrides,
});

const vipps = row({
  provider: "vipps",
  id: "agr_JT1001C",
  KID: "004566183196266",
  amount: "300.00",
  cancelled: "2026-10-20",
  donorId: 4566,
  donorName: "Emma Bakke",
  hasOtherActiveAgreement: true,
  otherActiveProviders: ["avtalegiro"],
  reasons: [],
});

const summary = {
  count: 2,
  withOtherActiveCount: 1,
  withReasonCount: 1,
  reasons: [{ reasonId: 11, name: "Annet", count: 1 }],
};

type Input = {
  filter?: Record<string, unknown>;
  sort?: { id: string; desc: boolean };
  page: number;
};

async function open(page: Page, inputs: Input[]) {
  await stubAnalysisApi(page, {
    extra: {
      "agreements.cancellationReasons": [
        { id: 1, name: "Økonomiske grunner", isOther: false },
        { id: 11, name: "Annet", isOther: true },
      ],
    },
    overrides: {
      "agreements.cancelled": (input) => {
        inputs.push(input as Input);
        return { rows: [row(), vipps], summary, pages: 1 };
      },
    },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
}

const text = (locator: ReturnType<Page["locator"]>) =>
  locator.innerText().then((t) => t.replace(/\s+/g, " ").trim());

test("cancelled agreements: newest first, summary, reasons, URL filters and the agreement panel", async ({
  page,
}) => {
  const inputs: Input[] = [];
  await open(page, inputs);

  // Reached from ⌘K by a Norwegian word
  await page
    .getByRole("button", { name: /^Search/ })
    .first()
    .click();
  await page.getByRole("combobox").fill("avsluttet");
  await page.getByRole("option", { name: /Cancelled agreements/ }).click();
  await expect(page).toHaveURL(/\/agreements\/cancelled/);
  await expect(page.getByRole("heading", { level: 1, name: "Cancelled agreements" })).toBeVisible();
  await expect.poll(() => inputs.at(-1)?.sort).toEqual({ id: "cancelled", desc: true });

  const table = page.getByRole("table", { name: "Cancelled agreements" });
  const first = table.getByRole("row").nth(1);
  await expect(first).toContainText("23.10.2026");
  await expect(first).toContainText("2 500,00 kr");
  await expect(first).toContainText("22 500,00 kr");
  await expect(first.getByTestId("reason")).toHaveText("Annet: “Studerer nå”");
  await expect(table.getByRole("row").nth(2)).toContainText("AvtaleGiro");

  expect(await text(page.getByTestId("top-reasons"))).toBe("Annet 1");
  await expect(page.getByText("Another active agreement")).toBeVisible();
  await expect(page.getByText("(50 %)")).toBeVisible();

  // Filters go into the URL and the request
  await page.getByRole("searchbox").fill("12588");
  await expect.poll(() => inputs.at(-1)?.filter?.donor).toBe("12588");
  await expect(page).toHaveURL(/[?&]q=12588/);

  await page.goto(
    "/agreements/cancelled?otherActive=true&reason=1,11&cancelled=2026-01-01..2026-10-31",
  );
  await expect
    .poll(() => inputs.at(-1)?.filter)
    .toEqual({
      hasOtherActiveAgreement: true,
      reasonIds: [1, 11],
      cancelled: { from: "2026-01-01", to: "2026-10-31" },
    });

  // Sorting by a donor stat
  await table.getByRole("button", { name: "Donated" }).click();
  await expect.poll(() => inputs.at(-1)?.sort?.id).toBe("donationSum");

  // A row opens the agreement as a panel over the list
  await table.getByRole("row").nth(1).click();
  await expect(page).toHaveURL(/[?&]panel=agreement%3Aavtalegiro%3A1449/);
});
