const sinon = require("sinon");
const chai = require("chai");
const DAO = require("../custom_modules/DAO");
const expect = chai.expect;
const authMiddleware = require("../custom_modules/authorization/authMiddleware");
const express = require("express");
const bodyParser = require("body-parser");
const request = require("supertest");
const vipps = require("../custom_modules/DAO_modules/vipps");
const vippsModule = require("../custom_modules/vipps");

describe("Check that /vipps/agreement/{urlcode}/cancel works", () => {
  before(function () {
    const vippsRoute = require("../routes/vipps");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/vipps", vippsRoute);

    agreementStub = sinon.stub(vipps, "getAgreementIdByUrlCode");
    agreementStatusStub = sinon.stub(vippsModule, "updateAgreementStatus");
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK when agreement is canceled", async function () {
    agreementStub
      .withArgs("1hj5hik62hk4kl728j2gj91l0yjkujjkwokds25oi")
      .resolves(1);
    agreementStatusStub.withArgs(1, "STOPPED");
    const response = await request(server)
      .put("/vipps/1hj5hik62hk4kl728j2gj91l0yjkujjkwokds25oi/cancel")
      .expect(200);
  });

  //   it("Should return agreement with id 1", async function () {
  //     agreementStub.withArgs("1").resolves(mockAgreement);
  //     const response = await request(server).get("/avtalegiro/agreement/1");
  //     expect(response.body.content).to.deep.equal(mockAgreement);
  //   });

  //   it("Should return 404 when no id is passed as an argument", async function () {
  //     agreementStub.withArgs("").resolves(null);
  //     const response = await request(server)
  //       .get("/avtalegiro/agreement/")
  //       .expect(404);
  //   });

  //   it("Should return 500 when agreement id does not exist", async function () {
  //     agreementStub.withArgs("2").resolves(null);
  //     const response = await request(server)
  //       .get("/avtalegiro/agreement/2")
  //       .expect(500);
  //   });

  after(function () {
    sinon.restore();
  });
});
