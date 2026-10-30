import { expect } from "chai";
import express, { type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { mountTrpc } from "../trpc/express";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const config = require("../config");

const createCaller = createCallerFactory(appRouter);

/** A verified token's payload: permissions plus, for a donor, the user id claim */
const callerWith = (payload?: { permissions: string[]; donorId?: number }) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: payload
      ? {
          permissions: payload.permissions,
          ...(payload.donorId !== undefined
            ? { [String(config.authUserIdClaim)]: payload.donorId }
            : {}),
        }
      : undefined,
  });

const theDonor = () => callerWith({ permissions: ["read:donations"], donorId: 7 });

const expectTrpcError = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

const dbDonor = {
  id: 7,
  name: "Jack Torrence",
  email: "jack@overlookhotel.com",
  registered: new Date("2020-01-01T00:00:00.000Z"),
  newsletter: true,
  trash: 0,
};

describe("tRPC minside router", () => {
  let getByID: sinon.SinonStub;

  beforeEach(() => {
    getByID = sinon.stub(DAO.donors, "getByID").resolves(dbDonor as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("profile", () => {
    it("rejects anonymous callers", async () => {
      await expectTrpcError(callerWith().minside.profile({ donorId: 7 }), "UNAUTHORIZED");
      expect(getByID.called).to.be.false;
    });

    it("rejects another donor", async () => {
      await expectTrpcError(theDonor().minside.profile({ donorId: 8 }), "FORBIDDEN");
      expect(getByID.called).to.be.false;
    });

    it("rejects the donor without the read:donations permission", async () => {
      await expectTrpcError(
        callerWith({ permissions: ["read:profile"], donorId: 7 }).minside.profile({ donorId: 7 }),
        "FORBIDDEN",
      );
      expect(getByID.called).to.be.false;
    });

    it("rejects ids that are not positive integers", async () => {
      for (const donorId of [1.5, 0, -7, "7", "1.2e4"]) {
        await expectTrpcError(theDonor().minside.profile({ donorId } as any), "BAD_REQUEST");
      }
      expect(getByID.called).to.be.false;
    });

    it("returns the profile to the donor, with only the declared fields", async () => {
      const profile = await theDonor().minside.profile({ donorId: 7 });
      expect(profile).to.deep.equal({
        id: 7,
        name: "Jack Torrence",
        email: "jack@overlookhotel.com",
        newsletter: true,
        registered: "2020-01-01T00:00:00.000Z",
      });
      expect(getByID.calledOnceWith(7)).to.be.true;
    });

    it("returns any donor's profile to an admin", async () => {
      const profile = await callerWith({
        permissions: ["read:donations", "admin"],
      }).minside.profile({ donorId: 7 });
      expect(profile.id).to.equal(7);
    });

    it("answers NOT_FOUND for a missing donor", async () => {
      getByID.resolves(null);
      await expectTrpcError(theDonor().minside.profile({ donorId: 7 }), "NOT_FOUND");
    });
  });

  describe("over HTTP", () => {
    const app = express();
    app.use(express.json());
    mountTrpc(app);

    const input = (value: unknown) => encodeURIComponent(JSON.stringify(value));

    it("answers 401 without a token", async () => {
      const res = await request(app)
        .get(`/trpc/minside.profile?input=${input({ donorId: 7 })}`)
        .expect(401);
      expect(res.body.error.data.code).to.equal("UNAUTHORIZED");
    });

    it("answers 401 with an invalid token", async () => {
      await request(app)
        .get(`/trpc/minside.profile?input=${input({ donorId: 7 })}`)
        .set("Authorization", "Bearer not.a.token")
        .expect(401);
    });
  });

  it("keeps the shared schemas free of backend imports (apps/web bundles them)", () => {
    const source = readFileSync(join(__dirname, "../trpc/shared/minside.ts"), "utf8");
    const imports = [...source.matchAll(/(?:from|import|require\()\s*["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    expect(imports).to.deep.equal(["zod"]);
  });
});
