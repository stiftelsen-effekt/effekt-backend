const sinon = require("sinon");
const chai = require("chai");
const DAO = require("../custom_modules/DAO");
const expect = chai.expect;
const authMiddleware = require("../custom_modules/authorization/authMiddleware");
const express = require("express");
const bodyParser = require("body-parser");
const request = require("supertest");
const vipps = require("../custom_modules/vipps");
const mail = require("../custom_modules/mail");

describe("Check that /vipps/agreement/{urlcode}/cancel works", () => {
  let getAgreementIdByUrlCodeStub;
  let updateAgreementStatusStub;
  let updateAgreementStatusDAOStub;
  let updateAgreementCancellationDateStub;
  let sendVippsAgreementChangeStub;

  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);
    checkDonorStub = sinon.replace(
      authMiddleware,
      "checkDonor",
      function (donorId, res, req, next) {
        next();
      }
    );

    const vippsRoute = require("../routes/vipps");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/vipps", vippsRoute);

    getAgreementIdByUrlCodeStub = sinon.stub(
      DAO.vipps,
      "getAgreementIdByUrlCode"
    );
    getAgreementIdByUrlCodeStub
      .withArgs("1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi")
      .resolves("1");

    updateAgreementStatusStub = sinon.stub(vipps, "updateAgreementStatus");

    updateAgreementStatusDAOStub = sinon.stub(
      DAO.vipps,
      "updateAgreementStatus"
    );
    updateAgreementStatusDAOStub.withArgs("1", "STOPPED").resolves(true);

    updateAgreementCancellationDateStub = sinon.stub(
      DAO.vipps,
      "updateAgreementCancellationDate"
    );
    updateAgreementCancellationDateStub.withArgs("1").resolves(true);

    sendVippsAgreementChangeStub = sinon.stub(mail, "sendVippsAgreementChange");
    sendVippsAgreementChangeStub
      .withArgs("1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi")
      .resolves(true);
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK when agreement is canceled", async function () {
    updateAgreementStatusStub.withArgs("1", "STOPPED").resolves(true);
    const response = await request(server)
      .put("/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/cancel")
      .expect(200);
  });

  it("Should return 400 when agreement is not stopped", async function () {
    updateAgreementStatusStub.withArgs("1", "STOPPED").resolves(false);
    const response = await request(server)
      .put("/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/cancel")
      .expect(400);
  });

  after(function () {
    sinon.restore();
  });
});
