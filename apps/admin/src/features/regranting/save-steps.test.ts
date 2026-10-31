import { describe, expect, it, vi } from "vitest";
import { saveSteps } from "./save-steps";

describe("saveSteps", () => {
  it("reuses what a step created when the save is retried after a later step failed", async () => {
    const steps = saveSteps();
    const createReport = vi.fn(async () => ({ id: 5 }));
    const createAllocation = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ id: 9 });
    const save = async () => {
      const report = await steps.once("report", { reportedAt: "2026-10-01" }, createReport);
      return createAllocation(report.id);
    };
    await expect(save()).rejects.toThrow("network");
    await expect(save()).resolves.toEqual({ id: 9 });
    expect(createReport).toHaveBeenCalledTimes(1);
    expect(createAllocation).toHaveBeenNthCalledWith(2, 5);
  });

  it("runs a step again when its input changed, or after a reset", async () => {
    const steps = saveSteps();
    const run = vi.fn(async () => 1);
    await steps.once("grantee", { name: "A" }, run);
    await steps.once("grantee", { name: "B" }, run);
    steps.reset();
    await steps.once("grantee", { name: "B" }, run);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("doesn't remember a step that failed", async () => {
    const steps = saveSteps();
    const run = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(2);
    await expect(steps.once("report", {}, run)).rejects.toThrow("x");
    await expect(steps.once("report", {}, run)).resolves.toBe(2);
  });
});
