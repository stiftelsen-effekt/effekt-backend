import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import sinon from "sinon";
import { expect } from "chai";
import express from "express";
import bodyParser from "body-parser";
import request from "supertest";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import * as avtalegiroDeletions from "../custom_modules/avtalegiro/deletions";

const mail = require("../custom_modules/mail");

describe("POST /avtalegiro/:KID/status", () => {
  let server: express.Express;
  let setActiveStub: sinon.SinonStub;
  let requestDeletionStub: sinon.SinonStub;
  let restoreStub: sinon.SinonStub;
  let changeMailStub: sinon.SinonStub;

  beforeAll(() => {
    // These must be stubbed before importing the routes
    sinon.stub(authMiddleware, "auth").returns([]);
    sinon.stub(authMiddleware, "checkDonorOwnsDistribution").callsFake((_, req, res, next) => {
      next();
    });

    setActiveStub = sinon.stub(DAO.avtalegiroagreements, "setActive").resolves(true);
    requestDeletionStub = sinon.stub(avtalegiroDeletions, "requestDeletionOfUpcomingCharges");
    restoreStub = sinon.stub(DAO.avtalegirocharges, "restoreDeletionRequestsByKID").resolves();
    changeMailStub = sinon.stub(mail, "sendAvtaleGiroChange").resolves(false);
    sinon.stub(console, "log");

    const avtalegiroRouter = require("../routes/avtalegiro");
    server = express();
    server.use(bodyParser.json());
    server.use("/avtalegiro", avtalegiroRouter);
  });

  beforeEach(() => {
    sinon.resetHistory();
    requestDeletionStub.resolves({ deletable: [], tooLate: [] });
  });

  afterAll(() => {
    sinon.restore();
  });

  it("requests deletion of sent claims when the agreement is cancelled", async () => {
    requestDeletionStub.resolves({
      deletable: [{ id: 9, KID: "111", amount: 50000, dueDate: "2026-10-27" }],
      tooLate: [],
    });

    const response = await request(server)
      .post("/avtalegiro/111/status")
      .send({ active: 0 })
      .expect(200);

    expect(response.body).to.equal(true);
    sinon.assert.calledOnceWithExactly(setActiveStub, "111", 0);
    expect(requestDeletionStub.calledOnce).to.be.true;
    expect(requestDeletionStub.firstCall.args[0]).to.equal("111");
    expect(changeMailStub.calledOnceWith("111", "CANCELLED")).to.be.true;
    expect(restoreStub.called).to.be.false;
  });

  it("deactivates the agreement before requesting deletions", async () => {
    await request(server).post("/avtalegiro/111/status").send({ active: 0 }).expect(200);

    expect(setActiveStub.calledBefore(requestDeletionStub)).to.be.true;
  });

  it("also requests deletions when cancelled with false", async () => {
    await request(server).post("/avtalegiro/111/status").send({ active: false }).expect(200);

    expect(requestDeletionStub.calledOnce).to.be.true;
  });

  it("still cancels the agreement when requesting deletions fails", async () => {
    requestDeletionStub.rejects(new Error("Database is down"));
    const consoleStub = sinon.stub(console, "error");

    const response = await request(server)
      .post("/avtalegiro/111/status")
      .send({ active: 0 })
      .expect(200);

    consoleStub.restore();
    expect(response.body).to.equal(true);
    expect(setActiveStub.calledOnce).to.be.true;
    expect(changeMailStub.calledOnce).to.be.true;
  });

  it("keeps unsent deletions from going out when the agreement is reactivated", async () => {
    await request(server).post("/avtalegiro/111/status").send({ active: 1 }).expect(200);

    sinon.assert.calledOnceWithExactly(restoreStub, "111");
    expect(requestDeletionStub.called).to.be.false;
    expect(changeMailStub.called).to.be.false;
  });

  it("does nothing with charges when the status is missing", async () => {
    await request(server).post("/avtalegiro/111/status").send({}).expect(200);

    expect(requestDeletionStub.called).to.be.false;
    expect(restoreStub.called).to.be.false;
  });
});
