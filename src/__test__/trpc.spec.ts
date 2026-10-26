import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

const callerWith = (permissions?: string[]) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: permissions ? { permissions } : undefined,
  });

describe("tRPC procedures", () => {
  let ownersStub: sinon.SinonStub;

  beforeEach(() => {
    ownersStub = sinon
      .stub(DAO.meta, "getDataOwners")
      .resolves([{ id: 1, owner: "Effekt", default: true }]);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("rejects anonymous callers on admin procedures", async () => {
    try {
      await callerWith().meta.owners();
      expect.fail("expected UNAUTHORIZED");
    } catch (err: any) {
      expect(err.code).to.equal("UNAUTHORIZED");
    }
    expect(ownersStub.called).to.be.false;
  });

  it("rejects authenticated callers without the admin permission", async () => {
    try {
      await callerWith(["read:profile"]).meta.owners();
      expect.fail("expected FORBIDDEN");
    } catch (err: any) {
      expect(err.code).to.equal("FORBIDDEN");
    }
    expect(ownersStub.called).to.be.false;
  });

  it("returns data owners to admins", async () => {
    const owners = await callerWith(["admin"]).meta.owners();
    expect(owners).to.deep.equal([{ id: 1, owner: "Effekt", default: true }]);
  });
});
