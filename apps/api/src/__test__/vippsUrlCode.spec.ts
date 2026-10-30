import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";

describe("Vipps agreement url codes", () => {
  let server: express.Express;
  let queryStub: sinon.SinonStub;

  beforeEach(function () {
    // This must be stubbed before importing the routes
    sinon.stub(authMiddleware, "auth").returns([]);

    server = express();
    server.use("/vipps", require("../routes/vipps"));
    server.use((err, req, res, next) => res.status(err.status ?? 500).end());

    sinon.stub(DAO.vipps, "getAgreementIdByUrlCode").resolves(false);
    // An unknown code must never reach the agreements table: `ID = false` matches every row
    queryStub = sinon.stub(DAO, "query").rejects(new Error("unexpected query"));
  });

  afterEach(function () {
    sinon.restore();
  });

  it("returns 404 from the Min Side redirect for an unknown code", async function () {
    await request(server).get("/vipps/agreement/minside/not-a-code").expect(404);
    expect(queryStub.called).to.equal(false);
  });

  it("has no routes that read or edit an agreement by url code", async function () {
    const code = "0123456789abcdef0123456789abcdef";
    await request(server).get(`/vipps/agreement/anonymous/${code}`).expect(404);
    for (const path of ["cancel", "price", "pause", "pause/end", "chargeday", "forcedcharge"]) {
      await request(server).put(`/vipps/agreement/${code}/${path}`).expect(404);
    }
    await request(server).put(`/vipps/agreement/${code}/distribution`).expect(404);
    await request(server).post(`/vipps/agreement/${code}/charges/cancel`).expect(404);
    expect((DAO.vipps.getAgreementIdByUrlCode as sinon.SinonStub).called).to.equal(false);
  });

  describe("Min Side redirect", function () {
    const code = "0123456789abcdef0123456789abcdef";

    const stubAgreementOwner = (email: string) => {
      (DAO.vipps.getAgreementIdByUrlCode as sinon.SinonStub).withArgs(code).resolves("agr_TEST");
      sinon.stub(DAO.vipps, "getAgreement").resolves({ ID: "agr_TEST", donorID: 42 } as any);
      sinon.stub(DAO.donors, "getByID").resolves({ id: 42, email } as any);
    };

    it("sends donors to the Vipps agreement login page without their details", async function () {
      stubAgreementOwner("donor@example.com");
      const res = await request(server).get(`/vipps/agreement/minside/${code}`).expect(302);
      expect(res.headers.location).to.match(/\/vippsagreement$/);
      expect(res.headers.location).not.to.include("@");
      expect(res.headers.location).not.to.include(code);
    });

    it("sends anonymous donors to the anonymous agreement page without the code", async function () {
      stubAgreementOwner("anon@gieffektivt.no");
      const res = await request(server).get(`/vipps/agreement/minside/${code}`).expect(302);
      expect(res.headers.location).to.match(/\/min-side\/vipps-anonym$/);
      expect(res.headers.location).not.to.include("@");
      expect(res.headers.location).not.to.include(code);
    });
  });

  it("does not query for an agreement without an ID", async function () {
    expect(await DAO.vipps.getAgreement(false)).to.equal(false);
    expect(queryStub.called).to.equal(false);
  });
});
