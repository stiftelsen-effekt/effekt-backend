import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { fromDateTimeInputs, parseMoneyInput, serverErrors, toDateTimeInputs } from "./form";

const trpcError = (code: string, message: string, fieldErrors?: Record<string, string[]>) =>
  TRPCClientError.from({
    error: { code: -32600, message, data: { code, httpStatus: 400, fieldErrors } },
  } as never);

describe("parseMoneyInput", () => {
  it.each([
    ["500", "500.00"],
    ["1 234,5", "1234.50"],
    ["1234.56", "1234.56"],
    ["1 000 kr", "1000.00"],
    ["0,01", "0.01"],
  ])("%s → %s", (input, expected) => expect(parseMoneyInput(input)).toBe(expected));

  it.each(["", "abc", "1.234,50", "12.345", "-5", "1e3"])("rejects %j", (input) =>
    expect(parseMoneyInput(input)).toBeNull(),
  );
});

describe("date and time inputs", () => {
  it("round-trips a local date and time", () => {
    const iso = fromDateTimeInputs("2026-03-05", "14:30")!;
    expect(toDateTimeInputs(iso)).toEqual({ date: "2026-03-05", time: "14:30" });
  });
  it("defaults to midnight and rejects invalid dates", () => {
    expect(new Date(fromDateTimeInputs("2026-03-05", "")!).getHours()).toBe(0);
    expect(fromDateTimeInputs("2026-02-31", "10:00")).toBeNull();
    expect(fromDateTimeInputs("", "10:00")).toBeNull();
  });
});

describe("serverErrors", () => {
  const names = {
    KID: "kid",
    paymentExternalRef: "externalRef",
    paymentId: "method",
    sum: "sum",
    distribution: "distribution",
  } as const;

  it("puts a duplicate external reference next to that field", () => {
    const result = serverErrors(
      trpcError("CONFLICT", "A donation with external reference abc already exists"),
      names,
    );
    expect(result.fields).toEqual({
      externalRef: "A donation with external reference abc already exists",
    });
    expect(result.general).toBeUndefined();
  });

  it("maps invalid references and strips internal codes", () => {
    expect(
      serverErrors(trpcError("BAD_REQUEST", "NO_KID | KID 123 does not exist"), names),
    ).toMatchObject({ fields: { kid: "KID 123 does not exist" } });
    expect(
      serverErrors(trpcError("BAD_REQUEST", "Payment method 99 does not exist"), names),
    ).toMatchObject({ fields: { method: "Payment method 99 does not exist" } });
    expect(
      serverErrors(
        trpcError("BAD_REQUEST", "Organization 5 does not belong to cause area 1"),
        names,
      ).fields.distribution,
    ).toContain("does not belong");
  });

  it("uses zod field errors, and keeps unknown keys as a general message", () => {
    const result = serverErrors(
      trpcError("BAD_REQUEST", "✖ Invalid input", {
        sum: ["Amount can have at most two decimals"],
        sendReceipt: ["Expected boolean"],
      }),
      names,
    );
    expect(result.fields).toEqual({ sum: "Amount can have at most two decimals" });
    expect(result.general?.hint).toBe("Expected boolean");
  });

  it("falls back to a general message for unrelated failures", () => {
    expect(serverErrors(trpcError("BAD_REQUEST", "Something odd"), names)).toEqual({
      fields: {},
      general: { title: "That didn't work", hint: "Something odd" },
    });
    expect(serverErrors(new Error("boom"), names).general?.title).toBe("Something went wrong");
  });
});
