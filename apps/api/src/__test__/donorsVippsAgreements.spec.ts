import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";
import * as mail from "../custom_modules/mail";

const vipps = require("../custom_modules/vipps");

const routerPath = "../routes/donors";

const donorId = 237;
const agreement = {
  ID: "agr_OWN",
  donorID: donorId,
  KID: "12345678",
  amount: 300,
  status: "ACTIVE",
  monthly_charge_day: 5,
} as any;
const otherDonorsAgreement = { ...agreement, ID: "agr_OTHER", donorID: 999 };

describe("Donor Vipps agreement routes", () => {
  let server: express.Express;
  let checkDonorStub: sinon.SinonStub;

  beforeEach(() => {
    // Stand-ins for the Auth0 middleware: no bearer token is a 401, and the token's donor is 237
    sinon.stub(authMiddleware, "auth").returns(((req, res, next) => {
      if (!req.headers.authorization) return res.status(401).end();
      next();
    }) as any);
    checkDonorStub = sinon
      .stub(authMiddleware, "checkAdminOrTheDonor")
      .callsFake((id, req, res, next) => (id === donorId ? next() : res.status(403).end()));

    delete require.cache[require.resolve(routerPath)];
    server = express();
    server.use(express.json());
    server.use("/donors", require(routerPath));
    server.use((err, req, res, next) => res.status(err.status ?? 500).end());

    const getAgreement = sinon.stub(DAO.vipps, "getAgreement").resolves(false);
    getAgreement.withArgs("agr_OWN").resolves(agreement);
    getAgreement.withArgs("agr_OTHER").resolves(otherDonorsAgreement);
    sinon.stub(mail, "sendVippsAgreementChange").resolves(false);
  });

  afterEach(() => {
    sinon.restore();
    delete require.cache[require.resolve(routerPath)];
  });

  const put = (path: string, body: object = {}) =>
    request(server).put(path).set("Authorization", "Bearer token").send(body);

  describe("PUT /donors/:id/recurring/vipps/:agreementId/cancel", () => {
    let vippsStatusStub: sinon.SinonStub;

    beforeEach(() => {
      vippsStatusStub = sinon.stub(vipps, "updateAgreementStatus").resolves(true);
      sinon.stub(DAO.vipps, "updateAgreementStatus").resolves(true);
      sinon.stub(DAO.vipps, "updateAgreementCancellationDate").resolves(true);
    });

    it("returns 401 without a token", async () => {
      await request(server).put(`/donors/${donorId}/recurring/vipps/agr_OWN/cancel`).expect(401);
      expect(vippsStatusStub.called).to.be.false;
    });

    it("returns 403 for another donor's id", async () => {
      await put("/donors/999/recurring/vipps/agr_OTHER/cancel").expect(403);
      expect(vippsStatusStub.called).to.be.false;
    });

    it("returns 404 for an agreement belonging to another donor", async () => {
      await put(`/donors/${donorId}/recurring/vipps/agr_OTHER/cancel`).expect(404);
      expect(vippsStatusStub.called).to.be.false;
    });

    it("returns 400 for a donor id that is not a plain integer", async () => {
      await put("/donors/237.0/recurring/vipps/agr_OWN/cancel").expect(400);
      expect(vippsStatusStub.called).to.be.false;
    });

    it("returns 404 for an unknown agreement", async () => {
      await put(`/donors/${donorId}/recurring/vipps/agr_UNKNOWN/cancel`).expect(404);
      expect(vippsStatusStub.called).to.be.false;
    });

    it("stops the donor's own agreement", async () => {
      await put(`/donors/${donorId}/recurring/vipps/agr_OWN/cancel`).expect(200);
      expect(checkDonorStub.calledWith(donorId)).to.be.true;
      expect(vippsStatusStub.calledOnceWith("agr_OWN", "STOPPED")).to.be.true;
    });
  });

  describe("PUT /donors/:id/recurring/vipps/:agreementId/price", () => {
    let vippsPriceStub: sinon.SinonStub;

    beforeEach(() => {
      vippsPriceStub = sinon.stub(vipps, "updateAgreementPrice").resolves(true);
      sinon.stub(DAO.vipps, "updateAgreementPrice").resolves(true);
    });

    it("returns 403 for another donor's id", async () => {
      await put("/donors/999/recurring/vipps/agr_OTHER/price", { price: 50000 }).expect(403);
      expect(vippsPriceStub.called).to.be.false;
    });

    it("returns 404 for an agreement belonging to another donor", async () => {
      await put(`/donors/${donorId}/recurring/vipps/agr_OTHER/price`, { price: 50000 }).expect(404);
      expect(vippsPriceStub.called).to.be.false;
    });

    it("updates the price of the donor's own agreement", async () => {
      await put(`/donors/${donorId}/recurring/vipps/agr_OWN/price`, { price: 50000 }).expect(200);
      expect(vippsPriceStub.calledOnceWith("agr_OWN", 50000)).to.be.true;
    });
  });

  describe("PUT /donors/:id/recurring/vipps/:agreementId/chargeday", () => {
    let chargeDayStub: sinon.SinonStub;

    beforeEach(() => {
      chargeDayStub = sinon.stub(DAO.vipps, "updateAgreementChargeDay").resolves(true);
    });

    it("returns 403 for another donor's id", async () => {
      await put("/donors/999/recurring/vipps/agr_OTHER/chargeday", { chargeDay: 5 }).expect(403);
      expect(chargeDayStub.called).to.be.false;
    });

    it("returns 404 for an agreement belonging to another donor", async () => {
      await put(`/donors/${donorId}/recurring/vipps/agr_OTHER/chargeday`, {
        chargeDay: 5,
      }).expect(404);
      expect(chargeDayStub.called).to.be.false;
    });

    it("rejects a charge day outside 0-28", async () => {
      await put(`/donors/${donorId}/recurring/vipps/agr_OWN/chargeday`, {
        chargeDay: 29,
      }).expect(400);
      expect(chargeDayStub.called).to.be.false;
    });

    it("updates the charge day of the donor's own agreement", async () => {
      await put(`/donors/${donorId}/recurring/vipps/agr_OWN/chargeday`, {
        chargeDay: 0,
      }).expect(200);
      expect(chargeDayStub.calledOnceWith("agr_OWN", 0)).to.be.true;
    });
  });

  describe("PUT /donors/:id/recurring/vipps/:agreementId/distribution", () => {
    let kidStub: sinon.SinonStub;

    const distribution = (owner: number) => ({
      donorId: owner,
      taxUnitId: null,
      causeAreas: [
        {
          id: 1,
          percentageShare: "100",
          standardSplit: false,
          organizations: [{ id: 5, percentageShare: "100" }],
        },
      ],
    });

    beforeEach(() => {
      kidStub = sinon.stub(DAO.vipps, "updateAgreementKID").resolves(true);
      sinon.stub(DAO.distributions, "getKIDbySplit").resolves("87654321");
    });

    it("returns 403 for another donor's id", async () => {
      await put("/donors/999/recurring/vipps/agr_OTHER/distribution", {
        distribution: distribution(999),
      }).expect(403);
      expect(kidStub.called).to.be.false;
    });

    it("returns 404 for an agreement belonging to another donor", async () => {
      await put(`/donors/${donorId}/recurring/vipps/agr_OTHER/distribution`, {
        distribution: distribution(donorId),
      }).expect(404);
      expect(kidStub.called).to.be.false;
    });

    it("rejects a distribution for another donor", async () => {
      await put(`/donors/${donorId}/recurring/vipps/agr_OWN/distribution`, {
        distribution: distribution(999),
      }).expect(400);
      expect(kidStub.called).to.be.false;
    });

    it("updates the distribution of the donor's own agreement", async () => {
      const res = await put(`/donors/${donorId}/recurring/vipps/agr_OWN/distribution`, {
        distribution: distribution(donorId),
      }).expect(200);
      expect(res.body.content).to.deep.equal({ KID: "87654321" });
      expect(kidStub.calledOnceWith("agr_OWN", "87654321")).to.be.true;
    });
  });
});
