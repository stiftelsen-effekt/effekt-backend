/**
 * Deterministic fake data for /design, typed with the real API output types so demos break
 * the build when the API changes shape. Names are random combinations, not real donors.
 */
import type { ReviewItem } from "@/features/review-queue/model";
import { percentOfMoney, toMoneyString } from "@/lib/money";
import type { RouterOutputs } from "@/lib/trpc";

type O = RouterOutputs;
export type DonationRow = O["donations"]["list"]["rows"][number];
export type DonationStats = O["donations"]["list"]["statistics"];
export type PaymentMethod = O["config"]["paymentMethods"]["list"][number];
export type CauseArea = O["config"]["causeAreas"]["listAll"][number];
export type Donor = O["donors"]["get"];
export type DonorListRow = O["donors"]["list"]["rows"][number];
export type DonorDonation = O["donors"]["donations"][number];
export type DonorYearly = O["donors"]["donationsAggregated"][number];
export type DonorDistribution = O["donors"]["distributionsAggregated"][number];
export type TaxUnit = O["donors"]["taxUnits"]["list"][number];
export type VippsRow = O["vipps"]["agreements"]["list"]["rows"][number];
export type AvtaleGiroRow = O["giro"]["avtalegiro"]["list"]["rows"][number];
export type AvtaleGiroDetail = O["giro"]["avtalegiro"]["get"];
export type LogRow = O["reports"]["logs"]["list"]["rows"][number];
export type ReferralType = O["config"]["referralTypes"]["listAll"][number];
type TaxUnitType = NonNullable<DonationRow["taxUnitType"]>;

// The API's TaxUnitType enum values. The admin imports only the backend's types, so the enum
// members aren't available at runtime; `satisfies` keeps these in step with the enum.
const PERSON = "person" satisfies `${TaxUnitType}` as TaxUnitType;
const ORGANIZATION = "organization" satisfies `${TaxUnitType}` as TaxUnitType;

/** API amounts are decimal strings with two fraction digits ("500.00"). */
const money = (value: number | string) => toMoneyString(value)!;

export const NOW = new Date("2026-10-24T12:00:00Z");

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rand: () => number, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)]!;

const firstNames = [
  "Ingrid",
  "Ola",
  "Kari",
  "Lars",
  "Sofie",
  "Emil",
  "Nora",
  "Jonas",
  "Maja",
  "Henrik",
  "Astrid",
  "Magnus",
  "Thea",
  "Elias",
  "Sigrid",
  "Filip",
  "Live",
  "Oskar",
  "Frida",
  "Aksel",
];
const lastNames = [
  "Hansen",
  "Johansen",
  "Olsen",
  "Larsen",
  "Andersen",
  "Pedersen",
  "Nilsen",
  "Kristiansen",
  "Jensen",
  "Karlsen",
  "Berg",
  "Haugen",
  "Lund",
  "Strand",
  "Eriksen",
  "Bakken",
  "Lie",
  "Moen",
  "Dahl",
  "Solberg",
];

const daysAgo = (days: number, rand = Math.random) =>
  new Date(NOW.getTime() - days * 864e5 - Math.floor(rand() * 864e5)).toISOString();

export const paymentMethods: PaymentMethod[] = [
  {
    id: 2,
    name: "Bank",
    abbriviation: "Bank u/KID",
    shortDescription: "Bank transfer without KID",
    lastUpdated: "2024-01-01T00:00:00Z",
    flatFee: null,
    percentageFee: null,
  },
  {
    id: 3,
    name: "PayPal",
    abbriviation: "PayPal",
    shortDescription: null,
    lastUpdated: "2024-01-01T00:00:00Z",
    flatFee: "2.4",
    percentageFee: "3.4",
  },
  {
    id: 4,
    name: "Vipps",
    abbriviation: "Vipps",
    shortDescription: null,
    lastUpdated: "2024-01-01T00:00:00Z",
    flatFee: null,
    percentageFee: "1.75",
  },
  {
    id: 5,
    name: "Bank (KID)",
    abbriviation: "Bank",
    shortDescription: "OCR bank transfer",
    lastUpdated: "2024-01-01T00:00:00Z",
    flatFee: null,
    percentageFee: null,
  },
  {
    id: 7,
    name: "AvtaleGiro",
    abbriviation: "AvtaleGiro",
    shortDescription: null,
    lastUpdated: "2024-01-01T00:00:00Z",
    flatFee: "1.5",
    percentageFee: null,
  },
  {
    id: 8,
    name: "Vipps recurring",
    abbriviation: "Vipps faste",
    shortDescription: null,
    lastUpdated: "2024-01-01T00:00:00Z",
    flatFee: null,
    percentageFee: "1.75",
  },
  {
    id: 9,
    name: "Facebook",
    abbriviation: "Facebook",
    shortDescription: null,
    lastUpdated: "2024-01-01T00:00:00Z",
    flatFee: null,
    percentageFee: null,
  },
];

const organization = (
  id: number,
  causeAreaId: number,
  name: string,
  standardShare: number,
  ordering: number,
) => ({
  id,
  causeAreaId,
  name,
  standardShare,
  isActive: true,
  ordering,
  abbreviation: name
    .split(" ")
    .map((w) => w[0])
    .join(""),
});

export const causeAreas: CauseArea[] = [
  {
    id: 1,
    name: "Global Health",
    standardPercentageShare: 80,
    shortDescription: "The most cost-effective health interventions",
    longDescription: null,
    informationUrl: null,
    isActive: true,
    ordering: 1,
    organizations: [
      organization(12, 1, "Against Malaria Foundation", 25, 1),
      organization(13, 1, "Malaria Consortium", 20, 2),
      organization(14, 1, "Helen Keller Intl", 15, 3),
      organization(15, 1, "New Incentives", 15, 4),
      organization(16, 1, "GiveDirectly", 10, 5),
      organization(17, 1, "GiveWell Top Charities Fund", 15, 6),
    ],
  },
  {
    id: 2,
    name: "Animal welfare",
    standardPercentageShare: 10,
    shortDescription: null,
    longDescription: null,
    informationUrl: null,
    isActive: true,
    ordering: 2,
    organizations: [
      organization(21, 2, "The Humane League", 50, 1),
      organization(22, 2, "Animal Welfare Fund", 50, 2),
    ],
  },
  {
    id: 3,
    name: "Climate",
    standardPercentageShare: 5,
    shortDescription: null,
    longDescription: null,
    informationUrl: null,
    isActive: true,
    ordering: 3,
    organizations: [organization(31, 3, "Clean Air Task Force", 100, 1)],
  },
  {
    id: 4,
    name: "Operations",
    standardPercentageShare: 5,
    shortDescription: "Our own running costs",
    longDescription: null,
    informationUrl: null,
    isActive: true,
    ordering: 4,
    organizations: [organization(41, 4, "Gi Effektivt drift", 100, 1)],
  },
];

export const referralTypes: ReferralType[] = [
  { id: 1, name: "Podcast", ordering: 1, isActive: true },
  { id: 2, name: "Friends or family", ordering: 2, isActive: true },
  { id: 3, name: "Newspaper", ordering: 3, isActive: true },
  { id: 4, name: "Search engine", ordering: 4, isActive: true },
  { id: 5, name: "Facebook", ordering: 5, isActive: false },
];

function amountFor(rand: () => number) {
  const u = rand();
  if (u < 0.35) return Math.round(50 + rand() * 250);
  if (u < 0.75) return Math.round((300 + rand() * 1700) / 50) * 50;
  if (u < 0.95) return Math.round((2000 + rand() * 18000) / 100) * 100;
  return Math.round((20000 + rand() * 230000) / 1000) * 1000;
}

export type FakeDonor = DonorListRow & { name: string };

export const donors: FakeDonor[] = Array.from({ length: 400 }, (_, index) => {
  const rand = mulberry32(index + 1);
  const first = firstNames[index % firstNames.length]!;
  const last = lastNames[Math.floor(index / firstNames.length) % lastNames.length]!;
  return {
    id: 1000 + index,
    name: `${first} ${last}`,
    email: `${first}.${last}`.toLowerCase() + (index >= 400 ? index : "") + "@example.org",
    registered: daysAgo(200 + Math.floor(rand() * 2400), rand),
    lastDonation: daysAgo(Math.floor(rand() * 300), rand),
    donationsCount: 1 + Math.floor(rand() * 40),
    donationsSum: Math.round(rand() * 120000),
    newsletter: rand() > 0.4,
  };
});

/** Donation rows plus the donor id the real list joins in on the detail call. */
export type FakeDonation = DonationRow & { donorId: number; email: string; methodId: number };

export const donations: FakeDonation[] = Array.from({ length: 1240 }, (_, index) => {
  const rand = mulberry32(42 + index);
  const donor = pick(rand, donors);
  const method = pick(rand, paymentMethods);
  const sum = money(amountFor(rand));
  const transactionCost = method.percentageFee
    ? percentOfMoney(sum, method.percentageFee)
    : method.flatFee
    ? money(method.flatFee)
    : null;
  return {
    id: 98_000 + 1240 - index,
    donor: donor.name,
    donorId: donor.id,
    email: donor.email,
    sum,
    transactionCost,
    paymentMethod: method.name,
    methodId: method.id,
    timestamp: daysAgo(Math.floor(rand() * 540), rand),
    kid: String(10_000_000 + Math.floor(rand() * 89_999_999)),
    taxUnitType: rand() < 0.08 ? ORGANIZATION : rand() < 0.7 ? PERSON : null,
  };
}).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

export const donationAmountEdges = [
  0, 100, 200, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000, 250000,
];

// --- One donor, for the detail template -------------------------------------------------

export const donor: Donor = {
  id: 1387,
  name: "Elias Olsen",
  email: "elias.olsen@example.org",
  newsletter: true,
  trash: false,
  registered: "2019-03-14T11:22:00Z",
};

export const donorDonations: DonorDonation[] = Array.from({ length: 23 }, (_, index) => {
  const rand = mulberry32(900 + index);
  const method = index % 3 === 0 ? paymentMethods[4]! : pick(rand, paymentMethods);
  return {
    id: 97_000 + 23 - index,
    donor: donor.name,
    donorId: donor.id,
    email: donor.email,
    sum: money(index % 3 === 0 ? 500 : amountFor(rand)),
    transactionCost: "0.00",
    paymentMethod: method.name,
    KID: index % 3 === 0 ? "000138700015" : "96891492",
    taxUnitId: 77,
    timestamp: daysAgo(index * 31 + Math.floor(rand() * 10), rand),
    metaOwnerId: 1,
  };
});

/** Mostly Global Health, spread over its organizations, with a little animal welfare. */
const yearlyOrgs = [
  {
    ID: 12,
    organization: "Against Malaria Foundation",
    abbriv: "AMF",
    causeAreaID: 1,
    weight: 0.32,
  },
  { ID: 13, organization: "Malaria Consortium", abbriv: "MC", causeAreaID: 1, weight: 0.2 },
  { ID: 15, organization: "New Incentives", abbriv: "NI", causeAreaID: 1, weight: 0.14 },
  { ID: 14, organization: "Helen Keller Intl", abbriv: "HKI", causeAreaID: 1, weight: 0.1 },
  { ID: 16, organization: "GiveDirectly", abbriv: "GD", causeAreaID: 1, weight: 0.08 },
  {
    ID: 17,
    organization: "GiveWell Top Charities Fund",
    abbriv: "TCF",
    causeAreaID: 1,
    weight: 0.06,
  },
  { ID: 21, organization: "The Humane League", abbriv: "THL", causeAreaID: 2, weight: 0.05 },
  { ID: 41, organization: "Gi Effektivt drift", abbriv: "Drift", causeAreaID: 4, weight: 0.05 },
];

export const donorYearly: DonorYearly[] = [2020, 2021, 2022, 2023, 2024, 2025, 2026].flatMap(
  (year, index) => {
    const rand = mulberry32(year);
    const base = 6000 + index * 2200;
    return yearlyOrgs.map(({ weight, ...org }) => ({
      ...org,
      value: money(Math.round(base * weight * (0.8 + rand() * 0.4))),
      year,
    }));
  },
);

export const donorDistributions: DonorDistribution[] = [
  { KID: "96891492", email: donor.email, full_name: donor.name, sum: "48210.00", count: 14 },
  { KID: "000138700015", email: donor.email, full_name: donor.name, sum: "4500.00", count: 9 },
];

export const donorTaxUnits: TaxUnit[] = [
  {
    id: 77,
    donorId: donor.id,
    name: "Elias Olsen",
    ssn: "01019012345",
    registered: "2019-03-14T11:22:00Z",
    sumDonations: "52710.00",
    numDonations: 23,
    taxDeductions: [
      { year: 2025, sumDonations: 18200, deduction: 18200, benefit: 4004 },
      { year: 2024, sumDonations: 14100, deduction: 14100, benefit: 3102 },
    ],
  },
];

export const avtaleGiroDetail: AvtaleGiroDetail = {
  ID: 4120,
  KID: "000138700015",
  amount: 500,
  payment_date: 20,
  notice: true,
  active: true,
  donorId: donor.id,
  full_name: donor.name,
  last_updated: "2026-02-01T10:00:00Z",
  created: "2023-11-02T09:13:00Z",
  cancelled: null,
  distribution: {
    kid: "000138700015",
    donorId: donor.id,
    taxUnitId: 77,
    causeAreas: [
      {
        id: 1,
        name: "Global Health",
        standardSplit: false,
        percentageShare: "100",
        organizations: [
          { id: 12, name: "Against Malaria Foundation", percentageShare: "40" },
          { id: 13, name: "Malaria Consortium", percentageShare: "25" },
          { id: 15, name: "New Incentives", percentageShare: "15" },
          { id: 14, name: "Helen Keller Intl", percentageShare: "10" },
          { id: 16, name: "GiveDirectly", percentageShare: "10" },
        ],
      },
    ],
  },
};

/** A split across cause areas, where the cause area adds information. */
export const mixedDistribution: Pick<AvtaleGiroDetail["distribution"], "causeAreas"> = {
  causeAreas: [
    {
      id: 1,
      name: "Global Health",
      standardSplit: true,
      percentageShare: "80",
      organizations: [],
    },
    {
      id: 2,
      name: "Animal welfare",
      standardSplit: false,
      percentageShare: "20",
      organizations: [
        { id: 21, name: "The Humane League", percentageShare: "70" },
        { id: 22, name: "Animal Welfare Fund", percentageShare: "30" },
      ],
    },
  ],
};

// --- Agreements ---------------------------------------------------------------------------

const vippsStatuses = [
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "ACTIVE",
  "PENDING",
  "STOPPED",
  "EXPIRED",
] as const;

export const vippsAgreements: VippsRow[] = Array.from({ length: 180 }, (_, index) => {
  const rand = mulberry32(5000 + index);
  const donorRow = pick(rand, donors);
  return {
    // Vipps agreement ids are strings; derived from the index so the other fields keep their seeds.
    ID: `agr_${(60_466_176 + index * 104_729).toString(36).toUpperCase()}`,
    KID: String(20_000_000 + Math.floor(rand() * 79_999_999)),
    amount: pick(rand, [50, 100, 150, 200, 250, 300, 500, 1000]),
    full_name: donorRow.name,
    status: pick(rand, vippsStatuses),
    monthly_charge_day: 1 + Math.floor(rand() * 28),
    timestamp_created: daysAgo(Math.floor(rand() * 1400), rand),
    agreement_url_code: `agr_${Math.floor(rand() * 36 ** 6).toString(36)}`,
  };
});

export const avtaleGiroAgreements: AvtaleGiroRow[] = Array.from({ length: 140 }, (_, index) => {
  const rand = mulberry32(7000 + index);
  const donorRow = pick(rand, donors);
  const active = rand() > 0.18;
  return {
    ID: 4000 + index,
    KID: `000${donorRow.id}${String(index).padStart(5, "0")}`,
    amount: pick(rand, [100, 200, 300, 500, 750, 1000, 2000, 5000]),
    payment_date: pick(rand, [0, 1, 5, 10, 15, 20, 25]),
    notice: rand() > 0.5,
    active,
    last_updated: daysAgo(Math.floor(rand() * 200), rand),
    created: daysAgo(200 + Math.floor(rand() * 1600), rand),
    cancelled: active ? null : daysAgo(Math.floor(rand() * 180), rand),
    full_name: donorRow.name,
  };
});

// --- Records ------------------------------------------------------------------------------

export const importLogs: LogRow[] = [
  {
    ID: 4921,
    label: "AvtaleGiro",
    displayLabel: "AvtaleGiro",
    source: null,
    filename: null,
    summary: null,
    timestamp: daysAgo(0.2, mulberry32(1)),
    meta: null,
  },
  {
    ID: 4920,
    label: "OCR",
    displayLabel: "Bank OCR",
    source: null,
    filename: null,
    summary: null,
    timestamp: daysAgo(0.6, mulberry32(2)),
    meta: null,
  },
  {
    ID: 4919,
    label: "VippsRecurring",
    displayLabel: "Vipps recurring",
    source: null,
    filename: null,
    summary: null,
    timestamp: daysAgo(1, mulberry32(3)),
    meta: null,
  },
  {
    ID: 4918,
    label: "Vipps",
    displayLabel: "Vipps",
    source: null,
    filename: null,
    summary: null,
    timestamp: daysAgo(1.4, mulberry32(4)),
    meta: null,
  },
  {
    ID: 4917,
    label: "AvtaleGiro",
    displayLabel: "AvtaleGiro",
    source: null,
    filename: null,
    summary: null,
    timestamp: daysAgo(2, mulberry32(5)),
    meta: null,
  },
];

/** Open review-queue items as reports.reviewQueue.list returns them. */
const reviewItem = (
  id: number,
  source: ReviewItem["source"],
  reason: string,
  fields: Pick<
    ReviewItem,
    "KID" | "amount" | "date" | "externalId" | "paymentId" | "message" | "name" | "location"
  >,
): ReviewItem => ({
  id,
  source,
  reason,
  metaOwnerId: null,
  ...fields,
  importLogId: 4920,
  status: "open",
  resolvedBy: null,
  resolvedAt: null,
  note: null,
  donationId: null,
  created: daysAgo(0.6, mulberry32(id)),
});

export const reviewItems: ReviewItem[] = [
  reviewItem(311, "ocr", "KID not found", {
    KID: "77812094",
    amount: "500.00",
    date: daysAgo(1, mulberry32(11)),
    externalId: "OCR-20261023-0012",
    paymentId: 5,
    message: null,
    name: "Kari Nordby",
    location: null,
  }),
  reviewItem(312, "vipps", "No KID in transaction", {
    KID: null,
    amount: "1200.00",
    date: daysAgo(1, mulberry32(12)),
    externalId: "VIPPS-88123001",
    paymentId: 4,
    message: "Til malaria",
    name: "Ola Strand",
    location: "Effektiv giving stand",
  }),
  reviewItem(313, "vipps", "Ambiguous: message matches two rules", {
    KID: null,
    amount: "350.00",
    date: daysAgo(2, mulberry32(13)),
    externalId: "VIPPS-88123044",
    paymentId: 4,
    message: "Julegave",
    name: "Sofie Lie",
    location: "Julemarked",
  }),
  reviewItem(314, "ocr", "Amount does not match agreement", {
    KID: "000100400012",
    amount: "5000.00",
    date: daysAgo(2, mulberry32(14)),
    externalId: "OCR-20261022-0004",
    paymentId: 7,
    message: null,
    name: null,
    location: null,
  }),
];

// --- Charts -------------------------------------------------------------------------------

export const monthlyTotals = [
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
].map((month, index) => {
  const rand = mulberry32(index + 7);
  const season = month.endsWith("-12") ? 2.6 : month.endsWith("-11") ? 1.4 : 1;
  const at = (base: number, spread: number) => Math.round((base + rand() * spread) * season);
  const amf = at(150_000, 60_000);
  const mc = at(90_000, 40_000);
  const ni = at(60_000, 30_000);
  const hki = at(45_000, 25_000);
  const gd = at(35_000, 20_000);
  const other = at(80_000, 40_000);
  return {
    month,
    amf,
    mc,
    ni,
    hki,
    gd,
    other,
    total: amf + mc + ni + hki + gd + other,
    donors: Math.round((1100 + rand() * 400) * (season > 2 ? 1.9 : season)),
  };
});
