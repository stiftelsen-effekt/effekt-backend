import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";

describe("agreementfeedback routes", () => {
  let server: express.Express;
  let deleteStub: sinon.SinonStub;
  let addStub: sinon.SinonStub;
  let belongsStub: sinon.SinonStub;
  let recordForKidStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(authMiddleware, "auth").returns([] as any);
    sinon
      .stub(authMiddleware, "checkDonorOwnsDistribution")
      .callsFake((_KID, _req, _res, next) => next());
    delete require.cache[require.resolve("../routes/agreementfeedback")];
    const { agreementfeedbackRouter } = require("../routes/agreementfeedback");
    server = express();
    server.use(express.json());
    server.use("/agreementfeedback", agreementfeedbackRouter);

    recordForKidStub = sinon.stub(
      DAO.agreementfeedback,
      "getStoppedAgreementReasonRecordExistsForKID",
    );
    deleteStub = sinon
      .stub(DAO.agreementfeedback, "deleteStoppedAgreementReasonRecord")
      .resolves(5);
    belongsStub = sinon.stub(DAO.agreementfeedback, "agreementBelongsToKID");
    sinon
      .stub(DAO.agreementfeedback, "getStoppedAgreementReasonById")
      .resolves({ ID: 1, isOther: false } as any);
    sinon
      .stub(DAO.agreementfeedback, "getStoppedAgreementReasonRecordForAgreementWithin24Hours")
      .resolves(null);
    addStub = sinon.stub(DAO.agreementfeedback, "addStoppedAgreementReasonRecord").resolves(7);
  });

  afterEach(() => {
    sinon.restore();
    delete require.cache[require.resolve("../routes/agreementfeedback")];
  });

  describe("DELETE /stopped/:KID/:id", () => {
    it("deletes a record belonging to the KID", async () => {
      recordForKidStub.withArgs(5, "12345678").resolves(true);
      const res = await request(server).delete("/agreementfeedback/stopped/12345678/5");
      expect(res.status).to.equal(200);
      expect(deleteStub.calledOnceWith(5)).to.be.true;
    });

    it("returns 404 and does not delete a record belonging to another KID", async () => {
      recordForKidStub.resolves(false);
      const res = await request(server).delete("/agreementfeedback/stopped/12345678/6");
      expect(res.status).to.equal(404);
      expect(deleteStub.called).to.be.false;
    });
  });

  describe("POST /stopped/:KID", () => {
    const body = { reasonId: 1, agreementId: "3", agreementType: "AvtaleGiro" };

    it("adds feedback for an agreement with the KID", async () => {
      belongsStub.withArgs("AvtaleGiro", "3", "12345678").resolves(true);
      const res = await request(server).post("/agreementfeedback/stopped/12345678").send(body);
      expect(res.status).to.equal(200);
      expect(addStub.calledOnce).to.be.true;
    });

    it("rejects feedback for an agreement with a different KID", async () => {
      belongsStub.resolves(false);
      const res = await request(server).post("/agreementfeedback/stopped/12345678").send(body);
      expect(res.status).to.equal(403);
      expect(addStub.called).to.be.false;
    });
  });
});
