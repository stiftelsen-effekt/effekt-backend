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

  it("returns 404 from the anonymous agreement for an unknown code", async function () {
    await request(server).get("/vipps/agreement/anonymous/not-a-code").expect(404);
    expect(queryStub.called).to.equal(false);
  });

  it("does not query for an agreement without an ID", async function () {
    expect(await DAO.vipps.getAgreement(false)).to.equal(false);
    expect(queryStub.called).to.equal(false);
  });
});
