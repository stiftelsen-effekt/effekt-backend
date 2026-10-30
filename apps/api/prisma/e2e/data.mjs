/**
 * Fixed ids and KIDs of the full-stack e2e donor. Shared by prisma/e2e/seed.mjs, which writes
 * them, and the Cypress specs in apps/web/cypress/e2e/fullstack, which assert on them. No imports,
 * so the Cypress browser bundle can include it.
 */
export const DONOR_ID = 900001;

/** KID = 6 digit donor id + 8 digits + Luhn check digit, like real KIDs (see prisma/devdata) */
const kid = (n) => {
  const partial = String(DONOR_ID).padStart(6, "0") + String(n).padStart(8, "0");
  return partial + luhnCheckDigit(partial);
};

function luhnCheckDigit(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

export const KIDS = {
  vippsCustom: kid(1),
  vippsStandard: kid(2),
  vippsStopped: kid(3),
  avtalegiro: kid(4),
  avtalegiroToCancel: kid(5),
  autogiro: kid(6),
  bank: kid(7),
};

/** The donor's tax units. KIDS.bank belongs to the second one, every other KID to the first. */
export const TAX_UNITS = {
  main: { id: 900001, name: "E2E Testgiver", ssn: "15868510045" },
  spouse: { id: 900002, name: "E2E Ektefelle", ssn: "15868510126" },
};

// Cause area 1 (Global helse) organization ids from prisma/devdata/reference.ts
export const AGF = 1;
export const HKI = 3;
export const NI = 4;
export const AMF = 6;

/**
 * Figures in the e2e EffektAnalysisDB (normally filled by the nightly analysis jobs), read by the
 * results page and the front page's results teaser through tRPC site.*. seed.mjs writes them.
 */
export const RESULTS = {
  /** Only_rec_orgs_Donations: [donor id, sum]; the headline sums these and counts the donors */
  recommendedOrgDonations: [
    [1, "1000000.00"],
    [2, "200000.00"],
    [2, "34567.89"],
    [3, "100000.00"],
  ],
  headline: { totalDonationsToRecommendedOrgs: "1334567.89", numberOfDonors: 3 },
  inserted: "2026-06-30 05:00:00",
  /** v_Daily_donations: [date, sum] */
  daily: [
    ["2025-01-15", "1500.00"],
    ["2025-02-01", "250.50"],
  ],
  /** OP_ref_data, one row per year: the referral columns are all `referralValue` */
  referralYears: [2024, 2025],
  referralValue: 7,
  /** v_Monthly_donations_per_org: [org, month, total] */
  monthly: [
    ["AMF", "2025-01", "10000"],
    ["AMF", "2025-02", "5000"],
  ],
};
