import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { fundraisersList, toFundraiserFilter } from "@/features/fundraisers/model";
import { emailMessage, plainMessage, ssnMessage, toFormErrors } from "./form-errors";
import {
  donorAgreements,
  donorTotals,
  donorsList,
  maskSsn,
  searchToFilter,
  toDonorFilter,
  yearlyChart,
  type YearlyAggregateRow,
} from "./model";

const decode = <F extends Record<string, { decode: (raw: unknown) => unknown }>>(
  filters: F,
  raw: Record<string, string>,
) =>
  Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, filters[key]!.decode(value)]));

describe("searchToFilter", () => {
  it("reads digits as a donor id, the rest as part of a name or email", () => {
    expect(searchToFilter(" 1387 ")).toEqual({ donorId: 1387 });
    expect(searchToFilter("kari@")).toEqual({ nameOrEmail: "kari@" });
    expect(searchToFilter("gmail.com")).toEqual({ nameOrEmail: "gmail.com" });
    expect(searchToFilter("Kari Nord")).toEqual({ nameOrEmail: "Kari Nord" });
    expect(searchToFilter("  ")).toEqual({});
    expect(searchToFilter(undefined)).toEqual({});
  });
});

describe("toDonorFilter", () => {
  it("is undefined without filters", () => {
    expect(toDonorFilter({})).toBeUndefined();
  });

  it("maps URL values to the API filter", () => {
    const filters = decode(donorsList.filters, {
      q: "olsen",
      registered: "2024-01-01..2024-12-31",
      donated: "2025-01-01..",
      sum: "1000..5000",
      count: "..3",
      fundraiser: "never",
      fundraiserType: "facebook,homebrew",
      newsletter: "false",
      org: "1,12",
      referral: "4",
    });
    expect(toDonorFilter(filters)).toEqual({
      nameOrEmail: "olsen",
      registered: { from: "2024-01-01", to: "2024-12-31" },
      donationsDateRange: { from: "2025-01-01", to: undefined },
      donationsSum: { from: 1000, to: 5000 },
      donationsCount: { from: undefined, to: 3 },
      fundraiserGiving: "never",
      fundraiserTypes: ["facebook", "homebrew"],
      newsletter: false,
      recipientOrgIDs: [1, 12],
      referralTypeIDs: [4],
    });
  });

  it("asks for a donation in the period when filtering by donation date", () => {
    const filters = decode(donorsList.filters, { donated: "2024-01-01..2024-12-31" });
    expect(toDonorFilter(filters)).toEqual({
      donationsDateRange: { from: "2024-01-01", to: "2024-12-31" },
      donationsCount: { from: 1 },
    });
  });

  it("drops unknown choice values from the URL", () => {
    const filters = decode(donorsList.filters, { fundraiser: "sometimes" });
    expect(toDonorFilter(filters)).toBeUndefined();
  });
});

describe("toFundraiserFilter", () => {
  it("reads digits as a fundraiser id and text as the owner's name", () => {
    expect(toFundraiserFilter({ q: "42" })).toEqual({ fundraiserId: 42 });
    expect(toFundraiserFilter({ q: "Kari" })).toEqual({ donor: "Kari" });
    expect(toFundraiserFilter({})).toBeUndefined();
  });

  it("maps ranges and organizations", () => {
    const filters = decode(fundraisersList.filters, {
      registered: "..2025-06-30",
      sum: "100..",
      count: "2..10",
      org: "3",
    });
    expect(toFundraiserFilter(filters)).toEqual({
      registrationDate: { from: undefined, to: "2025-06-30" },
      donationSum: { from: 100, to: undefined },
      donationCount: { from: 2, to: 10 },
      organizationIDs: [3],
    });
  });
});

const row = (ID: number, abbriv: string, year: number, value: string): YearlyAggregateRow => ({
  ID,
  organization: `Org ${abbriv}`,
  abbriv,
  causeAreaID: 1,
  value,
  year,
});

describe("donorTotals", () => {
  it("sums exactly and separates operations", () => {
    const totals = donorTotals([
      row(1, "AMF", 2025, "0.10"),
      row(1, "AMF", 2025, "0.20"),
      row(11, "Drift", 2025, "5.000000000000000000000000000000"),
      row(2, "GD", 2026, "1082.960000000000000000000000000000"),
    ]);
    expect(totals.total).toBe("1088.26");
    expect(totals.operations).toBe("5.00");
    expect(totals.excludingOperations).toBe("1083.26");
    expect(totals.byYear.get(2025)).toBe("5.30");
    expect(totals.byYear.get(2026)).toBe("1082.96");
  });

  it("is zero for a donor without donations", () => {
    expect(donorTotals([])).toMatchObject({ total: "0.00", excludingOperations: "0.00" });
  });
});

describe("yearlyChart", () => {
  it("keeps the largest organizations and groups the rest", () => {
    const rows = [
      row(1, "A", 2024, "500"),
      row(2, "B", 2024, "400"),
      row(3, "C", 2025, "300"),
      row(4, "D", 2025, "200"),
      row(5, "E", 2025, "100"),
      row(6, "F", 2025, "50"),
    ];
    const chart = yearlyChart(rows, 5);
    expect(chart.series.map((s) => s.key)).toEqual(["org1", "org2", "org3", "org4", "rest"]);
    expect(chart.data).toEqual([
      { year: "2024", org1: 500, org2: 400, org3: 0, org4: 0, rest: 0 },
      { year: "2025", org1: 0, org2: 0, org3: 300, org4: 200, rest: 150 },
    ]);
  });

  it("doesn't group when every organization fits", () => {
    const chart = yearlyChart([row(1, "A", 2024, "1"), row(2, "B", 2023, "2")]);
    expect(chart.series.map((s) => s.key)).toEqual(["org2", "org1"]);
    expect(chart.data.map((d) => d.year)).toEqual(["2023", "2024"]);
  });
});

describe("donorAgreements", () => {
  it("joins AvtaleGiro and Vipps in NO and normalizes Vipps status case", () => {
    const rows = donorAgreements("Kari", {
      avtalegiro: [
        {
          ID: 1,
          active: true,
          amount: 900,
          KID: "000007315768114",
          payment_date: 11,
          created: "2023-09-14T13:45:34.000Z",
          cancelled: null,
          last_updated: null,
          notice: true,
          full_name: "Kari",
        },
      ],
      vipps: [
        {
          ID: "VA_1",
          status: "active" as never,
          donorID: 6,
          full_name: null,
          KID: "000006162677212",
          timestamp_created: "2024-05-02T11:25:50.000Z",
          monthly_charge_day: 26,
          force_charge_date: null,
          paused_until_date: null,
          amount: 800,
          agreement_url_code: "x",
        },
      ],
    });
    expect(rows.map((r) => [r.type, r.status, r.href])).toEqual([
      ["avtalegiro", "active", "/agreements/avtalegiro/1"],
      ["vipps", "active", "/agreements/vipps/VA_1"],
    ]);
    expect(rows[1]!.donorName).toBe("Kari");
  });
});

describe("maskSsn", () => {
  it("hides the individual digits of personal numbers only", () => {
    expect(maskSsn("04466914812")).toBe("044669 •••••");
    expect(maskSsn("923609016")).toBe("923609016");
    expect(maskSsn(undefined)).toBe("");
  });
});

describe("toFormErrors", () => {
  const trpcError = (message: string, data: unknown) =>
    Object.assign(new TRPCClientError(message), { data });

  it("uses zod field errors first", () => {
    const error = trpcError("bad", {
      code: "BAD_REQUEST",
      fieldErrors: { email: ["Invalid email"] },
    });
    expect(toFormErrors(error)).toEqual({ fields: { email: "Invalid email" } });
  });

  it("puts service messages on the field they're about", () => {
    const ssn = trpcError("Invalid ssn (failed fnr validation) checksum", { code: "BAD_REQUEST" });
    expect(toFormErrors(ssn, { ssn: ssnMessage, email: emailMessage }).fields).toEqual({
      ssn: plainMessage("Invalid ssn (failed fnr validation) checksum"),
    });
    const email = trpcError("Email already exists", { code: "CONFLICT" });
    expect(toFormErrors(email, { ssn: ssnMessage, email: emailMessage }).fields).toEqual({
      email: "A donor with this email already exists.",
    });
  });

  it("falls back to a form-level message", () => {
    const result = toFormErrors(trpcError("boom", { code: "INTERNAL_SERVER_ERROR" }));
    expect(result.fields).toEqual({});
    expect(result.form?.title).toBe("Something went wrong");
  });
});
