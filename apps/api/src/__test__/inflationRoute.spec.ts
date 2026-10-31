import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import config from "../config";
import { DAO } from "../custom_modules/DAO";
import { inflationRouter } from "../routes/inflation";

const vipps = require("../custom_modules/vipps");

const token = "a".repeat(64);
const path = `/inflation/agreement-update/${token}`;

function adjustment(overrides: Record<string, unknown> = {}) {
  return {
    ID: 1,
    agreement_ID: "42",
    agreement_type: "avtaleGiro",
    current_amount: 30000,
    proposed_amount: 33000,
    inflation_percentage: 0.1,
    token,
    status: "pending",
    created: new Date(),
    updated: null,
    expires: new Date(Date.now() + 24 * 3600 * 1000),
    ...overrides,
  } as any;
}

describe("inflation agreement update", () => {
  let server: express.Express;
  let getByTokenStub: sinon.SinonStub;
  let acceptStub: sinon.SinonStub;
  let releaseStub: sinon.SinonStub;
  let updateAmountStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(config, "frontend_url").value("https://example.org");
    sinon.stub(config, "inflation_adjustment_success_slug").value("ok");
    sinon.stub(config, "inflation_adjustment_error_slug").value("failed");
    server = express();
    server.use("/inflation", inflationRouter);
    getByTokenStub = sinon.stub(DAO.inflationadjustments, "getByToken");
    acceptStub = sinon.stub(DAO.inflationadjustments, "acceptAdjustment");
    releaseStub = sinon.stub(DAO.inflationadjustments, "releaseAcceptedAdjustment").resolves(true);
    sinon.stub(DAO.avtalegiroagreements, "getByID").resolves({ KID: "123" } as any);
    updateAmountStub = sinon.stub(DAO.avtalegiroagreements, "updateAmount").resolves(true);
  });

  afterEach(() => sinon.restore());

  describe("GET (the email link)", () => {
    it("shows a confirmation page that posts back, without changing anything", async () => {
      getByTokenStub.resolves(adjustment());

      const res = await request(server).get(path).expect(200);

      expect(res.text).to.contain('<form method="post">');
      expect(res.text).to.contain("300 kr");
      expect(res.text).to.contain("330 kr");
      expect(res.headers["content-security-policy"]).to.contain("form-action 'self'");
      expect(acceptStub.called).to.be.false;
      expect(updateAmountStub.called).to.be.false;
    });

    it("redirects to the success page if already accepted", async () => {
      getByTokenStub.resolves(adjustment({ status: "accepted" }));
      const res = await request(server).get(path).expect(302);
      expect(res.headers.location).to.equal("https://example.org/ok");
    });

    it("redirects to the error page if expired", async () => {
      getByTokenStub.resolves(adjustment({ expires: new Date(Date.now() - 1000) }));
      const res = await request(server).get(path).expect(302);
      expect(res.headers.location).to.equal("https://example.org/failed");
    });

    it("redirects to the error page for an unknown or malformed token", async () => {
      getByTokenStub.resolves(null);
      await request(server).get(path).expect(302);
      const res = await request(server).get("/inflation/agreement-update/x").expect(302);
      expect(res.headers.location).to.equal("https://example.org/failed");
    });
  });

  describe("POST (the confirmation)", () => {
    it("claims the adjustment, then updates the AvtaleGiro amount", async () => {
      acceptStub.resolves(true);
      getByTokenStub.resolves(adjustment({ status: "accepted" }));

      const res = await request(server).post(path).expect(303);

      expect(res.headers.location).to.equal("https://example.org/ok");
      expect(acceptStub.calledOnceWith(token)).to.be.true;
      expect(updateAmountStub.calledOnceWith("123", 33000)).to.be.true;
      expect(releaseStub.called).to.be.false;
    });

    it("does not apply an adjustment twice", async () => {
      acceptStub.resolves(false);
      getByTokenStub.resolves(adjustment({ status: "accepted" }));

      const res = await request(server).post(path).expect(303);

      expect(res.headers.location).to.equal("https://example.org/ok");
      expect(updateAmountStub.called).to.be.false;
    });

    it("does not apply an expired or non-pending adjustment", async () => {
      acceptStub.resolves(false);
      getByTokenStub.resolves(adjustment({ status: "pending" }));

      const res = await request(server).post(path).expect(303);

      expect(res.headers.location).to.equal("https://example.org/failed");
      expect(updateAmountStub.called).to.be.false;
    });

    it("releases the claim if the agreement could not be updated", async () => {
      acceptStub.resolves(true);
      getByTokenStub.resolves(adjustment({ status: "accepted" }));
      updateAmountStub.resolves(false);

      const res = await request(server).post(path).expect(303);

      expect(res.headers.location).to.equal("https://example.org/failed");
      expect(releaseStub.calledOnceWith(token)).to.be.true;
    });

    it("releases the claim if Vipps rejects the price change", async () => {
      acceptStub.resolves(true);
      getByTokenStub.resolves(adjustment({ status: "accepted", agreement_type: "vipps" }));
      sinon.stub(vipps, "updateAgreementPrice").resolves(false);

      await request(server).post(path).expect(303);

      expect(releaseStub.calledOnce).to.be.true;
    });

    it("does not apply adjustments of unsupported agreement types", async () => {
      acceptStub.resolves(true);
      getByTokenStub.resolves(adjustment({ status: "accepted", agreement_type: "autoGiro" }));

      const res = await request(server).post(path).expect(303);

      expect(res.headers.location).to.equal("https://example.org/failed");
      expect(releaseStub.calledOnce).to.be.true;
    });
  });
});
