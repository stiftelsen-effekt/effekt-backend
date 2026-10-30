import { describe, expect, it, vi } from "vitest";
import type { TrpcClient } from "../lib/trpc/client";
import { PaymentMethod } from "../components/shared/components/Widget/types/Enums";
import { getEstimatedLtv } from "./ltv";

const clientWith = (query: () => Promise<unknown>) =>
  ({ site: { ltvEstimate: { query: vi.fn(query) } } }) as unknown as TrpcClient;

const estimates = [
  { label: "AvtaleGiro", expectedLtv: 86263, median: 500 },
  { label: "Vipps", expectedLtv: 47640, median: 400 },
];

describe("getEstimatedLtv", () => {
  it("weights the estimate by the sum relative to the median", async () => {
    const trpc = clientWith(async () => estimates);
    expect(await getEstimatedLtv({ method: PaymentMethod.VIPPS, sum: 1600, trpc })).toBe(95280);
    expect(await getEstimatedLtv({ method: PaymentMethod.AVTALEGIRO, sum: 500, trpc })).toBe(86263);
  });

  it("asks nothing for other payment methods", async () => {
    const trpc = clientWith(async () => estimates);
    expect(await getEstimatedLtv({ method: PaymentMethod.BANK, sum: 500, trpc })).toBeNull();
    expect(trpc.site.ltvEstimate.query).not.toHaveBeenCalled();
  });

  it("is null when the call fails (e.g. on the Danish site)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const trpc = clientWith(async () => {
      throw new Error("site.ltvEstimate is not available on this site");
    });
    expect(await getEstimatedLtv({ method: PaymentMethod.VIPPS, sum: 500, trpc })).toBeNull();
  });
});
