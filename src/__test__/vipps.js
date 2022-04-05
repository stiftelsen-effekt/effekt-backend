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

  it("Should return 400 BAD REQUEST when agreement is not stopped", async function () {
    updateAgreementStatusStub.withArgs("1", "STOPPED").resolves(false);
    const response = await request(server)
      .put("/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/cancel")
      .expect(400);
  });

  after(function () {
    sinon.restore();
  });
});

describe("Check that /vipps/agreement/{urlcode}/price works", () => {
  let getAgreementIdByUrlCodeStub;
  let updateAgreementPriceStub;
  let updateAgreementPriceDAOStub;
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

    updateAgreementPriceStub = sinon.stub(vipps, "updateAgreementPrice");
    updateAgreementPriceDAOStub = sinon.stub(DAO.vipps, "updateAgreementPrice");
    sendVippsAgreementChangeStub = sinon.stub(mail, "sendVippsAgreementChange");
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK when price is updated and price more than 100 øre", async function () {
    updateAgreementPriceStub.withArgs("1", 100).returns(true);
    const response = await request(server)
      .put("/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/price")
      .send({
        price: 100,
      })
      .expect(200);
  });

  it("Should return 400 BAD REQUEST when price is undefined", async function () {
    const response = await request(server)
      .put("/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/price")
      .send({})
      .expect(400);
  });

  it("Should return 400 BAD REQUEST when price is less than 100 øre", async function () {
    updateAgreementPriceStub.withArgs("1", 99).resolves(false);
    const response = await request(server)
      .put("/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/price")
      .send({
        price: 99,
      })
      .expect(400);
  });

  after(function () {
    sinon.restore();
  });
});

describe("Check that /vipps/agreement/{urlcode}/chargeday works", () => {
  let getAgreementIdByUrlCodeStub;
  let updateAgreementChargeDayStub;

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

    updateAgreementChargeDayStub = sinon.stub(
      DAO.vipps,
      "updateAgreementChargeDay"
    );
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK when chargeday is updated", async function () {
    updateAgreementChargeDayStub.withArgs("1", 0).resolves(true);
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/chargeday"
      )
      .send({
        chargeDay: 0,
      })
      .expect(200);
  });

  it("Should return 400 BAD REQUEST when chargeday is undefined", async function () {
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/chargeday"
      )
      .send({})
      .expect(400);
  });

  it("Should return 400 BAD REQUEST when chargeday is less than 0", async function () {
    updateAgreementChargeDayStub.withArgs("1", -1).resolves(false);
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/chargeday"
      )
      .send({
        chargeDay: -1,
      })
      .expect(400);
  });

  it("Should return 400 BAD REQUEST when chargeday is more than 28", async function () {
    updateAgreementChargeDayStub.withArgs("1", 29).resolves(false);
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/chargeday"
      )
      .send({
        chargeDay: 29,
      })
      .expect(400);
  });

  after(function () {
    sinon.restore();
  });
});
/*
describe("Check that /vipps/agreement/{urlcode}/distribution works", () => {
  let getAgreementIdByUrlCodeStub;
  let getIDByAgreementCodeStub;
  let getKIDbySplitStub;
  let createKIDStub;
  let addStub;
  let updateAgreementKIDStub;
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
  });

  getIDByAgreementCodeStub = sinon.stub()

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK when distribution is updated", async function () {
    updateAgreementKID.withArgs("1", 0).resolves(true);
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/chargeday"
      )
      .send({
        chargeDay: 0,
      })
      .expect(200);
  });

  after(function () {
    sinon.restore();
  });
});*/
