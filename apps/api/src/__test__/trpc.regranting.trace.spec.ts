import { expect } from "chai";
import type { Request, Response } from "express";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const api = createCallerFactory(appRouter)({
  req: {} as Request,
  res: {} as Response,
  auth: { permissions: ["admin"], email: "bob@example.org", sub: "auth0|bob" } as any,
}).regranting;

const expectBadRequest = async (promise: Promise<unknown>, message?: RegExp) => {
  try {
    await promise;
    expect.fail("expected BAD_REQUEST");
  } catch (err: any) {
    expect(err.code, err.message).to.equal("BAD_REQUEST");
    if (message) expect(err.message).to.match(message);
  }
};

describe("regranting tracing inputs", () => {
  it("breakdown: a round's breakdown is at its cutoff, and unknown keys are refused", async () => {
    await expectBadRequest(
      api.balances.breakdown({ organizationId: 1, roundId: 3, at: "2026-09-30" }),
      /leave out at/,
    );
    await expectBadRequest(api.balances.breakdown({ organizationId: 1, extra: 1 } as any));
    await expectBadRequest(api.balances.breakdown({ organizationId: 1, at: "30.09.2026" }));
  });

  it("composition: needs a round id", async () => {
    await expectBadRequest(api.rounds.composition({ roundId: 0 }));
  });

  it("reconciliation: months in order, at most 60", async () => {
    await expectBadRequest(api.reconciliation.monthly({ from: "2026-13", to: "2026-12" }));
    await expectBadRequest(
      api.reconciliation.monthly({ from: "2026-05", to: "2026-04" }),
      /ends before it starts/,
    );
    await expectBadRequest(
      api.reconciliation.monthly({ from: "2020-01", to: "2025-01" }),
      /at most 60 months/,
    );
  });
});
