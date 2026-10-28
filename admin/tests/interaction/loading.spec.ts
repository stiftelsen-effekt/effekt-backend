import { expect, test, type Page } from "@playwright/test";
import { NOW, settle } from "../helpers";
import { fixtures as regrantingFixtures } from "../regranting-fixtures";

/**
 * Loading is calm (DESIGN.md › Loading): against a slow stubbed API, first loads of key pages
 * don't shift the layout when the data arrives, and changing the AvtaleGiro day, the Balances
 * date or a statement's period keeps the current data on screen (no skeletons, no shift).
 *
 * Layout shift is measured with the browser's own `layout-shift` entries (what CLS sums).
 * The API answers after LATENCY ms, longer than both the 300 ms indicator delay (so the
 * placeholders really show) and the 500 ms after an input that CLS forgives.
 */
const LATENCY = 700;
const MAX_SHIFT = 0.02;

const causeAreas = [
  {
    id: 1,
    name: "Global health",
    standardPercentageShare: 100,
    shortDescription: null,
    longDescription: null,
    informationUrl: null,
    isActive: true,
    ordering: 1,
    organizations: [
      {
        id: 1,
        causeAreaId: 1,
        name: "Against Malaria Foundation",
        standardShare: 60,
        isActive: true,
        ordering: 1,
      },
      {
        id: 2,
        causeAreaId: 1,
        name: "Malaria Consortium",
        standardShare: 40,
        isActive: true,
        ordering: 2,
      },
    ],
  },
];

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
const names = ["Kari Nordmann", "Ola Hansen", "Ingrid Berg", "Lars Moen", "Siri Dahl"];

/** The AvtaleGiro day `date`: a few agreements, more on some days, a claim file on even days. */
function avtaleGiroDay(date: string) {
  const day = Number(date.slice(8, 10));
  const count = 2 + (day % 4);
  const amountSource = day % 2 === 0 ? "claim" : "agreement";
  const expected = Array.from({ length: count }, (_, index) => ({
    ID: 100 + index,
    KID: `0009513945128${10 + index}`,
    payment_date: day,
    notice: true,
    active: true,
    last_updated: "2025-11-12T17:31:28.000Z",
    created: "2025-10-12T16:31:28.000Z",
    cancelled: null,
    amount: 200 + index * 100,
    amountSource,
  }));
  const missing = expected.slice(0, day % 3).map((row, index) => ({
    ...row,
    email: `donor${index}@example.org`,
    full_name: names[index]!,
  }));
  const received = expected.slice(day % 3).map((row, index) => ({
    id: 5000 + day * 10 + index,
    donor: names[(index + 1) % names.length]!,
    sum: String(row.amount),
    kid: row.KID,
    timestamp: `${date}T06:00:00.000Z`,
  }));
  return { expected, missing, received };
}

function fixture(path: string, input: Record<string, unknown> | undefined): unknown {
  switch (path) {
    // Home
    case "reports.reviewQueue.counts":
      return { open: 4, registered: 10, ignored: 2 };
    case "vipps.charges.list":
      return {
        rows: [],
        pages: 1,
        statistics: { numCharges: 3, sumCharges: "900", avgCharge: "300" },
      };
    case "donations.totalMonthly":
      return [
        { year: 2026, month: 9, sum: "2627709.00" },
        { year: 2026, month: 10, sum: "2487430.00" },
      ];
    case "donations.transactionCostsReport":
      return { donationsCount: 100, costPrevMonth: "23541", costCurrentMonthToDate: "15705" };
    case "vipps.agreements.report":
      return {
        activeAgreementCount: 605,
        totalAgreementSum: "288500",
        activatedThisMonth: 19,
        stoppedThisMonth: 10,
      };
    case "giro.avtalegiro.report":
      return {
        activeAgreementCount: 1001,
        totalAgreementSum: 849625,
        activatedThisMonth: 15,
        stoppedThisMonth: 13,
      };
    case "config.causeAreas.listAll":
    case "config.causeAreas.listActive":
      return causeAreas;
    case "donations.total":
      return [
        { id: 1, orgName: "Against Malaria Foundation", sum: "350575.25" },
        { id: 2, orgName: "Malaria Consortium", sum: "312873.44" },
      ];
    case "reports.logs.list":
      return {
        rows: Array.from({ length: 6 }, (_, index) => ({
          ID: 1281 - index,
          label: index % 2 ? "Vipps" : "OCR",
          displayLabel: index % 2 ? "Vipps" : "OCR",
          timestamp: "2026-10-23T20:00:00.000Z",
          meta: null,
          source: null,
          filename: null,
          summary: null,
        })),
        pages: 1,
        total: 6,
      };
    // Donors
    case "donors.list":
      return {
        rows: names.map((name, index) => donorRow(569 + index, name)),
        pages: 1,
        statistics: { totalDonors: 5, totalDonationSum: 77000, totalDonationCount: 60 },
      };
    case "config.organizations.listAll":
      return [{ id: 1, name: "Against Malaria Foundation" }];
    case "config.referralTypes.listAll":
      return [{ id: 1, name: "Friends or family", ordering: 0, isActive: true }];
    case "donors.get":
      return {
        id: 569,
        name: "Kari Nordmann",
        email: "kari.nordmann@example.org",
        registered: "2023-08-12T17:27:19.000Z",
        newsletter: true,
        trash: false,
      };
    case "donors.donations":
      return Array.from({ length: 3 }, (_, index) => ({
        id: 10629 + index,
        donor: "Kari Nordmann",
        donorId: 569,
        email: "kari.nordmann@example.org",
        sum: "700.00",
        transactionCost: "21.93",
        timestamp: `2026-0${7 + index}-22T22:09:39.000Z`,
        paymentMethod: "Vipps",
        KID: "000569937638223",
        taxUnitId: 569,
        metaOwnerId: 3,
      }));
    case "donors.donationsAggregated":
      return [
        {
          ID: 1,
          organization: "Against Malaria Foundation",
          abbriv: "AMF",
          causeAreaID: 1,
          value: "1400.00",
          year: 2026,
        },
        {
          ID: 2,
          organization: "Malaria Consortium",
          abbriv: "MC",
          causeAreaID: 1,
          value: "700.00",
          year: 2025,
        },
      ];
    case "donors.distributionsAggregated":
      return [
        {
          KID: "000569937638223",
          sum: "2100.00",
          count: 3,
          full_name: "Kari Nordmann",
          email: "kari.nordmann@example.org",
        },
      ];
    case "donors.recurring.avtalegiro":
      return [
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
      ];
    case "donors.referrals":
      return [];
    // AvtaleGiro check
    case "giro.avtalegiro.expected":
    case "giro.avtalegiro.missing":
    case "giro.avtalegiro.received": {
      const day = avtaleGiroDay(String(input?.date ?? "2026-10-24"));
      return day[path.split(".").at(-1) as "expected" | "missing" | "received"];
    }
    case "giro.avtalegiro.validation":
      return Array.from({ length: 24 }, (_, index) => ({
        date: 24 - index,
        expected: "1200",
        actual: index % 3 ? "1200" : "800",
        diff: index % 3 ? "0" : "-400",
      }));
    default:
      // Regranting: Balances, the round builder, a statement, a project.
      return regrantingFixtures[path] ?? [];
  }
}

async function stubApi(page: Page, latency: number) {
  const payload = Buffer.from(JSON.stringify({ sub: "dev", name: "Dev admin" })).toString(
    "base64url",
  );
  await page.route("**/dev-auth/**", (route) =>
    route.fulfill({ json: { access_token: `x.${payload}.y`, expires_in: 3600 } }),
  );
  await page.route("http://localhost:5999/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const paths = url.pathname.replace("/trpc/", "").split(",").map(decodeURIComponent);
    const inputs = JSON.parse(url.searchParams.get("input") ?? "{}") as Record<
      string,
      Record<string, unknown>
    >;
    const body = paths.map((path, index) => ({
      result: { data: fixture(path, url.searchParams.has("batch") ? inputs[index] : inputs) },
    }));
    await new Promise((resolve) => setTimeout(resolve, latency));
    await route.fulfill({ json: url.searchParams.has("batch") ? body : body[0] }).catch(() => {});
  });
}

/** Layout shifts and skeletons, recorded from the first paint of every document. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __shifts: { value: number; recent: boolean; sources: string[] }[];
      __skeletons: number;
    };
    w.__shifts = [];
    w.__skeletons = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
        sources?: { node?: Node | null }[];
      }[]) {
        w.__shifts.push({
          value: entry.value,
          recent: entry.hadRecentInput,
          sources: (entry.sources ?? []).map((source) =>
            source.node instanceof Element ? source.node.outerHTML.slice(0, 80) : "text",
          ),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("[data-slot=skeleton]")) w.__skeletons++;
          w.__skeletons += node.querySelectorAll("[data-slot=skeleton]").length;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __shifts: { value: number; recent: boolean; sources: string[] }[];
      __skeletons: number;
    };
    const round = (value: number) => Math.round(value * 10_000) / 10_000;
    return {
      cls: round(w.__shifts.filter((s) => !s.recent).reduce((sum, s) => sum + s.value, 0)),
      all: round(w.__shifts.reduce((sum, s) => sum + s.value, 0)),
      skeletons: w.__skeletons,
      shifts: w.__shifts.filter((s) => s.value > 0.001),
    };
  });
}

async function reset(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __shifts: unknown[]; __skeletons: number };
    w.__shifts = [];
    w.__skeletons = 0;
  });
}

async function signIn(page: Page) {
  await page.clock.setFixedTime(NOW);
  await instrument(page);
  await stubApi(page, LATENCY);
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  // A returning user: Home has been seen once, so it knows how many attention rows to reserve
  // (a first-ever visit reserves one).
  await settle(page);
}

test.use({ viewport: { width: 1440, height: 900 } });

const firstLoads = [
  { name: "Home", path: "/", ready: (page: Page) => page.getByText("2 487 430 kr") },
  {
    name: "donors list",
    path: "/donors",
    ready: (page: Page) => page.getByRole("cell", { name: "Siri Dahl" }),
  },
  {
    name: "donor page",
    path: "/donors/569",
    ready: (page: Page) => page.getByRole("heading", { name: "Kari Nordmann" }),
  },
  {
    name: "AvtaleGiro check",
    path: "/avtalegiro-check?date=2026-10-21",
    ready: (page: Page) => page.getByRole("tab", { name: /Missing/ }),
  },
  {
    name: "Balances",
    path: "/regranting",
    ready: (page: Page) => page.getByRole("cell", { name: /GiveWell All Grants Fund/ }),
  },
  {
    name: "round builder",
    path: "/regranting/rounds/7",
    ready: (page: Page) => page.getByRole("heading", { name: "Step 2 · Payments by payee" }),
  },
  {
    name: "statement",
    path: "/regranting/recipients/1",
    ready: (page: Page) =>
      page.getByRole("heading", { name: "Statement: GiveWell All Grants Fund" }),
  },
  {
    name: "project page",
    path: "/regranting/projects/3",
    ready: (page: Page) => page.getByRole("heading", { name: "Cash transfers in Malawi" }),
  },
];

for (const { name, path, ready } of firstLoads) {
  test(`first load of the ${name} doesn't shift the layout`, async ({ page }) => {
    await signIn(page);
    await page.goto(path);
    await expect(ready(page)).toBeVisible();
    await settle(page);
    await page.waitForTimeout(300);
    const result = await measure(page);
    test.info().annotations.push({ type: "CLS", description: `${name}: ${result.cls}` });
    // The placeholders really were there (the load took longer than the delay).
    expect(result.skeletons, "placeholders on first load").toBeGreaterThan(0);
    expect(result.cls, JSON.stringify(result.shifts, null, 2)).toBeLessThan(MAX_SHIFT);
  });
}

test("changing the AvtaleGiro day keeps the page in place", async ({ page }) => {
  await signIn(page);
  await page.goto("/avtalegiro-check?date=2026-10-21");
  await settle(page);
  const expectedStat = page.locator("[data-slot=stat]").first();

  for (const button of ["Previous day", "Previous day", "Previous day", "Next day", "Next day"]) {
    const before = await page.getByText(/^Payments due/).textContent();
    await reset(page);
    await page.getByRole("button", { name: button }).click();
    // While the next day loads, the current one stays: values, not placeholders.
    await expect(expectedStat).toContainText("kr");
    await expect(page.getByText(/^Payments due/)).not.toHaveText(before!);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(LATENCY + 300);
    const result = await measure(page);
    test.info().annotations.push({
      type: "day change",
      description: `${button}: shift ${result.all}, skeletons ${result.skeletons}`,
    });
    expect(result.skeletons, `${button}: no skeletons on a day change`).toBe(0);
    // All shifts count here, also those within 500 ms of the click.
    expect(result.all, JSON.stringify(result.shifts, null, 2)).toBeLessThan(MAX_SHIFT);
  }
});

test("the previous day is shown dimmed and busy while the next loads", async ({ page }) => {
  await signIn(page);
  await page.goto("/avtalegiro-check?date=2026-10-21");
  await settle(page);
  // Skip ahead two days: the day after next isn't prefetched yet.
  await page.getByRole("button", { name: "Next day" }).click();
  await page.getByRole("button", { name: "Next day" }).click();
  const busy = page.locator("[data-slot=updating][aria-busy=true]").first();
  await expect(busy).toBeVisible();
  await expect(page.locator("[data-slot=updating][data-updating]").first()).toBeVisible();
  await expect(page.locator("[data-slot=progress-bar][data-active]")).toHaveCount(1);
  await expect(busy).toHaveCount(0, { timeout: LATENCY * 3 });
});

/** After a parameter change: the shift (also within 500 ms of the input) and skeletons. */
async function expectCalm(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(LATENCY + 300);
  const result = await measure(page);
  test.info().annotations.push({
    type: "parameter change",
    description: `${label}: shift ${result.all}, skeletons ${result.skeletons}`,
  });
  expect(result.skeletons, `${label}: no skeletons`).toBe(0);
  expect(result.all, JSON.stringify(result.shifts, null, 2)).toBeLessThan(MAX_SHIFT);
}

test("changing the Balances date keeps the balances in place", async ({ page }) => {
  await signIn(page);
  await page.goto("/regranting");
  await settle(page);
  const balance = page.getByRole("cell", { name: "3 940 286,92 kr", exact: true });
  await expect(balance).toBeVisible();

  for (const day of ["01.10.2026", "30.09.2026"]) {
    await reset(page);
    const input = page.getByRole("textbox", { name: "Balances at" });
    await input.fill(day);
    await input.press("Enter");
    // While the new date loads, the current balances stay: values, not placeholders.
    await expect(balance).toBeVisible();
    await expect(page).toHaveURL(/at=2026-/);
    await expectCalm(page, `Balances at ${day}`);
  }
});

test("changing a statement's period keeps the statement in place", async ({ page }) => {
  await signIn(page);
  await page.goto("/regranting/recipients/1");
  await settle(page);
  const opening = page.locator("[data-slot=stat]").first();
  await expect(opening).toContainText("kr");

  for (const preset of ["Last 30 days", "This year"]) {
    await reset(page);
    await page.getByRole("button", { name: "Period" }).click();
    await page.getByRole("dialog").getByRole("button", { name: preset }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/from=2026-/);
    await expect(opening).toContainText("kr");
    await expectCalm(page, `Statement ${preset}`);
  }
});
