// Deterministic fake data for the /design showcase. Names are randomly combined, not real donors.

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

export const paymentMethods = [
  "Bank transfer",
  "AvtaleGiro",
  "Vipps",
  "Vipps recurring",
  "PayPal",
  "Swish",
] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const donationStatuses = ["PROCESSED", "PENDING", "REFUNDED"] as const;
export type DonationStatus = (typeof donationStatuses)[number];

export const causeAreas = ["Global health", "Animal welfare", "Climate", "Operations"] as const;

export type FakeDonation = {
  id: number;
  donorId: number;
  donor: string;
  email: string;
  method: PaymentMethod;
  amount: number;
  fee: number;
  kid: string;
  status: DonationStatus;
  timestamp: string;
};

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

function amountFor(rand: () => number) {
  const u = rand();
  if (u < 0.35) return Math.round(50 + rand() * 250);
  if (u < 0.75) return Math.round((300 + rand() * 1700) / 50) * 50;
  if (u < 0.95) return Math.round((2000 + rand() * 18000) / 100) * 100;
  return Math.round((20000 + rand() * 230000) / 1000) * 1000;
}

function buildDonations(count: number): FakeDonation[] {
  const rand = mulberry32(42);
  const now = new Date("2026-10-24T12:00:00Z").getTime();
  return Array.from({ length: count }, (_, index) => {
    const firstIndex = Math.floor(rand() * firstNames.length);
    const lastIndex = Math.floor(rand() * lastNames.length);
    const first = firstNames[firstIndex]!;
    const last = lastNames[lastIndex]!;
    const method = pick(rand, paymentMethods);
    const amount = amountFor(rand);
    const statusRoll = rand();
    return {
      id: 98_000 + count - index,
      donorId: 1000 + firstIndex * lastNames.length + lastIndex,
      donor: `${first} ${last}`,
      email: `${first}.${last}`.toLowerCase().replace(/ø/g, "o") + "@example.org",
      method,
      amount,
      fee:
        method === "Bank transfer" || method === "AvtaleGiro"
          ? 0
          : Math.round(amount * 0.025 * 100) / 100,
      kid: String(10_000_000 + Math.floor(rand() * 89_999_999)),
      status: statusRoll < 0.9 ? "PROCESSED" : statusRoll < 0.97 ? "PENDING" : "REFUNDED",
      timestamp: new Date(
        now - Math.floor(rand() * 540) * 86_400_000 - Math.floor(rand() * 86_400_000),
      ).toISOString(),
    } satisfies FakeDonation;
  });
}

export const fakeDonations = buildDonations(1240);

export const amountEdges = [
  0, 100, 200, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000, 250000,
];

export function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

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
  const health = Math.round((380_000 + rand() * 160_000) * season);
  const animals = Math.round((90_000 + rand() * 60_000) * season);
  const climate = Math.round((60_000 + rand() * 50_000) * season);
  const operations = Math.round((25_000 + rand() * 15_000) * season);
  return {
    month,
    health,
    animals,
    climate,
    operations,
    total: health + animals + climate + operations,
    donors: Math.round((1100 + rand() * 400) * (season > 2 ? 1.9 : season)),
  };
});

export const donorYearly = [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year, index) => {
  const rand = mulberry32(year);
  const base = 6000 + index * 2200;
  return {
    year: String(year),
    health: Math.round(base * (0.55 + rand() * 0.2)),
    animals: Math.round(base * (0.15 + rand() * 0.1)),
    climate: Math.round(base * (0.1 + rand() * 0.08)),
    donations: 6 + Math.floor(rand() * 8),
  };
});

export const fakeLogEntry = {
  id: 48213,
  label: "AvtaleGiro",
  timestamp: "2026-10-24T05:00:12.000Z",
  meta: {
    file: "avtalegiro-claims-2026-10-24.txt",
    shipment: 1182,
    results: { valid: 412, invalid: 3, failed: 0 },
    invalidKids: ["10422781", "23019941", "88120344"],
    durationMs: 4813,
    dryRun: false,
  },
};
