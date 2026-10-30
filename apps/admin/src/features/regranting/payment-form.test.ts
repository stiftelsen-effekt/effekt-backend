import { describe, expect, it } from "vitest";
import { convertedAmount, validatePayment, type PaymentForm } from "./payment-form";

const form = (overrides: Partial<PaymentForm> = {}): PaymentForm => ({
  paidAt: "2026-10-05",
  currency: "EUR",
  amountForeign: "1000",
  fxRate: "11,52",
  bankFee: "",
  bankRef: "",
  paidBy: "foundation",
  ...overrides,
});
const errors = (v: PaymentForm, amountNok = "11520.00") =>
  Object.fromEntries(Object.entries(validatePayment(v, amountNok)).filter(([, e]) => e));

describe("payment form", () => {
  it("accepts a foreign payment that comes to the transfer within max(1 kr, 0.5 %)", () => {
    expect(errors(form())).toEqual({});
    // 0.5 % of 11 520 is 57.60
    expect(errors(form({ fxRate: "11,5776" }))).toEqual({});
    expect(convertedAmount("1000", "11.578", "11520.00")).toEqual({
      nok: "11578.00",
      allowed: "57.60",
      ok: false,
    });
    expect(convertedAmount("0.95", "11.5", "10.00").ok).toBe(true);
    expect(convertedAmount("0.7", "11.5", "10.00")).toMatchObject({ allowed: "1.00", ok: false });
  });

  it("explains a wrong FX rate on the amount", () => {
    const e = errors(form({ fxRate: "12" }));
    expect(e.amountForeign).toMatch(/^1000 EUR at 12 is .*12.*000.*but the transfer is/);
  });

  it("needs both the amount and the rate for a foreign currency", () => {
    expect(Object.keys(errors(form({ amountForeign: "", fxRate: "" })))).toEqual([
      "amountForeign",
      "fxRate",
    ]);
  });

  it("a NOK payment has neither", () => {
    const nok = form({ currency: "NOK", amountForeign: "", fxRate: "" });
    expect(errors(nok, "100.00")).toEqual({});
    expect(Object.keys(errors({ ...nok, fxRate: "1" }, "100.00"))).toEqual(["fxRate"]);
    expect(Object.keys(errors({ ...nok, amountForeign: "100" }, "100.00"))).toEqual([
      "amountForeign",
    ]);
  });

  it("the bank fee is 0 or more", () => {
    expect(Object.keys(errors(form({ bankFee: "-5" })))).toEqual(["bankFee"]);
    expect(errors(form({ bankFee: "0" }))).toEqual({});
  });
});
