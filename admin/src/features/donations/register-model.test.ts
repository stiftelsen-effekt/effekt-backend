import { describe, expect, it } from "vitest";
import { emptyRegisterDraft, registerInput, validateRegister } from "./register-model";

const base = emptyRegisterDraft({
  sum: "1 250,50",
  date: "2026-10-20",
  time: "",
  paymentId: "2",
  ownerId: "3",
});

describe("register donation", () => {
  it("requires the essentials", () => {
    expect(validateRegister(emptyRegisterDraft())).toEqual({
      KID: "Enter the KID (digits only)",
      sum: "Enter an amount above 0",
      timestamp: "Enter the payment date",
      paymentId: "Choose the payment method",
      ownerId: "Choose the data owner",
    });
    expect(validateRegister({ ...base, mode: "distribution" })).toEqual({
      donorId: "Choose the donor",
      distribution: "The distribution must add up to 100 %",
    });
  });

  it("registers on a KID", () => {
    const draft = { ...base, KID: " 87654321 ", externalRef: "" };
    expect(validateRegister(draft)).toEqual({});
    expect(registerInput(draft)).toEqual({
      KID: "87654321",
      sum: 1250.5,
      timestamp: new Date(2026, 9, 20).toISOString(),
      paymentId: 2,
      paymentExternalRef: null,
      metaOwnerId: 3,
      sendReceipt: true,
    });
  });

  it("registers on a new distribution, never both", () => {
    const draft = {
      ...base,
      mode: "distribution" as const,
      KID: "123",
      donorId: 42,
      taxUnitId: "7",
      externalRef: " bank-1 ",
      sendReceipt: false,
      distribution: {
        causeAreas: [
          {
            id: 1,
            share: 100,
            standardSplit: false,
            organizations: [
              { id: 11, share: 100 },
              { id: 12, share: 0 },
            ],
          },
          { id: 2, share: 0, standardSplit: true, organizations: [{ id: 21, share: 100 }] },
        ],
      },
    };
    expect(validateRegister(draft)).toEqual({});
    const input = registerInput(draft);
    expect(input).not.toHaveProperty("KID");
    expect(input).toMatchObject({
      distribution: {
        donorId: 42,
        taxUnitId: 7,
        causeAreas: [
          {
            id: 1,
            percentageShare: "100",
            standardSplit: false,
            organizations: [{ id: 11, percentageShare: "100" }],
          },
        ],
      },
      paymentExternalRef: "bank-1",
      sendReceipt: false,
    });
    expect(registerInput({ ...draft, taxUnitId: "" }).distribution?.taxUnitId).toBeNull();
  });
});
