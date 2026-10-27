import { describe, expect, it } from "vitest";
import type { CauseAreaConfig } from "@/features/distribution/model";
import {
  draftForItem,
  isResolvedElsewhere,
  nextOpenId,
  previousOpenId,
  reviewRegisterInput,
  summariseUpload,
  uploadForm,
} from "./model";

const config: CauseAreaConfig[] = [];

describe("summariseUpload", () => {
  const base = { valid: 10, invalid: 3, queue: { added: 2, existing: 0 }, importLogId: 7 };
  const items = [{}, {}] as never[];

  it("uses OCR's own count of duplicates", () => {
    expect(
      summariseUpload({
        source: "ocr",
        result: { ...base, invalid: 2, invalidTransactions: items, ignored: 5 },
      }),
    ).toEqual({ kind: "payments", registered: 10, ignored: 5, review: 2, queue: base.queue });
  });

  it("counts non-queued invalid transactions as ignored for the other sources", () => {
    expect(
      summariseUpload({ source: "vipps", result: { ...base, invalidTransactions: items } }),
    ).toMatchObject({ registered: 10, ignored: 1, review: 2 });
  });

  it("keeps a failed queue write visible", () => {
    expect(
      summariseUpload({
        source: "bankNo",
        result: { ...base, queue: null, invalidTransactions: items },
      }),
    ).toMatchObject({ queue: null });
  });

  it("lists Facebook campaigns", () => {
    const campaign = { ID: "1", fundraiserTitle: "x", campaignOwnerName: "y", permalink: "z" };
    expect(summariseUpload({ source: "facebook", result: { fbCampaigns: [campaign] } })).toEqual({
      kind: "facebook",
      campaigns: [campaign],
    });
  });
});

describe("uploadForm", () => {
  it("sends the file and the data owner", () => {
    const form = uploadForm(new File(["x"], "r.ocr"), "3");
    expect((form.get("report") as File).name).toBe("r.ocr");
    expect(form.get("metaOwnerID")).toBe("3");
  });
});

describe("draftForItem", () => {
  const item = {
    KID: null,
    amount: "1234.50",
    date: "2026-10-20T10:30:00.000Z",
    paymentId: 4,
    externalId: "VIPPS-1",
  };

  it("prefills from the transaction, on a new distribution without a KID", () => {
    const draft = draftForItem(item, config, "3");
    expect(draft).toMatchObject({
      mode: "distribution",
      sum: "1234,50",
      paymentId: "4",
      externalRef: "VIPPS-1",
      ownerId: "3",
      sendReceipt: true,
    });
    expect(draft.date).toMatch(/^2026-10-2\d$/);
  });

  it("uses the KID when there is one", () => {
    expect(draftForItem({ ...item, KID: "123456" }, config, "3")).toMatchObject({
      mode: "kid",
      KID: "123456",
    });
  });

  it("builds the register input with the item id", () => {
    const input = reviewRegisterInput(7, draftForItem({ ...item, KID: "123456" }, config, "3"));
    expect(input).toMatchObject({
      id: 7,
      KID: "123456",
      sum: 1234.5,
      paymentId: 4,
      paymentExternalRef: "VIPPS-1",
      metaOwnerId: 3,
    });
  });
});

describe("queue navigation", () => {
  it("goes to the next open item, wrapping around", () => {
    expect(nextOpenId([2, 5, 9], 5)).toBe(9);
    expect(nextOpenId([2, 5, 9], 9)).toBe(2);
    expect(nextOpenId([2, 5, 9], 6)).toBe(9);
    expect(nextOpenId([5], 5)).toBeNull();
    expect(previousOpenId([2, 5, 9], 5)).toBe(2);
    expect(previousOpenId([2, 5, 9], 2)).toBe(9);
  });

  it("tells the queue's CONFLICT from a donation conflict", () => {
    expect(isResolvedElsewhere("Review item 12 is already ignored")).toBe(true);
    expect(isResolvedElsewhere("EXISTING_DONATION | already registered")).toBe(false);
  });
});
