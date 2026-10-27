import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { NOW, settle, type Theme } from "../helpers";

/**
 * axe on the Agreements pages (list, Vipps and AvtaleGiro agreement pages, Vipps charges,
 * AvtaleGiro check). App routes: the dev sign-in and the tRPC API are stubbed with small
 * fixtures shaped like the router outputs.
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

const KID = "000569937638223";
const split = {
  kid: KID,
  donorId: 569,
  taxUnitId: 569,
  causeAreas: [
    {
      id: 1,
      name: "Global health",
      percentageShare: "80.000000000000000",
      standardSplit: true,
      organizations: [
        { id: 1, name: "Against Malaria Foundation", percentageShare: "60.000000000000000" },
        { id: 2, name: "Helen Keller Intl", percentageShare: "40.000000000000000" },
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

const charge = (chargeID: string, status: string, dueDate: string) => ({
  chargeID,
  agreementID: "agr_5kSeqz",
  status,
  type: "RECURRING",
  amountNOK: 500,
  KID,
  timestamp_created: "2026-10-01T10:00:00.000Z",
  dueDate,
  full_name: "Kari Nordmann",
});

const fixtures: Record<string, unknown> = {
  "agreements.list": {
    rows: [
      {
        provider: "vipps",
        id: "agr_5kSeqz",
        KID,
        donorId: 569,
        donorName: "Kari Nordmann",
        amount: 500,
        chargeDay: 15,
        status: "active",
        providerStatus: "ACTIVE",
        created: "2026-01-02T03:04:05.000Z",
        lastUpdated: null,
        cancelled: null,
        pausedUntil: null,
      },
      {
        provider: "avtalegiro",
        id: "167",
        KID: "000951394512895",
        donorId: 951,
        donorName: "Ola Hansen",
        amount: 200,
        chargeDay: 0,
        status: "stopped",
        providerStatus: "inactive",
        created: "2025-10-12T16:31:28.000Z",
        lastUpdated: "2025-11-12T17:31:28.000Z",
        cancelled: "2025-11-13T00:00:00.000Z",
        pausedUntil: null,
      },
    ],
    statistics: { count: 2, activeCount: 1, activeMonthlySum: 500 },
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
    taxUnit: null,
  },
  "config.causeAreas.listActive": causeAreas,
  "config.causeAreas.listAll": causeAreas,
  "vipps.agreements.list": {
    rows: [
      {
        ID: "agr_5kSeqz",
        full_name: "Kari Nordmann",
        status: "ACTIVE",
        amount: 500,
        monthly_charge_day: 15,
        KID,
        timestamp_created: "2026-01-02T03:04:05.000Z",
        agreement_url_code: "abc",
      },
    ],
    statistics: { numAgreements: 1, sumAgreements: 500, avgAgreement: 500 },
    pages: 1,
  },
  "vipps.agreements.get": {
    id: "agr_5kSeqz",
    status: "ACTIVE",
    pricing: { amount: 50000, currency: "NOK" },
  },
  "vipps.charges.list": {
    rows: [charge("chr_1", "CHARGED", "2026-10-15"), charge("chr_2", "FAILED", "2026-09-15")],
    statistics: { numCharges: 2, sumCharges: "1000", avgCharge: "500" },
    pages: 1,
  },
  "vipps.charges.histogram": [
    { bucket: 0, items: 10, bar: 100 },
    { bucket: 500, items: 4, bar: 40 },
  ],
  "giro.avtalegiro.get": {
    ID: 167,
    active: false,
    amount: 200,
    KID: "000951394512895",
    payment_date: 0,
    created: "2025-10-12T16:31:28.000Z",
    cancelled: "2025-11-13T00:00:00.000Z",
    last_updated: "2025-11-12T17:31:28.000Z",
    notice: true,
    full_name: "Ola Hansen",
    donorId: 951,
    distribution: { ...split, kid: "000951394512895", donorId: 951, taxUnitId: null },
  },
  "giro.avtalegiro.donations": [
    {
      id: 17662,
      sum: "200.00",
      transactionCost: "2.00",
      timestamp: "2025-10-28T16:31:28.000Z",
      paymentMethod: "AvtaleGiro",
      KID: "000951394512895",
    },
  ],
  "giro.avtalegiro.expected": [
    {
      ID: 167,
      KID: "000951394512895",
      payment_date: 24,
      notice: true,
      active: true,
      last_updated: "2025-11-12T17:31:28.000Z",
      created: "2025-10-12T16:31:28.000Z",
      cancelled: null,
      amount: 200,
    },
  ],
  "giro.avtalegiro.received": [],
  "giro.avtalegiro.missing": [
    {
      ID: 167,
      email: "ola@example.org",
      full_name: "Ola Hansen",
      amount: 200,
      KID: "000951394512895",
      payment_date: 24,
      created: "2025-10-12T16:31:28.000Z",
      last_updated: "2025-11-12T17:31:28.000Z",
      cancelled: null,
      active: true,
    },
  ],
  "giro.avtalegiro.validation": [
    { date: 24, expected: "200", actual: "0", diff: "-200" },
    { date: 15, expected: "1200", actual: "1200", diff: "0" },
    { date: 1, expected: "800", actual: "400", diff: "-400" },
  ],
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
  test.describe(`agreements ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("agreements list with filters and peek", async ({ page }) => {
      await open(page, "/agreements?status=active,stopped&provider=vipps,avtalegiro", theme);
      await page.getByRole("table", { name: "Agreements" }).locator("tbody tr").first().click();
      await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
      await scan(page);
    });

    test("Vipps agreement page", async ({ page }) => {
      await open(page, "/agreements/vipps/agr_5kSeqz", theme);
      await expect(page.getByRole("heading", { name: "Vipps agreement" })).toBeVisible();
      await expect(page.getByRole("table", { name: "Charges" })).toBeVisible();
      await scan(page);
    });

    test("change amount confirmation", async ({ page }) => {
      await open(page, "/agreements/vipps/agr_5kSeqz", theme);
      await page.getByRole("button", { name: "Change amount…" }).click();
      await page.getByRole("textbox", { name: "New monthly amount" }).fill("750");
      await expect(page.getByRole("button", { name: "Change to 750 kr" })).toBeEnabled();
      await scan(page);
    });

    test("AvtaleGiro agreement page with distribution editor", async ({ page }) => {
      await open(page, "/agreements/avtalegiro/167", theme);
      await expect(page.getByRole("heading", { name: "AvtaleGiro agreement" })).toBeVisible();
      await page.getByRole("button", { name: "Edit distribution" }).click();
      await scan(page);
    });

    test("Vipps charges with refund confirmation", async ({ page }) => {
      await open(page, "/charges?status=CHARGED,FAILED", theme);
      await page
        .getByRole("table", { name: "Vipps charges" })
        .locator("tbody tr td")
        .first()
        .click();
      await page.getByRole("button", { name: "Refund…" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await scan(page);
    });

    test("AvtaleGiro check", async ({ page }) => {
      await open(page, "/avtalegiro-check?date=2026-10-24", theme);
      await expect(page.getByRole("table", { name: "Missing AvtaleGiro payments" })).toBeVisible();
      await scan(page);
    });
  });
}
