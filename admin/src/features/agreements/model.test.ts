import { describe, expect, it } from "vitest";
import type { CauseAreaConfig, DistributionDraft } from "@/features/distribution/model";
import { canRefund, toChargeFilter } from "./charges";
import { checkDate, summarizeCheck, validationDate, validationState } from "./avtalegiro-check";
import { parseWholeKroner, splitChanges } from "./edits";
import { fromListRow, toAgreementFilter } from "./list";
import { describeChargeDay, fromVipps, ordinal, shortChargeDay } from "./model";

describe("charge days", () => {
  it("reads as ordinals, 0 as the last day", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "28th",
    ]);
    expect(describeChargeDay(15)).toBe("15th of every month");
    expect(describeChargeDay(0)).toBe("Last day of the month");
    expect(shortChargeDay(0)).toBe("Last");
  });
});

describe("toAgreementFilter", () => {
  it("always limits to Vipps and AvtaleGiro", () => {
    expect(toAgreementFilter({})).toEqual({ providers: ["vipps", "avtalegiro"] });
    expect(toAgreementFilter({ provider: ["vipps"] }).providers).toEqual(["vipps"]);
  });

  it("reads digits in the search box as a KID, other text as a donor", () => {
    expect(toAgreementFilter({ q: " 0009513 " })).toMatchObject({ KID: "0009513" });
    expect(toAgreementFilter({ q: "kari@x.no" })).toMatchObject({ donor: "kari@x.no" });
    expect(toAgreementFilter({ q: "123", kid: "456" })).toMatchObject({ KID: "456" });
  });

  it("maps ranges and clamps charge days to 0–28", () => {
    expect(
      toAgreementFilter({
        status: ["active", "paused"],
        amount: { min: 100, max: undefined },
        chargeDay: { min: -2, max: 31 },
        created: { from: "2026-01-01", to: "2026-01-31" },
      }),
    ).toEqual({
      providers: ["vipps", "avtalegiro"],
      statuses: ["active", "paused"],
      amount: { from: 100, to: undefined },
      chargeDay: { from: 0, to: 28 },
      created: { from: "2026-01-01", to: "2026-01-31" },
    });
  });
});

describe("fromListRow", () => {
  it("keeps the provider's id and links to the provider page", () => {
    const row = fromListRow({
      provider: "vipps",
      id: "agr_1",
      KID: "123",
      donorId: 7,
      donorName: null,
      amount: 250,
      chargeDay: 0,
      status: "paused",
      providerStatus: "ACTIVE",
      created: "2026-01-02T03:04:05.000Z" as never,
      lastUpdated: null,
      cancelled: null,
      pausedUntil: "2026-12-01",
    });
    expect(row).toMatchObject({
      key: "vipps:agr_1",
      href: "/agreements/vipps/agr_1",
      donorName: "",
      status: "paused",
      providerStatus: "ACTIVE",
      pausedUntil: "2026-12-01",
    });
  });
});

describe("fromVipps", () => {
  it("maps EXPIRED (never accepted) to stopped, like agreements.list", () => {
    expect(
      fromVipps({
        ID: "agr_1",
        full_name: "Kari",
        status: "EXPIRED",
        amount: 100,
        monthly_charge_day: 1,
        KID: "1",
        timestamp_created: "2026-01-01",
        agreement_url_code: "x",
      } as never).status,
    ).toBe("stopped");
  });
});

describe("parseWholeKroner", () => {
  it("accepts whole kroner within the limit", () => {
    expect(parseWholeKroner("1 500", 10_000)).toBe(1500);
    expect(parseWholeKroner("500 kr", 10_000)).toBe(500);
    expect(parseWholeKroner("0", 10_000)).toBeNull();
    expect(parseWholeKroner("12,50", 10_000)).toBeNull();
    expect(parseWholeKroner("10001", 10_000)).toBeNull();
  });
});

describe("splitChanges", () => {
  const config = [
    {
      id: 1,
      name: "Global health",
      organizations: [
        { id: 10, name: "AMF" },
        { id: 11, name: "HKI" },
      ],
    },
    { id: 2, name: "Animals", organizations: [{ id: 20, name: "THL" }] },
  ] as unknown as CauseAreaConfig[];
  const draft = (health: number, custom = false): DistributionDraft => ({
    causeAreas: [
      {
        id: 1,
        share: health,
        standardSplit: !custom,
        organizations: custom
          ? [
              { id: 10, share: 100 },
              { id: 11, share: 0 },
            ]
          : [
              { id: 10, share: 60 },
              { id: 11, share: 40 },
            ],
      },
      { id: 2, share: 100 - health, standardSplit: true, organizations: [{ id: 20, share: 100 }] },
    ],
  });

  it("lists only the shares when organizations stay the same", () => {
    expect(splitChanges(config, draft(60), draft(80))).toEqual([
      { label: "Global health", before: "60 %", after: "80 %" },
      { label: "Animals", before: "40 %", after: "20 %" },
    ]);
  });

  it("names the organizations when they change", () => {
    expect(splitChanges(config, draft(60), draft(60, true))).toEqual([
      {
        label: "Global health",
        before: "60 % (standard split)",
        after: "60 % (AMF 100 %)",
      },
    ]);
  });

  it("is empty for the same split", () => {
    expect(splitChanges(config, draft(50), draft(50))).toEqual([]);
  });
});

describe("Vipps charges", () => {
  it("reads the search box as KID, agreement id or donor", () => {
    expect(toChargeFilter({ q: "0001234" })).toEqual({ KID: "0001234" });
    expect(toChargeFilter({ q: "agr_abc" })).toEqual({ agreementID: "agr_abc" });
    expect(toChargeFilter({ q: "Kari" })).toEqual({ donor: "Kari" });
    expect(toChargeFilter({})).toBeUndefined();
    expect(
      toChargeFilter({
        status: ["FAILED"],
        due: { from: "2026-10-01", to: undefined },
        amount: { min: undefined, max: 500 },
      }),
    ).toEqual({
      statuses: ["FAILED"],
      dueDate: { from: "2026-10-01", to: undefined },
      amount: { from: undefined, to: 500 },
    });
  });

  it("only refunds charged money", () => {
    expect(canRefund({ status: "CHARGED" })).toBe(true);
    expect(canRefund({ status: "REFUNDED" })).toBe(false);
    expect(canRefund({ status: "FAILED" })).toBe(false);
  });
});

describe("AvtaleGiro check", () => {
  const today = new Date(2026, 9, 27);

  it("defaults to today and ignores invalid dates", () => {
    expect(checkDate(undefined, today)).toBe("2026-10-27");
    expect(checkDate("2026-02-30", today)).toBe("2026-10-27");
    expect(checkDate("2026-10-03", today)).toBe("2026-10-03");
  });

  it("places validation days in this month or the last", () => {
    expect(validationDate(27, today)).toBe("2026-10-27");
    expect(validationDate(28, today)).toBe("2026-09-28");
    expect(validationDate(0, today)).toBeNull();
    expect(validationDate(31, today)).toBeNull(); // no 31st of September
  });

  it("sums expected, received and missing exactly", () => {
    expect(
      summarizeCheck([{ amount: 200 }, { amount: 0.1 }], [{ sum: "200.00" }], [{ amount: 0.2 }]),
    ).toEqual({
      expectedCount: 2,
      expectedSum: "200.10",
      receivedCount: 1,
      receivedSum: "200.00",
      missingCount: 1,
      missingSum: "0.20",
    });
  });

  it("classifies a day by what came in", () => {
    expect(validationState({ expected: "6300", actual: "6300" })).toBe("complete");
    expect(validationState({ expected: "6300", actual: "200" })).toBe("partial");
    expect(validationState({ expected: "6300", actual: "0" })).toBe("none");
  });
});
