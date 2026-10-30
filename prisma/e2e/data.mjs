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

// Cause area 1 (Global helse) organization ids from prisma/devdata/reference.ts
export const AGF = 1;
export const HKI = 3;
export const NI = 4;
export const AMF = 6;
