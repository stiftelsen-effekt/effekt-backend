/**
 * Money arithmetic without float drift. The API returns amounts and aggregates as decimal
 * strings ("1234.50"); adding those as JS numbers loses øre over many rows. Here amounts are
 * held as integer minor units (øre/öre) in a bigint, so sums, averages and comparisons are
 * exact, and results go back out as decimal strings for `Money` / `formatMoney`.
 *
 * Use `moneyToNumber` only where a float is harmless: chart values, histogram bins, ratios.
 * Never sum its results.
 */

/** A decimal string from the API ("1234.50", "-12", "0.5") or a whole/decimal number. */
export type MoneyInput = string | number;

/** Fraction digits kept: øre/öre. More digits are rounded half away from zero. */
const SCALE = 2;
const UNIT = 10n ** BigInt(SCALE);
const DECIMAL = /^([+-])?(\d+)(?:\.(\d*))?$|^([+-])?\.(\d+)$/;

/** Parses a decimal into integer minor units. Throws on anything that isn't a plain decimal. */
export function toMinorUnits(value: MoneyInput): bigint {
  const text = typeof value === "number" ? numberToDecimal(value) : value.trim();
  const match = DECIMAL.exec(text);
  if (!match) throw new TypeError(`Not a decimal amount: ${JSON.stringify(value)}`);
  const sign = match[1] ?? match[4];
  const whole = match[2] ?? "0";
  const fraction = match[3] ?? match[5] ?? "";
  const kept = fraction.slice(0, SCALE).padEnd(SCALE, "0");
  let minor = BigInt(whole) * UNIT + BigInt(kept);
  // Round half away from zero on the first dropped digit.
  if ((fraction[SCALE] ?? "0") >= "5") minor += 1n;
  return sign === "-" ? -minor : minor;
}

/** Integer minor units back to a canonical decimal string with two fraction digits. */
export function fromMinorUnits(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / UNIT;
  const fraction = String(abs % UNIT).padStart(SCALE, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Normalises any accepted input to a canonical decimal string; null/invalid stay null. */
export function toMoneyString(value: MoneyInput | null | undefined): string | null {
  if (value == null) return null;
  try {
    return fromMinorUnits(toMinorUnits(value));
  } catch {
    return null;
  }
}

/** Exact sum. Nulls are skipped (a missing fee adds nothing). */
export function sumMoney(values: Iterable<MoneyInput | null | undefined>): string {
  let total = 0n;
  for (const value of values) if (value != null) total += toMinorUnits(value);
  return fromMinorUnits(total);
}

/** Mean rounded half away from zero to whole øre; "0.00" for no values. */
export function averageMoney(values: readonly (MoneyInput | null | undefined)[]): string {
  const present = values.filter((value): value is MoneyInput => value != null);
  if (present.length === 0) return fromMinorUnits(0n);
  return fromMinorUnits(divideRounded(toMinorUnits(sumMoney(present)), BigInt(present.length)));
}

/** Median; the mean of the two middle values for an even count. "0.00" for no values. */
export function medianMoney(values: readonly MoneyInput[]): string {
  if (values.length === 0) return fromMinorUnits(0n);
  const sorted = values.map(toMinorUnits).sort(compareBigint);
  const mid = Math.floor(sorted.length / 2);
  return fromMinorUnits(
    sorted.length % 2 ? sorted[mid]! : divideRounded(sorted[mid - 1]! + sorted[mid]!, 2n),
  );
}

/** Exact comparison for sorting and range filters: negative, 0 or positive. */
export function compareMoney(a: MoneyInput, b: MoneyInput): number {
  return compareBigint(toMinorUnits(a), toMinorUnits(b));
}

/** -1, 0 or 1. */
export function moneySign(value: MoneyInput): -1 | 0 | 1 {
  const minor = toMinorUnits(value);
  return minor < 0n ? -1 : minor > 0n ? 1 : 0;
}

/**
 * `percent` % of an amount (percent as the API sends shares: "12.5" or 12.5), rounded half
 * away from zero to whole øre. For a split that must add back up exactly, allocate the last
 * share as the remainder.
 */
export function percentOfMoney(value: MoneyInput, percent: MoneyInput): string {
  // Percent with up to 6 fraction digits, as an integer scaled by 1e6.
  const [whole = "0", fraction = ""] = String(percent).trim().split(".");
  const scaled = BigInt(whole + fraction.slice(0, 6).padEnd(6, "0"));
  return fromMinorUnits(divideRounded(toMinorUnits(value) * scaled, 100n * 1_000_000n));
}

/** A float for charts, histograms and ratios. Not for arithmetic on money. */
export function moneyToNumber(value: MoneyInput | null | undefined): number {
  const text = toMoneyString(value);
  return text == null ? Number.NaN : Number(text);
}

function compareBigint(a: bigint, b: bigint) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Integer division rounded half away from zero. */
function divideRounded(numerator: bigint, denominator: bigint) {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (n * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

/** Plain positional notation for a number (no exponent), so 1e21 or 1e-7 parse correctly. */
function numberToDecimal(value: number) {
  if (!Number.isFinite(value)) return String(value);
  const text = String(value);
  if (!/e/i.test(text)) return text;
  return value.toFixed(SCALE + 1);
}
