import { describe, expect, it } from "vitest";
import type { CauseAreaConfig } from "@/features/distribution/model";
import {
  draftForItem,
  importOfSelection,
  isResolvedElsewhere,
  nextOpenId,
  previousOpenId,
  queueOutcome,
  resolverName,
  reviewRegisterInput,
  summariseUpload,
  uploadForm,
} from "./model";

const config: CauseAreaConfig[] = [];

describe("summariseUpload", () => {
  const base = {
    valid: 10,
    invalid: 3,
    queue: { added: 2, existing: 0, skipped: 0, statuses: { open: 2, registered: 0, ignored: 0 } },
    importLogId: 7,
  };
  const items = [{}, {}] as never[];

  it("uses OCR's own count of duplicates", () => {
    expect(
      summariseUpload({
        source: "ocr",
        result: { ...base, invalid: 2, invalidTransactions: items, ignored: 5 },
      }),
    ).toEqual({
      kind: "payments",
      registered: 10,
      ignored: 5,
      review: 2,
      queue: base.queue,
      importLogId: 7,
    });
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

describe("resolverName", () => {
  const user = { id: "local-admin", name: "Dev Admin", email: "dev@gieffektivt.no" };
  it("names the signed-in admin", () => {
    expect(resolverName("local-admin", user)).toBe("you (Dev Admin)");
    expect(resolverName("dev@gieffektivt.no", user)).toBe("you (Dev Admin)");
  });
  it("falls back to the email or id", () => {
    expect(resolverName("kari@gieffektivt.no", user)).toBe("kari@gieffektivt.no");
    expect(resolverName("auth0|123", null)).toBe("auth0|123");
    expect(resolverName(null, user)).toBe("someone");
  });
});

describe("queueOutcome", () => {
  it("counts only open items as needing a decision", () => {
    expect(
      queueOutcome({
        added: 0,
        existing: 4,
        skipped: 0,
        statuses: { open: 2, registered: 1, ignored: 1 },
      }),
    ).toEqual({ open: 2, handled: 2, added: 0, skipped: 0 });
  });
  it("treats everything queued as open without status counts, and keeps skipped", () => {
    expect(queueOutcome({ added: 3, existing: 1, skipped: 2, statuses: null })).toEqual({
      open: 4,
      handled: 0,
      added: 3,
      skipped: 2,
    });
  });
});

describe("importOfSelection", () => {
  const row = (id: number, importLogId: number | null) => ({ id, importLogId }) as never;
  const rows = [row(1, 88), row(2, 88), row(3, 90), row(4, null)];

  it("is the import when every selected row comes from it", () => {
    expect(importOfSelection(["1", "2"], rows)).toBe(88);
  });

  it("is null for several imports, items without one, rows not on the page, or nothing selected", () => {
    expect(importOfSelection(["1", "3"], rows)).toBeNull();
    expect(importOfSelection(["4"], rows)).toBeNull();
    expect(importOfSelection(["1", "99"], rows)).toBeNull();
    expect(importOfSelection([], rows)).toBeNull();
    expect(importOfSelection(["1"], undefined)).toBeNull();
  });
});
