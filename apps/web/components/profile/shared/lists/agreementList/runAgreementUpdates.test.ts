import { describe, expect, it, vi } from "vitest";
import { runAgreementUpdates } from "./runAgreementUpdates";

describe("runAgreementUpdates", () => {
  it("is true when every change succeeds, running them in order", async () => {
    const calls: string[] = [];
    const ok = await runAgreementUpdates([
      async () => (calls.push("price"), true),
      async () => (calls.push("day"), true),
      async () => (calls.push("distribution"), true),
    ]);
    expect(ok).toBe(true);
    expect(calls).toEqual(["price", "day", "distribution"]);
  });

  it("stops at the first failed change and reports failure", async () => {
    const distribution = vi.fn(async () => true);
    const ok = await runAgreementUpdates([async () => true, async () => null, distribution]);
    expect(ok).toBe(false);
    expect(distribution).not.toHaveBeenCalled();
  });

  it("reports failure when an earlier change failed even though the last one succeeded", async () => {
    // Used to be reported as saved, as only the last result was checked
    const ok = await runAgreementUpdates([async () => null, async () => true]);
    expect(ok).toBe(false);
  });

  it("treats a thrown error as a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = await runAgreementUpdates([
      async () => {
        throw new Error("network");
      },
    ]);
    expect(ok).toBe(false);
  });
});
