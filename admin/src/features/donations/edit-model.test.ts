import { describe, expect, it } from "vitest";
import type { CauseAreaConfig } from "@/features/distribution/model";
import { setShare, setStandardSplit } from "@/features/distribution/model";
import { editChanges, editDraftFromDonation, validateEdit, type Donation } from "./edit-model";

const org = (id: number, causeAreaId: number, standardShare: number) => ({
  id,
  causeAreaId,
  name: `Org ${id}`,
  standardShare,
  isActive: true,
  ordering: id,
});
const area = (id: number, name: string, organizations: ReturnType<typeof org>[]) => ({
  id,
  name,
  standardPercentageShare: 0,
  shortDescription: null,
  longDescription: null,
  informationUrl: null,
  isActive: true,
  ordering: id,
  organizations,
});
const config = [
  area(1, "Global health", [org(11, 1, 100), org(12, 1, 0)]),
  area(2, "Animal welfare", [org(21, 2, 100)]),
] as CauseAreaConfig[];

const donation = {
  id: 7,
  donor: "Kari",
  donorId: 3,
  email: "kari@example.org",
  sum: "500.00",
  transactionCost: "2.00",
  timestamp: new Date(2026, 2, 5, 14, 30, 12).toISOString(),
  paymentId: 2,
  paymentExternalRef: "ref-1",
  paymentMethod: "Bank",
  KID: "12345678",
  metaOwnerId: 3,
  fundraiserId: null,
  distribution: {
    kid: "12345678",
    donorId: 3,
    taxUnitId: 9,
    causeAreas: [
      {
        id: 1,
        percentageShare: "100.000000000000000",
        standardSplit: true,
        organizations: [{ id: 11, percentageShare: "100.000000000000000" }],
      },
    ],
  },
} as unknown as Donation;

const lookups = {
  config,
  paymentMethodName: (id: number) => ({ 2: "Bank", 4: "Vipps" }[id]),
  ownerName: (id: number) => ({ 3: "Gi Effektivt", 1: "Effekt" }[id]),
};

describe("donation edit", () => {
  it("starts unchanged and valid", () => {
    const draft = editDraftFromDonation(donation, config);
    expect(draft).toMatchObject({ sum: "500", date: "2026-03-05", time: "14:30" });
    expect(validateEdit(draft, donation)).toEqual({});
    expect(editChanges(donation, draft, lookups)).toEqual({ input: { id: 7 }, changes: [] });
  });

  it("sends only changed fields, money as numbers, with before → after lines", () => {
    const draft = {
      ...editDraftFromDonation(donation, config),
      sum: "600,50",
      paymentId: "4",
      ownerId: "1",
      time: "15:00",
    };
    const { input, changes } = editChanges(donation, draft, lookups);
    expect(input).toEqual({
      id: 7,
      sum: 600.5,
      paymentId: 4,
      metaOwnerId: 1,
      timestamp: new Date(2026, 2, 5, 15, 0).toISOString(),
    });
    expect(changes.map((c) => c.label)).toEqual(["Amount", "Date", "Payment method", "Data owner"]);
    expect(changes[0]!.after).toContain("600,50");
    expect(changes[2]).toEqual({ label: "Payment method", before: "Bank", after: "Vipps" });
  });

  it("sends the whole distribution with donor and tax unit when the split changes", () => {
    const base = editDraftFromDonation(donation, config);
    let distribution = setShare(setShare(base.distribution, 1, 50), 2, 50);
    distribution = setStandardSplit(distribution, config, 2, true);
    const { input, changes } = editChanges(donation, { ...base, distribution }, lookups);
    expect(input.distribution).toEqual({
      donorId: 3,
      taxUnitId: 9,
      causeAreas: [
        {
          id: 1,
          percentageShare: "50",
          standardSplit: true,
          organizations: [{ id: 11, percentageShare: "100" }],
        },
        {
          id: 2,
          percentageShare: "50",
          standardSplit: true,
          organizations: [{ id: 21, percentageShare: "100" }],
        },
      ],
    });
    expect(changes).toEqual([
      {
        label: "Distribution",
        before: "Global health 100 %",
        after: "Global health 50 %, Animal welfare 50 %",
      },
    ]);
  });

  it("rejects what the API can't store", () => {
    const draft = editDraftFromDonation(donation, config);
    expect(
      validateEdit(
        { ...draft, sum: "0", transactionCost: "", externalRef: "", date: "2026-02-31" },
        donation,
      ),
    ).toEqual({
      sum: "Enter an amount above 0",
      transactionCost: "The fee can't be removed; enter 0 instead",
      externalRef: "The external reference can't be removed",
      timestamp: "Enter a valid date",
    });
    expect(
      validateEdit({ ...draft, distribution: setShare(draft.distribution, 1, 90) }, donation),
    ).toEqual({ distribution: "The distribution must add up to 100 %" });
    expect(validateEdit({ ...draft, sum: "" }, donation)).toEqual({ sum: "Enter the amount" });
    expect(validateEdit({ ...draft, sum: "100,123" }, donation)).toEqual({
      sum: "Enter the amount in kroner with at most two decimals, like 1250,50",
    });
  });

  it("keeps øre typed with a comma or a point", () => {
    const draft = editDraftFromDonation(donation, config);
    for (const sum of ["1250,50", "1250.5"]) {
      const { input } = editChanges(
        donation,
        { ...draft, sum },
        { config, paymentMethodName: () => undefined, ownerName: () => undefined },
      );
      expect(input.sum).toBe(1250.5);
    }
  });
});
