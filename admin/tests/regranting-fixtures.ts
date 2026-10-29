import type { Page, Route } from "@playwright/test";
import { homeTrendsFixture } from "./helpers";

/**
 * Small regranting fixtures shaped like the regranting.* router outputs, and a stubbed API
 * (dev sign-in + tRPC) for the a11y and interaction specs. `overrides` lets a test answer a
 * procedure with a function of its input (e.g. a stateful setIncludeDirect).
 */

const amounts = (available: string, inRound = "0.00", extra: Record<string, string> = {}) => ({
  balanceAtCutoff: available,
  committed: "0.00",
  fundGrants: "0.00",
  roundAdjustments: "0.00",
  available,
  proposed: available,
  inRound,
  carriesOver: "0.00",
  ...extra,
});

const figures = (balance: string, extra: Record<string, string> = {}) => ({
  opening: "0.00",
  allocations: balance,
  fundGrantsIn: "0.00",
  fundGrantsOut: "0.00",
  transfers: "0.00",
  adjustments: "0.00",
  balance,
  committed: "0.00",
  available: balance,
  ...extra,
});

const givewell = { id: 1, name: "GiveWell", currency: "NOK" };
const gd = { id: 2, name: "GiveDirectly", currency: "USD" };

export const round = {
  id: 7,
  name: "September 2026 regular round",
  kind: "regular",
  cutoff: "2026-09-30",
  status: "draft",
  minTransfer: "0.00",
  createdBy: "ops@example.org",
  createdAt: "2026-10-20T10:00:00.000Z",
  approvedBy: null,
  approvedAt: null,
  paidAt: null,
  notes: null,
  totalNok: "1500.30",
  transferCount: 1,
  fundGrantCount: 1,
  fundGrantTotal: "500.00",
};

const transferLine = (
  id: number,
  organizationId: number,
  name: string,
  projectId: number | null,
  amountNok: string,
) => ({
  id,
  transferId: 70,
  organizationId,
  organizationName: name,
  projectId,
  projectName: projectId ? "Cash transfers in Malawi" : null,
  amountNok,
});

export const transfer = {
  id: 70,
  roundId: 7,
  payee: givewell,
  amountNok: "1500.30",
  currency: "NOK",
  amountForeign: null,
  fxRate: null,
  bankFee: null,
  paidAt: null,
  bankRef: null,
  paidBy: "foundation",
  notes: null,
  documents: [],
  lines: [
    transferLine(701, 1, "GiveWell All Grants Fund", null, "1000.30"),
    transferLine(702, 5, "Malaria Consortium", null, "500.00"),
  ],
};

const recipient = (
  organizationId: number,
  name: string,
  abbriv: string,
  payee: typeof givewell | null,
  lines: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  organizationId,
  name,
  abbriv,
  inRound: true,
  payee,
  includeDirect: true,
  includeDirectOverride: null,
  hold: null,
  chosenAllocations: null,
  frontedOutstanding: [],
  lines,
  totals: amounts("0.00"),
  ...extra,
});

const line = (
  projectId: number | null,
  available: string,
  inRound: string,
  extra: Record<string, unknown> = {},
) => ({
  ...amounts(available, inRound),
  projectId,
  projectName: projectId ? "Cash transfers in Malawi" : null,
  projectStatus: projectId ? "active" : null,
  hold: null,
  held: false,
  ...extra,
});

export function builderFixture(includeDirectTCF = true) {
  return {
    round,
    defaultIncludeDirect: true,
    funds: [
      {
        organizationId: 18,
        name: "Gi Effektivt-fondet",
        abbriv: "GEBF",
        maxHoldDays: 180,
        balanceAtCutoff: "2000.00",
        committed: "0.00",
        availableToGrant: "2000.00",
        granted: "500.00",
        remaining: "1500.00",
      },
    ],
    fundGrants: [
      {
        id: 3,
        fundId: 18,
        fundName: "Gi Effektivt-fondet",
        roundId: 7,
        rationale: "Board decision: bednets",
        approvedBy: null,
        approvedAt: null,
        createdBy: "ops@example.org",
        createdAt: "2026-10-20T10:00:00.000Z",
        total: "500.00",
        lines: [
          {
            id: 31,
            fundGrantId: 3,
            organizationId: 5,
            organizationName: "Malaria Consortium",
            projectId: null,
            projectName: null,
            amount: "500.00",
          },
        ],
      },
    ],
    recipients: [
      recipient(1, "GiveWell All Grants Fund", "AGF", givewell, [line(null, "1000.30", "1000.30")]),
      recipient(
        2,
        "GiveWell Top Charities Fund",
        "TCF",
        givewell,
        [line(null, "250.00", "0.00", { proposed: includeDirectTCF ? "250.00" : "0.00" })],
        {
          includeDirect: includeDirectTCF,
          includeDirectOverride: includeDirectTCF ? null : false,
        },
      ),
      recipient(
        5,
        "Malaria Consortium",
        "MC",
        givewell,
        [line(null, "500.00", "500.00", { fundGrants: "500.00", balanceAtCutoff: "0.00" })],
        {
          frontedOutstanding: [
            {
              adjustmentId: 9,
              organizationId: 5,
              projectId: null,
              amount: "500000.00",
              effectiveAt: "2026-08-12",
              roundId: 4,
              linkedDonationId: null,
              offset: false,
            },
          ],
        },
      ),
      recipient(7, "GiveDirectly", "GD", null, [
        line(null, "300.00", "0.00"),
        line(3, "0.00", "0.00"),
      ]),
    ],
    payeeGroups: [
      {
        payee: givewell,
        organizationIds: [1, 2, 5],
        transferIds: [70],
        proposed: "1750.30",
        inRound: "1500.30",
      },
      { payee: null, organizationIds: [7], transferIds: [], proposed: "0.00", inRound: "0.00" },
    ],
    transfers: [transfer],
    donations: [],
    unassigned: { amount: "3375.71", donationCount: 4 },
    issues: [
      {
        severity: "warning",
        code: "recipient_without_payee",
        message: "GiveDirectly has no payee at the cutoff; add one under Payees",
        organizationId: 7,
        projectId: null,
        transferId: null,
        transferLineId: null,
        fundGrantId: null,
        fundGrantLineId: null,
        donationId: null,
      },
      {
        severity: "warning",
        code: "unassigned_balance",
        message: '3375.71 from 4 donations has no split ("Unassigned")',
        organizationId: null,
        projectId: null,
        transferId: null,
        transferLineId: null,
        fundGrantId: null,
        fundGrantLineId: null,
        donationId: null,
      },
    ],
    totals: { proposed: "1750.30", inRound: "1500.30", fundGranted: "500.00", transferCount: 1 },
  };
}

const balancesRecipient = (
  organizationId: number,
  name: string,
  abbriv: string,
  balance: string,
  extra: Record<string, unknown> = {},
) => ({
  organizationId,
  name,
  abbriv,
  isActive: true,
  isFund: false,
  maxHoldDays: null,
  heldTooLong: null,
  payee: givewell,
  hold: null,
  total: figures(balance),
  unrestricted: figures(balance),
  inflowSinceLastRound: balance,
  lastTransfer: {
    organizationId,
    transferId: 50,
    roundId: 5,
    roundName: "June 2026 regular round",
    paidAt: "2026-07-10",
    amountNok: "12000.00",
  },
  frontedOutstanding: "0.00",
  projects: [],
  ...extra,
});

export const balances = {
  at: "2026-10-24",
  lastRound: { id: 5, name: "June 2026 regular round", cutoff: "2026-06-30" },
  unassigned: { amount: "3375.71", donationCount: 4 },
  recipients: [
    balancesRecipient(18, "Gi Effektivt-fondet", "GEBF", "250000.00", {
      isFund: true,
      maxHoldDays: 180,
      heldTooLong: "170000.00",
      payee: null,
    }),
    balancesRecipient(1, "GiveWell All Grants Fund", "AGF", "3940286.92"),
    balancesRecipient(5, "Malaria Consortium", "MC", "-459765.59", {
      frontedOutstanding: "500000.00",
    }),
    balancesRecipient(7, "GiveDirectly", "GD", "412380.10", {
      payee: gd,
      hold: {
        id: 1,
        organizationId: 7,
        projectId: null,
        reason: "Waiting for the grant letter",
        until: "2026-12-31",
        createdBy: "ops@example.org",
        createdAt: "2026-10-01T10:00:00.000Z",
      },
      projects: [
        {
          projectId: 3,
          name: "Cash transfers in Malawi",
          status: "active",
          hold: null,
          figures: figures("25000.00", { allocations: "0.00", fundGrantsIn: "25000.00" }),
        },
      ],
    }),
  ],
};

export const project = {
  id: 3,
  organizationId: 7,
  organizationName: "GiveDirectly",
  name: "Cash transfers in Malawi",
  description: "Unconditional cash transfers to households in Malawi.",
  country: "Malawi",
  startDate: "2026-01-01",
  endDate: "2027-12-31",
  status: "active",
  agreementRef: "GD-2026-07",
  reportDue: "2027-03-31",
  documentsUrl: "https://example.org/docs",
  createdAt: "2026-01-01T10:00:00.000Z",
};

const adjustment = {
  id: 11,
  organizationId: 5,
  organizationName: "Malaria Consortium",
  projectId: null,
  projectName: null,
  amount: "500000.00",
  type: "fronted",
  reason: "Paid ahead of the DSN gift",
  effectiveAt: "2026-08-12",
  roundId: null,
  linkedTransferId: null,
  linkedDonationId: null,
  documents: [
    {
      id: 3,
      url: "https://drive.google.com/file/d/bilag-2026-118/view",
      label: "Bilag 2026-118",
      roundId: null,
      transferId: null,
      adjustmentId: 11,
      createdBy: "ops@example.org",
      createdAt: "2026-08-12T10:00:00.000Z",
    },
  ],
  createdBy: "ops@example.org",
  createdAt: "2026-08-12T10:00:00.000Z",
  pairedAdjustmentId: null,
  roundStatus: null,
  pending: false,
  affectsBalance: false,
};

const entry = (overrides: Record<string, unknown>) => ({
  amount: "0.00",
  date: null,
  projectId: null,
  projectName: null,
  round: null,
  adjustmentId: null,
  adjustmentType: null,
  reason: null,
  documentRef: null,
  linkedTransferId: null,
  fundGrantId: null,
  fundGrantLineId: null,
  counterpartOrganizationId: null,
  counterpartName: null,
  rationale: null,
  transferId: null,
  transferLineId: null,
  payeeName: null,
  bankRef: null,
  paidBy: null,
  transferNotes: null,
  ...overrides,
});

const paidRound = {
  id: 5,
  name: "June 2026 regular round",
  kind: "regular",
  status: "paid",
  cutoff: "2026-06-30",
};

const month = (m: string, amount: string, count: number, list = amount) => ({
  month: m,
  from: `${m}-01`,
  to: m === "2026-09" ? "2026-09-30" : `${m}-31`,
  amount,
  donationCount: count,
  donationsSum: amount,
  list: {
    link: { organizationId: 1, from: `${m}-01`, to: m === "2026-09" ? "2026-09-30" : `${m}-31` },
    donationCount: count,
    sum: list,
    difference: (Number(list) - Number(amount)).toFixed(2),
    rounding: "0.00",
    timeZone: (Number(list) - Number(amount)).toFixed(2),
    timeZoneDonations: list === amount ? 0 : 1,
  },
});

/** AGF at the round's cutoff: 100 + 1 200,30 − 300 = 1 000,30, all paid now */
export const breakdown = {
  organizationId: 1,
  name: "GiveWell All Grants Fund",
  abbriv: "AGF",
  isFund: false,
  scope: "unrestricted",
  projectName: null,
  at: "2026-09-30",
  round: { id: 7, name: round.name, kind: "regular", status: "draft", cutoff: "2026-09-30" },
  opening: {
    total: "100.00",
    entries: [
      entry({
        amount: "100.00",
        date: "2021-09-30",
        adjustmentId: 1,
        adjustmentType: "opening",
        reason: "Carry-over from Samlefila",
      }),
    ],
  },
  allocations: {
    total: "1200.30",
    donationCount: 5,
    months: [month("2026-08", "700.10", 3), month("2026-09", "500.20", 2, "550.20")],
  },
  fundGrantsIn: { total: "0.00", entries: [] },
  fundGrantsOut: { total: "0.00", entries: [] },
  transfers: {
    total: "-300.00",
    entries: [
      entry({
        amount: "-300.00",
        date: "2026-07-10",
        round: paidRound,
        transferId: 50,
        transferLineId: 51,
        payeeName: "GiveWell",
        paidBy: "foundation",
      }),
    ],
  },
  adjustments: { total: "0.00", entries: [] },
  balance: "1000.30",
  committed: { total: "0.00", entries: [] },
  available: "1000.30",
  inRound: {
    fundGrants: { total: "0.00", entries: [] },
    adjustments: { total: "0.00", entries: [] },
    available: "1000.30",
    payNow: { total: "1000.30", entries: [] },
    carriesOver: "0.00",
  },
  check: { ledger: figures("1000.30"), matches: true, differences: [] },
  paymentMethodIds: [2, 4, 6, 7, 8],
};

const donations = (from: string, to: string, amount: string, count: number) => ({
  kind: "donations",
  from,
  to,
  amount,
  donationCount: count,
  partialStart: false,
  partialEnd: false,
  months: [
    {
      month: from.slice(0, 7),
      from,
      to,
      amount,
      donationCount: count,
      partial: false,
      link: { organizationId: 1, from, to },
    },
  ],
  link: { organizationId: 1, from, to },
});

/** What AGF's 1 000,30 contains: 100 opening carried over, 900,30 since the June round */
export const composition = {
  round: {
    id: 7,
    name: round.name,
    kind: "regular",
    status: "draft",
    cutoff: "2026-09-30",
    paidAt: null,
  },
  paymentMethodIds: [2, 4, 6, 7, 8],
  lines: [
    {
      transferId: 70,
      transferLineId: 701,
      payee: givewell,
      paidAt: null,
      organizationId: 1,
      organizationName: "GiveWell All Grants Fund",
      projectId: null,
      projectName: null,
      amount: "1000.30",
      previous: { round: paidRound, transferId: 50, payeeName: "GiveWell", paidAt: "2026-07-10" },
      window: { from: "2026-07-01", to: "2026-09-30" },
      thisRound: { amount: "0.00", items: [] },
      carriedOver: {
        amount: "100.00",
        items: [
          {
            kind: "opening",
            adjustmentId: 1,
            date: "2021-09-30",
            reason: "Carry-over from Samlefila",
            documentRef: null,
            amount: "100.00",
          },
        ],
      },
      sinceLastTransfer: {
        amount: "900.30",
        items: [donations("2026-08-02", "2026-09-28", "900.30", 4)],
      },
      ahead: null,
      leftAfter: { amount: "0.00", oldest: null },
    },
  ],
};

export const reconciliation = {
  from: "2026-08",
  to: "2026-09",
  months: ["2026-08", "2026-09"],
  recipients: [
    {
      organizationId: 1,
      name: "GiveWell All Grants Fund",
      abbriv: "AGF",
      isActive: true,
      allocated: "1200.30",
      recomputed: "1200.30",
      difference: "0.00",
      months: [
        {
          month: "2026-08",
          allocated: "700.10",
          recomputed: "700.10",
          difference: "0.00",
          donationCount: 3,
        },
        {
          month: "2026-09",
          allocated: "500.20",
          recomputed: "500.20",
          difference: "0.00",
          donationCount: 2,
        },
      ],
    },
  ],
  totals: [
    {
      month: "2026-08",
      allocated: "700.10",
      unassigned: "0.00",
      unassignedCount: 0,
      accounted: "700.10",
      donations: "700.10",
      donationCount: 3,
      difference: "0.00",
      splitGap: "0.00",
      splitGapCount: 0,
      unexplained: "0.00",
    },
    {
      month: "2026-09",
      allocated: "500.20",
      unassigned: "50.00",
      unassignedCount: 1,
      accounted: "550.20",
      donations: "550.20",
      donationCount: 3,
      difference: "0.00",
      splitGap: "0.00",
      splitGapCount: 0,
      unexplained: "0.00",
    },
  ],
  total: {
    allocated: "1200.30",
    unassigned: "50.00",
    unassignedCount: 1,
    accounted: "1250.30",
    donations: "1250.30",
    donationCount: 6,
    difference: "0.00",
    splitGap: "0.00",
    splitGapCount: 0,
    unexplained: "0.00",
  },
  splitGaps: [],
  checks: {
    allocationsMatch: true,
    mismatchedCells: 0,
    totalsMatch: true,
    monthsWithDifference: 0,
    monthsUnexplained: 0,
  },
  paymentMethodIds: [2, 4, 6, 7, 8],
};

export const fixtures: Record<string, unknown> = {
  "home.trends": homeTrendsFixture(),
  "regranting.balances.breakdown": breakdown,
  "regranting.rounds.composition": composition,
  "regranting.reconciliation.monthly": reconciliation,
  "regranting.balances.list": balances,
  "regranting.rounds.list": [
    round,
    {
      ...round,
      id: 5,
      name: "June 2026 regular round",
      cutoff: "2026-06-30",
      status: "paid",
      approvedBy: "approver@example.org",
      approvedAt: "2026-07-01T10:00:00.000Z",
      paidAt: "2026-07-10",
    },
  ],
  "regranting.rounds.builder": builderFixture(),
  "regranting.rounds.get": {
    round,
    snapshot: [],
    transfers: [transfer],
    fundGrants: builderFixture().fundGrants,
    adjustments: [],
    donations: [],
    includeDirectOverrides: [],
    documents: [],
  },
  "regranting.statements.recipient": {
    organizationId: 1,
    name: "GiveWell All Grants Fund",
    isFund: false,
    projectId: "all",
    from: "2025-10-24",
    to: "2026-10-24",
    openingBalance: "100000.00",
    entries: [
      {
        date: "2026-07-01",
        kind: "allocations",
        projectId: null,
        projectName: null,
        amount: "12000.50",
        affectsBalance: true,
        balanceAfter: "112000.50",
        donationCount: 14,
        roundId: null,
        roundName: null,
        transferId: null,
        transferLineId: null,
        payeeName: null,
        bankRef: null,
        transferNotes: null,
        fundGrantId: null,
        fundGrantLineId: null,
        counterpartOrganizationId: null,
        counterpartName: null,
        rationale: null,
        adjustmentId: null,
        adjustmentType: null,
        reason: null,
        createdBy: null,
        pending: false,
        documents: [],
      },
      {
        date: "2026-07-10",
        kind: "transfer",
        projectId: null,
        projectName: null,
        amount: "-100000.00",
        affectsBalance: true,
        balanceAfter: "12000.50",
        donationCount: null,
        roundId: 5,
        roundName: "June 2026 regular round",
        transferId: 50,
        transferLineId: 500,
        payeeName: "GiveWell",
        bankRef: "REF-123",
        transferNotes: null,
        fundGrantId: null,
        fundGrantLineId: null,
        counterpartOrganizationId: null,
        counterpartName: null,
        rationale: null,
        adjustmentId: null,
        adjustmentType: null,
        reason: null,
        createdBy: "approver@example.org",
        pending: false,
        documents: [],
      },
    ],
    closingBalance: "12000.50",
    committed: [],
  },
  "regranting.projects.list": [project],
  "regranting.projects.get": {
    project,
    figures: figures("25000.00"),
    hold: null,
    transferLines: [],
    fundGrantLines: [],
    adjustments: [],
  },
  "regranting.adjustments.list": [adjustment],
  "regranting.payees.list": [
    {
      ...givewell,
      bankAccount: null,
      iban: "NO9386011117947",
      swift: "DNBANOKK",
      wallet: null,
      paymentReferenceTemplate: "Gi Effektivt {round}",
      isActive: true,
      createdAt: "2026-01-01T10:00:00.000Z",
    },
    {
      ...gd,
      bankAccount: "1234.56.78903",
      iban: null,
      swift: null,
      wallet: null,
      paymentReferenceTemplate: null,
      isActive: true,
      createdAt: "2026-01-01T10:00:00.000Z",
    },
  ],
  "regranting.routings.list": [
    {
      id: 1,
      organizationId: 5,
      organizationName: "Malaria Consortium",
      payeeId: 1,
      payeeName: "GiveWell",
      validFrom: "2020-01-01",
      validTo: "2025-07-31",
    },
    {
      id: 2,
      organizationId: 1,
      organizationName: "GiveWell All Grants Fund",
      payeeId: 1,
      payeeName: "GiveWell",
      validFrom: "2020-01-01",
      validTo: null,
    },
  ],
  "regranting.funds.list": [
    { organizationId: 18, name: "Gi Effektivt-fondet", abbriv: "GEBF", maxHoldDays: 180 },
  ],
  "regranting.holds.list": [balances.recipients[3]!.hold],
  "regranting.rounds.validate": builderFixture().issues,
  "donations.list": {
    rows: [
      {
        id: 10629,
        donor: "Kari Nordmann",
        paymentMethod: "Bank",
        sum: "250000.00",
        transactionCost: null,
        kid: "000569937638223",
        timestamp: "2026-10-02T10:00:00.000Z",
        taxUnitType: "person",
      },
    ],
    statistics: { numDonations: 1, sumDonations: "250000.00", avgDonation: "250000.00" },
    pages: 1,
  },
  "config.organizations.listAll": [
    { id: 1, name: "GiveWell All Grants Fund", abbreviation: "AGF", isActive: true },
    { id: 5, name: "Malaria Consortium", abbreviation: "MC", isActive: true },
    { id: 7, name: "GiveDirectly", abbreviation: "GD", isActive: true },
  ],
};

export type Override = (input: unknown) => unknown;

export async function stubRegrantingApi(
  page: Page,
  {
    overrides = {},
    user = { sub: "dev", name: "Dev admin" },
  }: { overrides?: Record<string, Override>; user?: Record<string, string> } = {},
) {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
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
      const data = overrides[path] ? overrides[path]!(input) : fixtures[path] ?? [];
      return { result: { data } };
    });
    await route.fulfill({ json: batched ? results : results[0] });
  });
}
