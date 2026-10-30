import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { NOW, settle, type Theme } from "../helpers";

/**
 * axe on importing payments and the review queue. App routes, so the dev sign-in and the tRPC
 * API are stubbed with small fixtures shaped like the router outputs.
 */
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const item = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  source: "vipps",
  reason: "Could not find valid KID or matching parsing rule",
  KID: null,
  amount: "200.00",
  date: "2026-06-17T00:00:00.000Z",
  externalId: `3617122312${id}`,
  paymentId: 4,
  message: "Til malaria",
  name: "Katherine Johnson",
  location: "Gi Effektivt.",
  importLogId: null,
  status: "open",
  resolvedBy: null,
  resolvedAt: null,
  note: null,
  donationId: null,
  created: "2026-10-24T10:00:00.000Z",
  ...overrides,
});

const rows = [
  item(1, { source: "ocr", KID: "47914510", reason: "NO_KID | KID 47914510 does not exist" }),
  item(2),
  item(3, {
    status: "registered",
    resolvedBy: "kari@gieffektivt.no",
    resolvedAt: "2026-10-24T11:00:00.000Z",
    donationId: 18598,
  }),
  item(4, {
    status: "ignored",
    resolvedBy: "kari@gieffektivt.no",
    resolvedAt: "2026-10-24T11:00:00.000Z",
    note: "Test payment",
  }),
];

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
        standardShare: 100,
        isActive: true,
        ordering: 1,
      },
    ],
  },
];

const fixtures: Record<string, unknown> = {
  "reports.reviewQueue.counts": { open: 2, registered: 1, ignored: 1 },
  "reports.reviewQueue.list": {
    rows,
    total: rows.length,
    pages: 1,
    counts: { open: 2, registered: 1, ignored: 1 },
  },
  "config.causeAreas.listActive": causeAreas,
  "config.causeAreas.listAll": causeAreas,
  "config.paymentMethods.list": [
    { id: 2, name: "Bank", abbriviation: "Bank" },
    { id: 4, name: "Vipps KID", abbriviation: "Vipps KID" },
  ],
  "meta.owners": [
    { id: 1, name: "Effekt", default: false },
    { id: 3, name: "EAN + Effekt", default: true },
  ],
};

async function stubApi(page: Page, overrides: Record<string, unknown> = {}) {
  const payload = Buffer.from(JSON.stringify({ sub: "dev", name: "Dev admin" })).toString(
    "base64url",
  );
  await page.route("**/dev-auth/**", (route) =>
    route.fulfill({ json: { access_token: `x.${payload}.y`, expires_in: 3600 } }),
  );
  const all = { ...fixtures, ...overrides };
  await page.route("http://localhost:5999/trpc/**", (route) => {
    const paths = new URL(route.request().url()).pathname.replace("/trpc/", "").split(",");
    route.fulfill({
      json: paths.map((path) => ({ result: { data: all[decodeURIComponent(path)] ?? [] } })),
    });
  });
}

async function open(page: Page, path: string, theme: Theme, overrides?: Record<string, unknown>) {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await stubApi(page, overrides);
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
  test.describe(`import ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("import flow upload step", async ({ page }) => {
      await page.addInitScript(() => localStorage.removeItem("import-flow"));
      await open(page, "/import", theme);
      await page.getByRole("radio", { name: /Bank OCR/ }).click();
      await scan(page);
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText("Upload Bank OCR file")).toBeVisible();
      await scan(page);
    });

    test("review queue with peek", async ({ page }) => {
      await open(page, "/import/review?status=open,registered,ignored", theme);
      await page.getByRole("table", { name: "Review queue" }).locator("tbody tr").nth(2).click();
      await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
      await scan(page);
    });

    test("review workbench, open item", async ({ page }) => {
      await open(page, "/import/review/2", theme, { "reports.reviewQueue.get": rows[1] });
      await expect(page.getByRole("form", { name: "Register donation" })).toBeVisible();
      await scan(page);
      await page.getByRole("button", { name: "Ignore…" }).click();
      await expect(page.getByRole("textbox", { name: /Note/ })).toBeVisible();
      await scan(page);
    });

    test("review workbench, registered item", async ({ page }) => {
      await open(page, "/import/review/3", theme, { "reports.reviewQueue.get": rows[2] });
      await expect(page.getByText("Registered as donation #18598")).toBeVisible();
      await scan(page);
    });

    test("review workbench, ignored item", async ({ page }) => {
      await open(page, "/import/review/4", theme, { "reports.reviewQueue.get": rows[3] });
      await expect(page.getByText("Test payment")).toBeVisible();
      await scan(page);
    });
  });
}
