import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

/** Ignoring many review items at once: selected items, or every open item from one import */
const createCaller = createCallerFactory(appRouter);

const callerWith = (auth?: Record<string, unknown>) =>
  createCaller({ req: {} as Request, res: {} as Response, auth: auth as any });

const admin = () =>
  callerWith({ permissions: ["admin"], sub: "auth0|admin", email: "ops@example.org" }).reports
    .reviewQueue;

const expectTrpcError = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

describe("tRPC reports.reviewQueue bulk ignore", () => {
  afterEach(() => sinon.restore());

  it("ignores the selected items once each, with one note, and reports what was skipped", async () => {
    const ignoreMany = sinon.stub(DAO.reviewqueue, "ignoreMany").resolves(2);
    const result = await admin().ignoreMany({ ids: [5, 6, 6, 7], note: "Wrong file uploaded" });
    expect(result).to.deep.equal({ ignored: 2, skipped: 1 });
    const [ids, resolvedBy, note] = ignoreMany.firstCall.args;
    expect(ids).to.deep.equal([5, 6, 7]);
    expect(resolvedBy).to.be.a("string").and.not.be.empty;
    expect(note).to.equal("Wrong file uploaded");
  });

  it("ignores without a note, and rejects an empty list, a blank note or too many ids", async () => {
    const ignoreMany = sinon.stub(DAO.reviewqueue, "ignoreMany").resolves(1);
    await admin().ignoreMany({ ids: [5] });
    expect(ignoreMany.firstCall.args[2]).to.be.null;
    await expectTrpcError(admin().ignoreMany({ ids: [] }), "BAD_REQUEST");
    await expectTrpcError(admin().ignoreMany({ ids: [5], note: "  " }), "BAD_REQUEST");
    const many = Array.from({ length: 501 }, (_, i) => i + 1);
    await expectTrpcError(admin().ignoreMany({ ids: many }), "BAD_REQUEST");
    expect(ignoreMany.calledOnce).to.be.true;
  });

  it("counts and ignores every open item from one import", async () => {
    sinon.stub(DAO.reviewqueue, "getOpenCountForImport").resolves(312);
    const ignoreImport = sinon.stub(DAO.reviewqueue, "ignoreImport").resolves(312);
    expect(await admin().importOpenCount({ importLogId: 88 })).to.deep.equal({
      importLogId: 88,
      open: 312,
    });
    expect(await admin().ignoreImport({ importLogId: 88, note: "Wrong owner" })).to.deep.equal({
      ignored: 312,
    });
    expect(ignoreImport.firstCall.args[0]).to.equal(88);
    expect(ignoreImport.firstCall.args[2]).to.equal("Wrong owner");
  });

  it("is for admins only", async () => {
    const ignoreMany = sinon.stub(DAO.reviewqueue, "ignoreMany");
    const ignoreImport = sinon.stub(DAO.reviewqueue, "ignoreImport");
    const notAdmin = callerWith({ permissions: ["read:profile"] }).reports.reviewQueue;
    await expectTrpcError(notAdmin.ignoreMany({ ids: [5] }), "FORBIDDEN");
    await expectTrpcError(notAdmin.ignoreImport({ importLogId: 1 }), "FORBIDDEN");
    await expectTrpcError(
      callerWith().reports.reviewQueue.importOpenCount({ importLogId: 1 }),
      "UNAUTHORIZED",
    );
    expect(ignoreMany.called || ignoreImport.called).to.be.false;
  });
});
