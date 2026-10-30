import { describe, expect, it } from "vitest";
import {
  avtaleGiroChargeStatuses,
  describeCharge,
  isOverdue,
  statusCounts,
  toAvtaleGiroChargeFilter,
  type AvtaleGiroChargeSummary,
} from "./avtalegiro-charges";

describe("toAvtaleGiroChargeFilter", () => {
  it("is undefined without filters", () => {
    expect(toAvtaleGiroChargeFilter({})).toBeUndefined();
    expect(toAvtaleGiroChargeFilter({ q: "  ", status: [] })).toBeUndefined();
  });

  it("reads digits in the search as a KID and anything else as a donor name", () => {
    expect(toAvtaleGiroChargeFilter({ q: " 0000012 " })).toEqual({ KID: "0000012" });
    expect(toAvtaleGiroChargeFilter({ q: "Kari" })).toEqual({ donor: "Kari" });
  });

  it("maps URL filters to the API filter", () => {
    expect(
      toAvtaleGiroChargeFilter({
        kid: "123",
        agreement: 12,
        donor: 44,
        shipment: 301,
        status: ["CLAIMED", "DELETED"],
        matched: false,
        amount: { min: 100, max: 500 },
        due: { from: "2026-10-01", to: "2026-10-31" },
      }),
    ).toEqual({
      KID: "123",
      agreementId: 12,
      donorId: 44,
      shipmentId: 301,
      statuses: ["CLAIMED", "DELETED"],
      matched: false,
      amount: { from: 100, to: 500 },
      dueDate: { from: "2026-10-01", to: "2026-10-31" },
    });
  });

  it("drops ids the API would reject and keeps open amount bounds open", () => {
    expect(toAvtaleGiroChargeFilter({ agreement: 0, shipment: -3 })).toBeUndefined();
    expect(toAvtaleGiroChargeFilter({ amount: { min: undefined, max: 250 } })).toEqual({
      amount: { to: 250 },
    });
    expect(toAvtaleGiroChargeFilter({ amount: { min: -5, max: undefined } })).toEqual({
      amount: { from: 0 },
    });
  });
});

describe("isOverdue", () => {
  it("is a claim still unpaid more than 14 days after its due date", () => {
    const claim = { status: "CLAIMED" as const, dueDate: "2026-10-01" };
    expect(isOverdue(claim, "2026-10-15")).toBe(false);
    expect(isOverdue(claim, "2026-10-16")).toBe(true);
    expect(isOverdue({ ...claim, status: "COMPLETED" }, "2026-12-01")).toBe(false);
    expect(isOverdue({ ...claim, status: "DELETED" }, "2026-12-01")).toBe(false);
  });
});

describe("describeCharge", () => {
  const charge = {
    status: "CLAIMED" as const,
    dueDate: "2026-10-28",
    donationId: null,
    shipmentId: 301,
    deletionShipmentId: null,
  };

  it("says what became of the claim", () => {
    expect(describeCharge(charge, "2026-10-27")).toMatch(/charged on the due date/);
    expect(describeCharge(charge, "2026-11-20")).toMatch(/No payment has been matched/);
    expect(describeCharge({ ...charge, status: "COMPLETED", donationId: 9001 }, "2026-11-01")).toBe(
      "Paid. The payment is registered as donation 9001.",
    );
    expect(
      describeCharge({ ...charge, status: "DELETED", deletionShipmentId: 305 }, "2026-11-01"),
    ).toMatch(/shipment 305\)\. The donor isn't charged/);
  });

  it("covers every status", () => {
    for (const status of avtaleGiroChargeStatuses) {
      expect(describeCharge({ ...charge, status }, "2026-10-27")).not.toBe("");
    }
  });
});

describe("statusCounts", () => {
  it("lists every status in order, with zero for those without charges", () => {
    const summary: AvtaleGiroChargeSummary = {
      count: 5,
      sum: "2500.00",
      byStatus: [
        { status: "DELETED", count: 1, sum: "500.00" },
        { status: "CLAIMED", count: 4, sum: "2000.00" },
      ],
    };
    const counts = statusCounts(summary);
    expect(counts.map((c) => c.status)).toEqual(avtaleGiroChargeStatuses);
    expect(counts.find((c) => c.status === "CLAIMED")?.count).toBe(4);
    expect(counts.find((c) => c.status === "COMPLETED")?.count).toBe(0);
  });

  it("leaves counts unknown while loading", () => {
    expect(statusCounts(undefined).every((c) => c.count === undefined)).toBe(true);
  });
});
