import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { NOW, settle, type Theme } from "../helpers";

/**
 * axe on the Money in pages (donations, distributions, registering a donation). These are app
 * routes, so the dev sign-in and the tRPC API are stubbed with small fixtures shaped like the
 * router outputs.
 */
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const org = (id: number, causeAreaId: number, name: string, standardShare: number) => ({
  id,
  causeAreaId,
  name,
  standardShare,
  isActive: true,
  ordering: id,
});
const causeAreas = [
  {
    id: 1,
    name: "Global health",
    standardPercentageShare: 80,
    shortDescription: null,
    longDescription: null,
    informationUrl: null,
    isActive: true,
    ordering: 1,
    organizations: [
      org(1, 1, "Against Malaria Foundation", 60),
      org(2, 1, "Helen Keller Intl", 40),
    ],
  },
  {
    id: 2,
    name: "Animal welfare",
    standardPercentageShare: 20,
    shortDescription: null,
    longDescription: null,
    informationUrl: null,
    isActive: true,
    ordering: 2,
    organizations: [org(3, 2, "The Humane League", 100)],
  },
];

const split = {
  kid: "000569937638223",
  donorId: 569,
  taxUnitId: 569,
  causeAreas: [
    {
      id: 1,
      name: "Global health",
      percentageShare: "80.000000000000000",
      standardSplit: false,
      organizations: [
        { id: 1, name: "Against Malaria Foundation", percentageShare: "100.000000000000000" },
      ],
    },
    {
      id: 2,
      name: "Animal welfare",
      percentageShare: "20.000000000000000",
      standardSplit: true,
      organizations: [{ id: 3, name: "The Humane League", percentageShare: "100.000000000000000" }],
    },
  ],
};

const donation = {
  id: 10629,
  donor: "Kari Nordmann",
  donorId: 569,
  email: "kari.nordmann@example.org",
  sum: "700.00",
  transactionCost: "21.93",
  timestamp: "2026-07-22T22:09:39.000Z",
  paymentId: 4,
  paymentExternalRef: "2003154",
  paymentMethod: "Vipps KID",
  KID: split.kid,
  metaOwnerId: 3,
  fundraiserId: null,
  distribution: split,
};

const fixtures: Record<string, unknown> = {
  "donations.list": {
    rows: [
      {
        id: 10629,
        donor: "Kari Nordmann",
        paymentMethod: "Vipps KID",
        sum: "700.00",
        transactionCost: "21.93",
        kid: split.kid,
        timestamp: "2026-07-22T22:09:39.000Z",
        taxUnitType: "person",
      },
      {
        id: 10630,
        donor: "Ola Hansen",
        paymentMethod: "Bank",
        sum: "1234.50",
        transactionCost: null,
        kid: "19926716",
        timestamp: "2026-07-21T10:00:00.000Z",
        taxUnitType: null,
      },
    ],
    statistics: { numDonations: 2, sumDonations: "1934.50", avgDonation: "967.25" },
    pages: 1,
  },
  "donations.histogram": [
    { bucket: 0, items: 120, bar: 900 },
    { bucket: 5000, items: 12, bar: 400 },
    { bucket: 10000, items: 2, bar: 100 },
  ],
  "donations.get": donation,
  "donations.byKid": [
    {
      id: 10629,
      sum: "700.00",
      transactionCost: "21.93",
      timestamp: "2026-07-22T22:09:39.000Z",
      paymentMethod: "Vipps KID",
      KID: split.kid,
    },
  ],
  "donations.distributions.list": {
    rows: [
      {
        KID: split.kid,
        full_name: "Kari Nordmann",
        email: "kari.nordmann@example.org",
        donation_sum: "700.00",
        donation_count: 1,
      },
    ],
    statistics: { numDistributions: 1 },
    pages: 1,
  },
  "donations.distributions.get": {
    ...split,
    donor: {
      id: 569,
      name: "Kari Nordmann",
      email: "kari.nordmann@example.org",
      registered: "2023-08-12T17:27:19.000Z",
      newsletter: true,
      trash: false,
    },
    taxUnit: { id: 569, donorId: 569, name: "Kari Nordmann", ssn: "04466914812", archived: null },
  },
  "config.causeAreas.listActive": causeAreas,
  "config.causeAreas.listAll": causeAreas,
  "config.paymentMethods.list": [
    { id: 2, name: "Bank", abbriviation: "Bank" },
    { id: 4, name: "Vipps KID", abbriviation: "Vipps KID" },
    { id: 11, name: "AutoGiro", abbriviation: "AutoGiro" },
  ],
  "meta.owners": [
    { id: 1, name: "Effekt", default: false },
    { id: 3, name: "EAN + Effekt", default: true },
  ],
  "donors.get": {
    id: 569,
    name: "Kari Nordmann",
    email: "kari.nordmann@example.org",
    registered: "2023-08-12T17:27:19.000Z",
    newsletter: true,
    trash: false,
  },
  "donors.taxUnits.list": [],
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
  test.describe(`money ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("donations list with filters and peek", async ({ page }) => {
      await open(page, "/donations?amount=100..1000&method=4&taxUnit=person,none", theme);
      await page.getByRole("table", { name: "Donations" }).locator("tbody tr").first().click();
      await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
      await scan(page);
    });

    test("donation page", async ({ page }) => {
      await open(page, "/donations/10629", theme);
      await expect(page.getByRole("heading", { name: "700 kr" })).toBeVisible();
      await scan(page);
    });

    test("delete donation dialog", async ({ page }) => {
      await open(page, "/donations/10629", theme);
      await page.getByRole("button", { name: "Delete…" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await scan(page);
    });

    test("edit donation with money confirmation", async ({ page }) => {
      await open(page, "/donations/10629/edit", theme);
      await page.getByRole("textbox", { name: "Amount" }).fill("750");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await scan(page);
    });

    test("register donation", async ({ page }) => {
      await open(page, "/donations/register", theme);
      await page.getByRole("button", { name: "Check" }).click();
      await scan(page);
    });

    test("distributions list", async ({ page }) => {
      await open(page, "/distributions?kid=000569", theme);
      await page.getByRole("table", { name: "Distributions" }).locator("tbody tr").first().click();
      await scan(page);
    });

    test("distribution page", async ({ page }) => {
      await open(page, `/distributions/${split.kid}`, theme);
      await expect(page.getByRole("heading", { name: `KID ${split.kid}` })).toBeVisible();
      await scan(page);
    });

    test("create distribution", async ({ page }) => {
      await open(page, "/distributions/new", theme);
      await scan(page);
    });
  });
}
