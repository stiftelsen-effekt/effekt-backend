/**
 * Tunable parameters for the local dev data generator (prisma/devdata/generate.ts).
 *
 * The numbers are rounded aggregates of the Norwegian production database
 * (EffektDonasjonDB), read in October 2026 with COUNT/SUM/AVG/histogram queries only: monthly
 * counts and sums, payment method mix, amount buckets, agreement statuses and cohorts, charge
 * status mix, payment day histograms. No rows, names, KIDs or other identifying values were
 * copied. Rates are per month at scale 1 (SEED_SCALE multiplies every volume).
 *
 * Reference values from production for comparison (Oct 2025 - Sep 2026):
 *   ~1 700 donations / month (Dec ~3 500), ~1.7-3 MNOK / month (Dec ~11 MNOK, big gifts
 *   make single months spike), ~940 active AvtaleGiro and ~650 active Vipps agreements.
 *
 * Changing anything here changes the generated data: databases seeded before the change can no
 * longer be topped up and need `pnpm dev:env:reset` (the top-up detects this and says so).
 */

export const config = {
  /** Years of history before "now" at the first seed */
  years: 5,

  /** Yearly growth of new agreements and one-off donations (prod: roughly x2.2 over 5 years) */
  growthPerYear: 0.17,

  avtaleGiro: {
    /** New agreements per month "now" (prod 2025: ~31/month) */
    newPerMonth: 31,
    /** Agreements that exist when the history starts (created during the year before) */
    initialStock: 390,
    /** Share that never gets activated by the bank (stay drafts: active = 0, no cancel date) */
    neverActivated: 0.2,
    /** Days from draft to activation by the bank */
    activationDays: [3, 20] as [number, number],
    /** Monthly probability that an active agreement is cancelled (prod cohorts: 1.1-1.5 %) */
    monthlyChurn: 0.0115,
    /** Share of expected claims that do not arrive in a month (prod: ~2.8 %) */
    missedClaim: 0.028,
    /** Share with notice before each claim */
    notice: 0.77,
    /**
     * Claims are recorded per agreement and due date (Avtalegiro_agreement_charges) for this many
     * recent days, sent this many banking days before the due date
     */
    chargeHistoryDays: 120,
    claimBankDaysAhead: 4,
    /** Share of claim days where MPS rejects the first file and a retry sends the claims again */
    rejectedShipment: 0.05,
    /** Monthly amount in NOK -> weight (prod: most common amounts among active agreements) */
    amounts: {
      1000: 123,
      500: 120,
      400: 110,
      200: 94,
      300: 82,
      250: 58,
      100: 54,
      1500: 34,
      2000: 29,
      725: 19,
      600: 18,
      150: 15,
      3000: 14,
      2500: 8,
      5000: 9,
      10000: 3,
      750: 10,
      800: 10,
      350: 8,
    } as Record<number, number>,
    /** Share of agreements with an "odd" amount (lognormal around 1 000, rounded to 25);
     * together with the table this gives prod's average of ~800-850 NOK */
    oddAmountShare: 0.2,
    /** Payment day (0 = last day of month) -> weight; prod histogram of active agreements */
    paymentDays: {
      0: 42,
      1: 39,
      2: 17,
      3: 22,
      4: 10,
      5: 10,
      6: 12,
      7: 9,
      8: 11,
      9: 12,
      10: 28,
      11: 17,
      12: 72,
      13: 44,
      14: 19,
      15: 150,
      16: 56,
      17: 24,
      18: 22,
      19: 12,
      20: 87,
      21: 48,
      22: 44,
      23: 18,
      24: 15,
      25: 37,
      26: 24,
      27: 20,
      28: 23,
    } as Record<number, number>,
  },

  vipps: {
    /** New agreements per month "now" (prod 2025: ~24/month) */
    newPerMonth: 24,
    initialStock: 140,
    /** Never accepted by the donor -> EXPIRED (prod: ~8 %) */
    neverAccepted: 0.08,
    /** Monthly probability that an active agreement is stopped (prod cohorts: ~2 %) */
    monthlyChurn: 0.02,
    /** Share of stopped agreements with a cancellation_date (older stops often lack it) */
    cancellationDateShare: 0.7,
    /** Monthly amount in NOK -> weight (prod avg ~500, median 300-400) */
    amounts: {
      100: 12,
      150: 5,
      200: 16,
      250: 10,
      300: 13,
      400: 8,
      500: 18,
      750: 3,
      1000: 11,
      1500: 3,
      2000: 3,
      3000: 1,
    } as Record<number, number>,
    /** Charge day (0 = last day of month) -> weight; prod histogram of active agreements */
    chargeDays: {
      0: 44,
      1: 33,
      2: 13,
      3: 17,
      4: 10,
      5: 13,
      6: 12,
      7: 9,
      8: 8,
      9: 9,
      10: 14,
      11: 10,
      12: 44,
      13: 30,
      14: 13,
      15: 74,
      16: 34,
      17: 12,
      18: 9,
      19: 23,
      20: 52,
      21: 23,
      22: 19,
      23: 17,
      24: 17,
      25: 31,
      26: 29,
      27: 15,
      28: 18,
    } as Record<number, number>,
    /** Charges are created this many days before the due date (prod: always 3) */
    chargeLeadDays: 3,
    /** Outcome of a recurring charge once due (prod Jul-Oct 2026) */
    chargeOutcome: { CHARGED: 0.955, FAILED: 0.036, CANCELLED: 0.006, REFUNDED: 0.003 } as Record<
      string,
      number
    >,
    /** Outcome of the initial charge when an agreement is accepted */
    initialOutcome: { CHARGED: 0.88, CANCELLED: 0.12 } as Record<string, number>,
  },

  oneOff: {
    /** One-off donations per month "now", outside fundraisers and big gifts (prod: ~200) */
    perMonth: 200,
    /** Month (1-12) -> multiplier. Dec: tax deduction deadline; Mar/Sep: campaigns */
    seasonality: {
      1: 0.95,
      2: 1.0,
      3: 2.3,
      4: 1.3,
      5: 1.1,
      6: 1.05,
      7: 1.0,
      8: 0.95,
      9: 1.7,
      10: 1.25,
      11: 1.15,
      12: 4.5,
    } as Record<number, number>,
    /** Share of one-off donations from donors who gave before (prod: ~1 500 new donors / year) */
    returningDonor: 0.6,
    /** Payment method id -> weight among one-off donations (prod Oct 2025 - Sep 2026) */
    methods: { 6: 2700, 2: 1240, 4: 630, 5: 460 } as Record<number, number>,
    /** Amount buckets [from, to) -> weight per method (prod histograms) */
    amountBuckets: {
      2: {
        "50-100": 13,
        "100-200": 61,
        "200-500": 267,
        "500-1000": 274,
        "1000-2500": 261,
        "2500-10000": 161,
        "10000-50000": 204,
      },
      4: {
        "20-100": 308,
        "100-200": 86,
        "200-500": 87,
        "500-1000": 67,
        "1000-2500": 51,
        "2500-10000": 31,
        "10000-30000": 2,
      },
      5: {
        "50-100": 36,
        "100-200": 66,
        "200-500": 144,
        "500-1000": 105,
        "1000-2500": 60,
        "2500-10000": 25,
        "10000-50000": 16,
      },
      6: {
        "50-100": 107,
        "100-200": 270,
        "200-500": 743,
        "500-1000": 714,
        "1000-2500": 572,
        "2500-10000": 261,
        "10000-50000": 43,
      },
    } as Record<number, Record<string, number>>,
    /** Share of amounts snapped to a round number */
    roundAmountShare: 0.8,
    /** December: share of one-off donations that top up to the 25 000 NOK tax deduction limit */
    decemberTaxTopUp: 0.06,
  },

  /** Bank transfers of 50 000 NOK and more (prod: ~56 / year, a third above 250 000) */
  bigGifts: { perYear: 50, decemberMultiplier: 3, companyShare: 0.4 },

  /** Very rare one-off registrations with the "Influenced" method (prod: a few per year, MNOK) */
  influencedPerYear: 0.6,

  /** Payroll giving (Lønnsdonasjon), only from 2025 (prod: ~0.6 / month, 2-10 kNOK) */
  payrollPerMonth: 0.6,

  /**
   * Methods that only existed for a period (absolute dates). Monthly counts at scale 1.
   * Facebook and PayPal are history; Innsamling/Gavekort (Vipps) ran 2023-11 to 2025-02.
   */
  retiredMethods: [
    { paymentId: 9, from: "2000-01-01", to: "2023-03-01", perMonth: 120, decemberMultiplier: 6 },
    { paymentId: 3, from: "2000-01-01", to: "2023-12-31", perMonth: 9, decemberMultiplier: 1 },
    { paymentId: 13, from: "2023-11-01", to: "2025-02-28", perMonth: 80, decemberMultiplier: 2 },
    { paymentId: 14, from: "2023-11-01", to: "2025-02-28", perMonth: 9, decemberMultiplier: 3 },
  ],

  fundraisers: {
    /** Ordinary fundraisers started per month, with ~15 transactions each */
    perMonth: 2.3,
    transactionsMean: 15,
    /** Christmas fundraisers started late Nov / early Dec, with ~150 transactions each */
    christmasPerYear: 12,
    christmasTransactionsMean: 120,
    /** Days a fundraiser collects */
    durationDays: [14, 45] as [number, number],
    /** Share of transactions with a message / with the sender's name shown (prod ~32 % each) */
    messageShare: 0.32,
    showNameShare: 0.32,
    /** Who gives through a fundraiser: a new donor, an earlier donor, or the shared anonymous donor */
    donor: { new: 0.4, existing: 0.2, anonymous: 0.4 } as Record<string, number>,
  },

  donors: {
    /** Share of new donors who say yes to the newsletter (prod: ~24 %) */
    newsletter: 0.24,
    /** Share of new donors answering "how did you hear about us" (prod: ~70 %) */
    referralAnswer: 0.7,
    /** Probability that a donor registers a tax unit, by how they first gave */
    taxUnit: { avtaleGiro: 0.6, vipps: 0.45, oneOff: 0.35, bigGift: 0.9 },
    /** Share of one-off bank donors that are companies */
    companyShare: 0.03,
  },

  distributions: {
    /** Share of (non-fundraiser) distributions with the standard split (prod: ~66 %) */
    standardSplit: 0.66,
    /** Custom splits: number of organizations -> weight (prod) */
    customOrgCount: { 1: 406, 2: 88, 3: 26, 4: 13, 5: 10, 6: 11, 7: 6, 8: 4, 9: 2 } as Record<
      number,
      number
    >,
    /** Share of custom distributions that include operations ("Drift"), with a 5-25 % share */
    operationsShare: 0.04,
    /** Share of new distributions to the other cause areas (prod Norway has one cause area;
     * the extra two exist so cause area charts have more than one series) */
    otherCauseAreas: { animals: 0.03, climate: 0.02 },
    /** Share of distributions owned by the other data owners (prod: ~0.7 % EA Norge) */
    dataOwners: { 1: 0.003, 2: 0.007, 3: 0.99 } as Record<number, number>,
    /** Widget payment intents that never turned into a donation, relative to completed ones */
    abandonedIntents: 0.3,
  },

  reviewQueue: {
    /** Unmatched report transactions per day */
    perDay: 0.6,
    /** Most items are handled within a week; some linger for weeks */
    lingerShare: 0.3,
    /** Of the handled items, the share that is registered (the rest are ignored) */
    registeredShare: 0.75,
  },

  /** Stop feedback: share of cancellations with an answer, reason id -> weight (prod) */
  stopFeedback: {
    share: 0.25,
    reasons: { 1: 49, 2: 11, 3: 38, 4: 5, 5: 10, 10: 11, 11: 23 } as Record<number, number>,
  },

  /** Import logs, shipments etc. are only generated for this many recent days */
  operationalLogDays: 400,
};
