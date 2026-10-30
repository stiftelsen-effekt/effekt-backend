import { expect } from "chai";
import express, { type Request, type Response } from "express";
import request from "supertest";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { mountTrpc } from "../trpc/express";
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
      .resolves([{ id: 1, name: "Effekt", default: true }]);
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
    expect(owners).to.deep.equal([{ id: 1, name: "Effekt", default: true }]);
  });
});

describe("tRPC over HTTP", () => {
  const app = express();
  app.use(express.json());
  mountTrpc(app);

  afterEach(() => {
    sinon.restore();
  });

  it("answers CORS preflights with 204", async () => {
    await request(app).options("/trpc/meta.owners").expect(204);
  });

  it("rejects anonymous requests to admin procedures with 401", async () => {
    const res = await request(app).get("/trpc/meta.owners").expect(401);
    expect(res.body.error.data.code).to.equal("UNAUTHORIZED");
  });

  it("rejects invalid bearer tokens with 401", async () => {
    const res = await request(app)
      .get("/trpc/meta.owners")
      .set("Authorization", "Bearer not.a.token")
      .expect(401);
    expect(res.body.error.data.code).to.equal("UNAUTHORIZED");
  });

  it("does not include stack traces outside development", async () => {
    const res = await request(app).get("/trpc/meta.owners");
    expect(res.body.error.data.stack).to.be.undefined;
  });
});
