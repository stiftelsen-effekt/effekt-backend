import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { NOW, settle, type Theme } from "../helpers";

/**
 * axe on the Donors and Fundraisers pages. These are app routes, so the dev sign-in and the
 * tRPC API are stubbed with small fixtures shaped like the router outputs.
 */
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const donorRow = (id: number, name: string) => ({
  id,
  name,
  email: `${name.toLowerCase().replace(/ /g, ".")}@example.org`,
  registered: "2023-08-12T17:27:19.000Z",
  lastDonation: "2026-09-02T08:07:14.000Z",
  donationsCount: 12,
  donationsSum: 15400,
  newsletter: id % 2 === 0,
});

const fixtures: Record<string, unknown> = {
  "donors.list": {
    rows: [donorRow(569, "Kari Nordmann"), donorRow(570, "Ola Hansen")],
    pages: 1,
    statistics: { totalDonors: 2, totalDonationSum: 30800, totalDonationCount: 24 },
  },
  "donors.get": {
    id: 569,
    name: "Kari Nordmann",
    email: "kari.nordmann@example.org",
    registered: "2023-08-12T17:27:19.000Z",
    newsletter: true,
    trash: false,
  },
  "donors.donations": [
    {
      id: 10629,
      donor: "Kari Nordmann",
      donorId: 569,
      email: "kari.nordmann@example.org",
      sum: "700.00",
      transactionCost: "21.93",
      timestamp: "2026-07-22T22:09:39.000Z",
      paymentMethod: "Vipps",
      KID: "000569937638223",
      taxUnitId: 569,
      metaOwnerId: 3,
    },
  ],
  "donors.donationsAggregated": [
    { ID: 1, organization: "Against Malaria Foundation", abbriv: "AMF", causeAreaID: 1, value: "650.00", year: 2026 },
    { ID: 11, organization: "Drift av Gi Effektivt", abbriv: "Drift", causeAreaID: 4, value: "50.00", year: 2026 },
    { ID: 1, organization: "Against Malaria Foundation", abbriv: "AMF", causeAreaID: 1, value: "900.00", year: 2025 },
  ],
  "donors.distributionsAggregated": [
    { KID: "000569937638223", sum: "700.00", count: 1, full_name: "Kari Nordmann", email: "kari.nordmann@example.org" },
  ],
  "donors.recurring.avtalegiro": [
    {
      ID: 1,
      active: true,
      amount: 900,
      KID: "000569937638223",
      payment_date: 11,
      created: "2023-09-14T13:45:34.000Z",
      cancelled: null,
      last_updated: "2024-10-14T13:45:34.000Z",
      notice: true,
      full_name: "Kari Nordmann",
    },
  ],
  "donors.recurring.vipps": [],
  "donors.taxUnits.list": [
    {
      id: 569,
      donorId: 569,
      name: "Kari Nordmann",
      ssn: "04466914812",
      registered: "2023-09-10T19:49:07.000Z",
      archived: null,
      sumDonations: "1550",
      numDonations: 2,
      taxDeductions: [{ year: 2026, sumDonations: 650, deduction: 650, benefit: 143 }],
    },
  ],
  "donors.referrals": [
    { id: 1, typeId: 1, donorId: 569, timestamp: "2026-10-01T10:00:00.000Z", session: null, active: true, answer: "A friend" },
  ],
  "config.organizations.listAll": [{ id: 1, name: "Against Malaria Foundation" }],
  "config.referralTypes.listAll": [{ id: 1, name: "Friends or family", ordering: 0, isActive: true }],
  "reports.fundraisers.list": {
    rows: [
      {
        id: 4,
        registered: "2026-01-25T18:00:30.000Z",
        lastUpdated: "2026-01-25T18:00:30.000Z",
        donor: { id: 569, name: "Kari Nordmann" },
        statistics: { totalSum: 2500, donationCount: 5, averageDonation: 500 },
        secret: "abc",
      },
    ],
    statistics: { totalCount: 1, totalSum: 2500, avgDonation: 500 },
    pages: 1,
  },
  "reports.fundraisers.get": {
    id: 4,
    donorId: 569,
    secret: "abc",
    registered: "2026-01-25T18:00:30.000Z",
    lastUpdated: "2026-01-25T18:00:30.000Z",
    totalSum: 500,
    donationCount: 1,
    transactions: [
      { id: 1, name: "Ola", message: "Good luck", amount: 500, date: "2026-02-01T10:00:00.000Z" },
    ],
  },
};

async function stubApi(page: Page) {
  const payload = Buffer.from(JSON.stringify({ sub: "dev", name: "Dev admin" })).toString(
    "base64url",
  );
  await page.route("**/dev-auth/**", (route) =>
    route.fulfill({ json: { access_token: `x.${payload}.y`, expires_in: 3600 } }),
  );
  await page.route("http://localhost:5999/trpc/**", (route) => {
    const paths = new URL(route.request().url()).pathname.replace("/trpc/", "").split(",");
    route.fulfill({
      json: paths.map((path) => ({ result: { data: fixtures[decodeURIComponent(path)] ?? [] } })),
    });
  });
}

async function open(page: Page, path: string, theme: Theme) {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await stubApi(page);
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  await page.goto(path);
  await settle(page);
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

for (const theme of ["light", "dark"] as Theme[]) {
  test.describe(`donors ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("donors list with filters and peek", async ({ page }) => {
      await open(page, "/donors?sum=1000..&newsletter=true&fundraiser=never", theme);
      await page.getByRole("table", { name: "Donors" }).locator("tbody tr").first().click();
      await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
      await scan(page);
    });

    test("donor page", async ({ page }) => {
      await open(page, "/donors/569", theme);
      await expect(page.getByRole("heading", { name: "Kari Nordmann" })).toBeVisible();
      await scan(page);
    });

    test("donor tax units", async ({ page }) => {
      await open(page, "/donors/569?tab=tax", theme);
      await expect(page.getByRole("region", { name: /Tax unit/ })).toBeVisible();
      await scan(page);
    });

    test("merge dialog with donor picker", async ({ page }) => {
      await open(page, "/donors/569", theme);
      await page.getByRole("button", { name: "Merge…" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await scan(page);
    });

    test("create donor dialog", async ({ page }) => {
      await open(page, "/donors", theme);
      await page.getByRole("button", { name: "Create donor" }).click();
      await expect(page.getByRole("dialog", { name: "Create donor" })).toBeVisible();
      await scan(page);
    });

    test("fundraisers list", async ({ page }) => {
      await open(page, "/fundraisers", theme);
      await page.getByRole("table", { name: "Fundraisers" }).locator("tbody tr").first().click();
      await scan(page);
    });

    test("fundraiser page", async ({ page }) => {
      await open(page, "/fundraisers/4", theme);
      await expect(page.getByRole("heading", { name: "Fundraiser #4" })).toBeVisible();
      await scan(page);
    });
  });
}
