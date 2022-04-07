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
const donationHelpers = require("../custom_modules/donationHelpers");

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
    updateAgreementCancellationDateStub.withArgs("1").resolves(true);
    const response = await request(server)
      .put("/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/cancel")
      .expect(200);
  });

  it("Should return 400 BAD REQUEST when vipps updateAgreementStatus returns false", async function () {
    updateAgreementStatusStub.withArgs("1", "STOPPED").resolves(false);
    const response = await request(server)
      .put("/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/cancel")
      .expect(400);
  });

  it("Should return 400 BAD REQUEST when updateAgreementCancellationDate returns false", async function () {
    updateAgreementStatusStub.withArgs("1", "STOPPED").resolves(true);
    updateAgreementCancellationDateStub.withArgs("1").resolves(false);

    const response = await request(server)
      .put("/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/cancel")
      .expect(400);
  });

  it("Should return 400 BAD REQUEST when DAO updateAgreementStatus returns false", async function () {
    updateAgreementStatusStub.withArgs("1", "STOPPED").resolves(true);
    updateAgreementStatusDAOStub.withArgs("1", "STOPPED").resolves(false);
    updateAgreementCancellationDateStub.withArgs("1").resolves(true);

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
    updateAgreementPriceDAOStub.withArgs("1", 1).returns(true);
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

  it("Should return 400 when DAO updateAgreementPrice returns false", async function () {
    updateAgreementPriceStub.withArgs("1", 100).returns(true);
    updateAgreementPriceDAOStub.withArgs("1", 1).returns(false);
    const response = await request(server)
      .put("/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/price")
      .send({
        price: 100,
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

  it("Should return 400 BAD REQUEST when updateAgreementChargeDay returns false", async function () {
    updateAgreementChargeDayStub.withArgs("1", 10).resolves(false);
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/chargeday"
      )
      .send({
        chargeDay: 10,
      })
      .expect(400);
  });

  after(function () {
    sinon.restore();
  });
});

describe("Check that /vipps/agreement/{urlcode}/distribution works", () => {
  let getAgreementIdByUrlCodeStub;
  let getIDByAgreementCodeStub;
  let getKIDbySplitStub;
  let createKIDStub;
  let addStub;
  let updateAgreementKIDStub;
  let sendVippsAgreementChangeStub;
  let split = [
    { organizationID: 1, share: "25.000000000000" },
    { organizationID: 2, share: "75.000000000000" },
  ];

  let distribution = [
    {
      organizationId: 1,
      share: "25.000000000000",
    },
    {
      organizationId: 2,
      share: "75.000000000000",
    },
  ];

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

    getIDByAgreementCodeStub = sinon.stub(DAO.donors, "getIDByAgreementCode");
    getIDByAgreementCodeStub
      .withArgs("1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi")
      .resolves(1);

    getKIDbySplitStub = sinon.stub(DAO.distributions, "getKIDbySplit");

    createKIDStub = sinon.stub(donationHelpers, "createKID");

    addStub = sinon.stub(DAO.distributions, "add");

    updateAgreementKIDStub = sinon.stub(DAO.vipps, "updateAgreementKID");

    sendVippsAgreementChangeStub = sinon.stub(mail, "sendVippsAgreementChange");
    sendVippsAgreementChangeStub.withArgs(
      "1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi",
      "SHARES",
      "10267597"
    );
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK when distribution is updated", async function () {
    getKIDbySplitStub.withArgs(split, 1).resolves("10267597");
    updateAgreementKIDStub.withArgs("1", "10267597").resolves(true);
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/distribution"
      )
      .send({
        distribution,
      })
      .expect(200);
  });

  it("Should return 400 BAD REQUEST when distribution is not updated", async function () {
    getKIDbySplitStub.withArgs(split, 1).resolves("10267597");
    updateAgreementKIDStub.withArgs("1", "10267597").resolves(false);
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/distribution"
      )
      .send({
        distribution,
      })
      .expect(400);
  });

  it("Should make new KID when no KID is found", async function () {
    getKIDbySplitStub.withArgs(split, 1).resolves(null);
    createKIDStub.resolves("10267597");
    addStub
      .withArgs(
        split,

        "10267597",
        1,
        3
      )
      .resolves(true);
    updateAgreementKIDStub.withArgs("1", "10267597").resolves(true);
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/distribution"
      )
      .send({
        distribution,
      })
      .expect(200);
  });

  it("Should return 400 BAD REQUEST when distribution is empty", async function () {
    createKIDStub.resolves("10267597");
    addStub.withArgs([], "10267597", 1, 3).resolves(false);
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/distribution"
      )
      .send({
        distribution: [],
      })
      .expect(400);
  });

  it("Should return 400 BAD REQUEST when distribution does not sum to 100", async function () {
    createKIDStub.resolves("10267597");
    addStub
      .withArgs(
        [
          { organizationID: 1, share: "10.000000000000" },
          { organizationID: 2, share: "75.000000000000" },
        ],

        "10267597",
        1,
        3
      )
      .resolves(false);
    const response = await request(server)
      .put(
        "/vipps/agreement/1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi/distribution"
      )
      .send({
        distribution: [
          {
            organizationId: 1,
            share: "10.000000000000",
          },
          {
            organizationId: 2,
            share: "75.000000000000",
          },
        ],
      })
      .expect(400);
  });

  after(function () {
    sinon.restore();
  });
});
