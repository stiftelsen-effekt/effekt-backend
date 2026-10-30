import { describe, expect, it } from "vitest";
import { awaitingFirstPaymentAttention } from "./attention";
import {
  awaitingFirstPaymentSearch,
  describeIntent,
  intentsList,
  methodLabel,
  splitIntents,
  toIntentFilter,
  type Intent,
} from "./model";

const intent = (overrides: Partial<Intent> = {}): Intent => ({
  id: 1,
  KID: "000001125456929",
  donorId: 7,
  donorName: "Ola Nordmann",
  amount: "5000.00",
  methodId: 2,
  method: "Bank",
  created: "2026-10-12T10:00:00.000Z",
  status: "awaiting",
  newDonor: true,
  matchedDonation: null,
  followUps: { count: 0, last: null },
  ...overrides,
});

describe("intents list filter", () => {
  it("maps URL filters to the API filter", () => {
    expect(
      toIntentFilter({
        q: "ola",
        status: ["awaiting"],
        method: ["bank", "avtalegiro"],
        created: { from: "2026-10-01", to: "2026-10-31" },
        newDonor: true,
      }),
    ).toEqual({
      statuses: ["awaiting"],
      methodIds: [2, 7],
      created: { from: "2026-10-01", to: "2026-10-31" },
      newDonorsOnly: true,
      donor: "ola",
    });
  });

  it("reads an all-digit search as a KID and leaves out empty filters", () => {
    expect(toIntentFilter({ q: " 000001125456929 ", newDonor: false })).toEqual({
      KID: "000001125456929",
    });
    expect(toIntentFilter({})).toEqual({});
  });

  it("decodes the Home attention link to the filter it counts", () => {
    const filters = intentsList.validateSearch({ ...awaitingFirstPaymentSearch });
    expect(filters).toMatchObject({
      status: "awaiting",
      method: "bank,avtalegiro",
      newDonor: "true",
    });
  });
});

describe("describeIntent", () => {
  it("says what was promised, that it's not received, and the reminder", () => {
    const { said, parts } = describeIntent(
      intent({ followUps: { count: 1, last: "2026-10-19T06:00:00.000Z" } }),
    );
    expect(said.replace(/\s/g, " ")).toBe(
      "Said they'd give 5 000,00 kr by bank transfer on 12.10.2026",
    );
    expect(parts).toEqual(["not received yet", "reminder sent 19.10.2026"]);
  });

  it("names the matched donation when received", () => {
    const { said, parts } = describeIntent(
      intent({
        methodId: 7,
        status: "received",
        matchedDonation: { id: 9, date: "2026-10-20T00:00:00.000Z", sum: "250.50" },
      }),
    );
    expect(said).toContain("by AvtaleGiro");
    expect(parts.map((p) => p.replace(/\s/g, " "))).toEqual(["received 250,50 kr on 20.10.2026"]);
  });

  it("falls back to the method's name for methods the widget no longer offers", () => {
    expect(describeIntent(intent({ methodId: 3, method: "PayPal" })).said).toContain("(PayPal)");
    expect(methodLabel(3, "PayPal")).toBe("PayPal");
    expect(methodLabel(8, "Vipps Recurring")).toBe("Vipps recurring");
  });
});

describe("splitIntents", () => {
  it("separates awaiting intents from the history", () => {
    const awaiting = intent({ id: 1 });
    const received = intent({ id: 2, status: "received" });
    const expired = intent({ id: 3, status: "expired" });
    expect(splitIntents([awaiting, received, expired])).toEqual({
      awaiting: [awaiting],
      history: [received, expired],
    });
    expect(splitIntents(undefined)).toEqual({ awaiting: [], history: [] });
  });
});

describe("awaitingFirstPaymentAttention", () => {
  it("shows only when someone is waiting, linking to the filtered list", () => {
    expect(awaitingFirstPaymentAttention(undefined)).toEqual([]);
    expect(awaitingFirstPaymentAttention({ donors: 0, days: 30 })).toEqual([]);
    const [item] = awaitingFirstPaymentAttention({ donors: 4, days: 30 });
    expect(item).toMatchObject({
      count: 4,
      href: "/intents",
      search: { status: "awaiting", method: "bank,avtalegiro", newDonor: "true" },
    });
    expect(item!.title).toBe("New donors waiting on their first bank/AvtaleGiro payment");
  });
});
