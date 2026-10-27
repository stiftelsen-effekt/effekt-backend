/**
 * The Record payment form (approved rounds): parsing and the checks the API makes in
 * regranting.transfers.recordPayment, so the form says what is wrong before saving.
 */
import { parseMoneyInput } from "@/features/donations/form";
import { textError } from "@/features/settings/record-dialog";
import { formatMoney } from "@/lib/format";
import { fromMinorUnits, moneySign, toMinorUnits } from "@/lib/money";

export type PaymentForm = {
  paidAt: string;
  currency: string;
  amountForeign: string;
  fxRate: string;
  bankFee: string;
  bankRef: string;
  paidBy: "foundation" | "external";
};

const decimal8 = /^\d{1,16}([.,]\d{1,8})?$/;
/** "1 234,5678" → "1234.5678"; null if it isn't a positive decimal with ≤ 8 decimals. */
export function parsePreciseDecimal(text: string): string | null {
  const cleaned = text.replace(/[\s  ]/g, "");
  if (!decimal8.test(cleaned)) return null;
  const value = cleaned.replace(",", ".");
  return Number(value) > 0 ? value : null;
}

/** A decimal string with at most 8 decimals as an integer in units of 10⁻⁸. */
const toE8 = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 8n + BigInt(fraction.padEnd(8, "0"));
};

/**
 * NOK that `amountForeign` × `fxRate` comes to, and whether it is within max(1 kr, 0.5 %) of the
 * transfer's NOK amount. The same rule as the API (transfers.recordPayment), in exact arithmetic.
 */
export function convertedAmount(amountForeign: string, fxRate: string, amountNok: string) {
  const product = toE8(amountForeign) * toE8(fxRate); // units of 10⁻¹⁶ NOK
  const expected = toMinorUnits(amountNok) * 10n ** 14n;
  const diff = product > expected ? product - expected : expected - product;
  const half = (expected < 0n ? -expected : expected) / 200n; // 0.5 %
  const allowed = half > 10n ** 16n ? half : 10n ** 16n;
  // Rounded to øre for display
  const nok = fromMinorUnits((product + 5n * 10n ** 13n) / 10n ** 14n);
  return { nok, allowed: fromMinorUnits(allowed / 10n ** 14n), ok: diff <= allowed };
}

/**
 * The payment form's errors. As the API: a foreign-currency transfer needs the amount paid in
 * that currency and the FX rate, and they must come to the transfer's NOK amount within
 * max(1 kr, 0.5 %); a NOK transfer has neither.
 */
export function validatePayment(v: PaymentForm, amountNok: string) {
  const currency = v.currency.trim();
  const isNok = currency === "NOK";
  const foreign = v.amountForeign.trim() === "" ? null : parsePreciseDecimal(v.amountForeign);
  const rate = v.fxRate.trim() === "" ? null : parsePreciseDecimal(v.fxRate);
  const converted =
    !isNok && foreign !== null && rate !== null ? convertedAmount(foreign, rate, amountNok) : null;
  return {
    paidAt: v.paidAt ? undefined : "Enter the day the bank paid it",
    currency: /^[A-Z]{3,8}$/.test(currency) ? undefined : "Enter a code like NOK, EUR or BTC",
    amountForeign:
      v.amountForeign.trim() !== "" && foreign === null
        ? "Enter a positive amount with at most 8 decimals"
        : isNok && foreign !== null
        ? "A NOK transfer has no foreign amount; clear it or change the currency"
        : !isNok && foreign === null
        ? `Enter the amount paid in ${currency || "the currency"}`
        : converted && !converted.ok
        ? `${foreign} ${currency} at ${rate} is ${formatMoney(
            converted.nok,
          )}, but the transfer is ${formatMoney(amountNok)} (more than ${formatMoney(
            converted.allowed,
          )} apart)`
        : undefined,
    fxRate:
      v.fxRate.trim() !== "" && rate === null
        ? "Enter NOK per unit, e.g. 11,6234"
        : isNok && rate !== null
        ? "A NOK transfer has no FX rate; clear it or change the currency"
        : !isNok && rate === null
        ? `Enter NOK per ${currency || "unit"}`
        : undefined,
    bankFee:
      v.bankFee.trim() === "" ||
      (parseMoneyInput(v.bankFee) !== null && moneySign(parseMoneyInput(v.bankFee)!) >= 0)
        ? undefined
        : "Enter an amount in kroner, 0 or more",
    bankRef: textError(v.bankRef, { label: "the bank reference", max: 255 }),
  };
}
