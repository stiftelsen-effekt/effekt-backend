import type { Page, Route } from "@playwright/test";
import { homeTrendsFixture } from "./helpers";

/**
 * Fixtures shaped like the analysis.* router outputs, and a stubbed API (dev sign-in + tRPC) for
 * the a11y and interaction specs (also used for other pages through `extra`). `overrides` answers a procedure with a function of its input
 * (e.g. a stateful pledge list); unknown procedures answer [].
 */

export const overviewFixture = () => ({
  thisYear: { year: 2026, sum: "27049175" },
  throughTime: { measured: "165445588", donations: 85729, from: "2021-10-01" },
  pledges: { open: "4800000", count: 4 },
  withPledges: {
    sum: "170245588",
    milestone: "200000000",
    remaining: "29754412",
    passed: false,
  },
});

export const pledgesFixture = () => [
  { id: 7, sum: "350000.00", decidedDate: "2026-10-19", receivedDate: null, donationId: null },
  { id: 6, sum: "2500000.00", decidedDate: "2026-09-14", receivedDate: null, donationId: null },
  { id: 5, sum: "1200000.00", decidedDate: "2026-06-30", receivedDate: null, donationId: null },
  { id: 3, sum: "750000.00", decidedDate: "2026-02-02", receivedDate: null, donationId: null },
  {
    id: 4,
    sum: "600000.00",
    decidedDate: "2026-03-12",
    receivedDate: "2026-05-11",
    donationId: 75625,
  },
  {
    id: 1,
    sum: "250000.00",
    decidedDate: "2025-05-26",
    receivedDate: "2025-06-25",
    donationId: null,
  },
];

export const donationFixture = {
  id: 75625,
  donor: "Kari Nordmann",
  donorId: 569,
  email: "kari.nordmann@example.org",
  sum: "600000.00",
  transactionCost: "2.00",
  timestamp: "2026-05-11T00:00:00.000Z",
  paymentId: 2,
  paymentExternalRef: "75625",
  paymentMethod: "Bank",
  KID: "000569937638223",
  metaOwnerId: 3,
  fundraiserId: null,
  distribution: { kid: "000569937638223", donorId: 569, taxUnitId: null, causeAreas: [] },
};

const fixtures: Record<string, unknown> = {
  "analysis.overview": overviewFixture(),
  "home.trends": homeTrendsFixture(),
  "analysis.pledges.list": pledgesFixture(),
  "donations.get": donationFixture,
};

type Override = (input: unknown) => unknown;
/** An error answer for a procedure: `{ error: { code, message } }`. */
export type StubError = { error: { code: string; message: string; httpStatus: number } };

export async function stubAnalysisApi(
  page: Page,
  {
    overrides = {},
    extra = {},
  }: {
    overrides?: Record<string, Override>;
    /** More static answers, e.g. for another page's procedures */
    extra?: Record<string, unknown>;
  } = {},
) {
  const payload = Buffer.from(JSON.stringify({ sub: "dev", name: "Dev admin" })).toString(
    "base64url",
  );
  await page.route("**/dev-auth/**", (route) =>
    route.fulfill({ json: { access_token: `x.${payload}.y`, expires_in: 3600 } }),
  );
  await page.route("http://localhost:5999/trpc/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const paths = url.pathname.replace("/trpc/", "").split(",").map(decodeURIComponent);
    let inputs: Record<string, unknown> = {};
    try {
      inputs =
        request.method() === "POST"
          ? JSON.parse(request.postData() ?? "{}")
          : JSON.parse(url.searchParams.get("input") ?? "{}");
    } catch {
      inputs = {};
    }
    const batched = url.searchParams.get("batch") === "1";
    const results = paths.map((path, i) => {
      const input = batched ? (inputs as Record<string, unknown>)[String(i)] : inputs;
      const data = overrides[path] ? overrides[path]!(input) : extra[path] ?? fixtures[path] ?? [];
      if (data && typeof data === "object" && "error" in data) {
        const { code, message, httpStatus } = (data as StubError).error;
        return { error: { code: -32600, message, data: { code, httpStatus, path } } };
      }
      return { result: { data } };
    });
    const status = results.some((r) => "error" in r) && !batched ? 400 : 200;
    await route.fulfill({ status, json: batched ? results : results[0] });
  });
}
