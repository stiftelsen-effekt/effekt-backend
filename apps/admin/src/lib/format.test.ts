import { describe, expect, it } from "vitest";
import { formatCompact, formatDate, formatMoney, formatMoneyInput, formatNumber } from "./format";

const nbsp = /[  ]/g;
const plain = (value: string) => value.replace(nbsp, " ").replace("−", "-");

describe("formatMoney", () => {
  it("formats NOK with grouping and kr", () => {
    expect(plain(formatMoney(1234567))).toBe("1 234 567,00 kr");
  });

  it("supports decimals and negative values", () => {
    expect(plain(formatMoney(-249.5))).toBe("-249,50 kr");
  });

  it("renders a dash for missing values", () => {
    expect(formatMoney(null)).toBe("–");
    expect(formatMoney(null, { precision: "whole" })).toBe("–");
    expect(formatNumber(undefined)).toBe("–");
  });
});

describe("the money rule", () => {
  it("shows exact amounts with two decimals, always", () => {
    expect(plain(formatMoney("1500.00"))).toBe("1 500,00 kr");
    expect(plain(formatMoney(1500))).toBe("1 500,00 kr");
    expect(plain(formatMoney("1234.5"))).toBe("1 234,50 kr");
    expect(plain(formatMoney("0.30"))).toBe("0,30 kr");
    expect(plain(formatMoney("0.00"))).toBe("0,00 kr");
    expect(plain(formatMoney("1500", { currency: false }))).toBe("1 500,00");
  });

  it("rounds glanceable amounts to whole kroner, half away from zero", () => {
    expect(plain(formatMoney("1500.00", { precision: "whole" }))).toBe("1 500 kr");
    expect(plain(formatMoney("1234.50", { precision: "whole" }))).toBe("1 235 kr");
    expect(plain(formatMoney("1234.49", { precision: "whole" }))).toBe("1 234 kr");
    expect(plain(formatMoney("-0.50", { precision: "whole" }))).toBe("-1 kr");
    expect(plain(formatMoney("90071992547409.93", { precision: "whole" }))).toBe(
      "90 071 992 547 410 kr",
    );
  });

  it("gives every value in a column the same number of decimals", () => {
    const column = ["1500", "1234.5", "0.3", "-12"].map((value) => plain(formatMoney(value)));
    expect(column.every((text) => /,\d\d kr$/.test(text))).toBe(true);
    const glance = ["1500", "1234.5", "0.3"].map((value) =>
      plain(formatMoney(value, { precision: "whole" })),
    );
    expect(glance.some((text) => text.includes(","))).toBe(false);
  });

  it("formats the same value the same way whatever its input form", () => {
    const forms = ["1500", "1500.0", "1500.00", 1500, 1500.0];
    expect(new Set(forms.map((value) => formatMoney(value))).size).toBe(1);
    expect(formatMoney("1234.50")).toBe(formatMoney(1234.5));
  });

  it("writes form inputs with the decimal comma, two decimals and no grouping", () => {
    expect(formatMoneyInput("1000.00")).toBe("1000,00");
    expect(formatMoneyInput(1000)).toBe("1000,00");
    expect(formatMoneyInput("249.5")).toBe("249,50");
    expect(formatMoneyInput(null)).toBe("");
  });
});

describe("formatCompact", () => {
  it("abbreviates axis values in one style", () => {
    expect(formatCompact(500)).toBe("500");
    expect(formatCompact(5000)).toBe("5k");
    expect(formatCompact(7500)).toBe("7,5k");
    expect(formatCompact(15000)).toBe("15k");
    expect(formatCompact(1_400_000)).toBe("1,4M");
  });
});

describe("formatDate", () => {
  it("uses the Norwegian date pattern", () => {
    expect(formatDate("2026-10-24")).toBe("24.10.2026");
  });

  it("shows instants in Oslo time", () => {
    // 22:30 UTC on 31 Dec is 23:30 in Oslo, still the 31st.
    expect(formatDate("2024-12-31T22:30:00Z", "datetime")).toBe("31.12.2024 23:30");
    // 23:30 UTC on 31 Dec is already 1 Jan in Oslo.
    expect(formatDate("2024-12-31T23:30:00Z")).toBe("01.01.2025");
    expect(formatDate("2024-07-01T12:00:00Z", "time")).toBe("14:00");
    expect(formatDate("2024-10-01T12:00:00Z", "month")).toBe("Oct 2024");
  });

  it("returns a dash for invalid input", () => {
    expect(formatDate("not a date")).toBe("–");
  });
});
