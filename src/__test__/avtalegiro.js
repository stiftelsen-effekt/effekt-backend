const sinon = require("sinon");
const chai = require("chai");
const DAO = require("../custom_modules/DAO");
const donationHelpers = require("../custom_modules/donationHelpers");
const expect = chai.expect;
const authMiddleware = require("../custom_modules/authorization/authMiddleware");
const express = require("express");
const bodyParser = require("body-parser");
const request = require("supertest");
const avtalegiroagreements = require("../custom_modules/DAO_modules/avtalegiroagreements");

const avtalegiro = require("../custom_modules/avtalegiro");
const { DateTime } = require("luxon");
const config = require("../config");

describe("AvtaleGiro file generation", () => {
  let donorStub;
  let file;
  let getLines;
  let getSubString;

  const mockAgreements = [
    {
      id: 1,
      KID: "002556289731589",
      claimDate: 10,
      amount: 50000,
      notice: true,
      active: true,
    },
    {
      id: 2,
      KID: "000638723319577",
      claimDate: 10,
      amount: 340000,
      notice: false,
      active: true,
    },
    {
      id: 3,
      KID: "000675978627833",
      claimDate: 10,
      amount: 5000000,
      notice: true,
      active: true,
    },
  ];

  before(function () {
    donorStub = sinon.stub(DAO.donors, "getByKID");

    donorStub.withArgs("002556289731589").resolves({
      name: "Maria Brækkelie",
    });
    donorStub.withArgs("000638723319577").resolves({
      name: "Kristian Jørgensen",
    });
    donorStub.withArgs("000675978627833").resolves({
      name: "Håkon Harnes",
    });

    config.nets_customer_id = "00230456";

    getLines = () => {
      let lines = file.toString("utf-8").split("\n");
      // Pop last empty line
      lines.pop();
      return lines;
    };

    getSubString = (row, start, length) => {
      const lines = getLines();
      const line = lines[row - 1];
      return line.substr(start - 1, length);
    };
  });

  it("Has correct overall structure", async () => {
    file = await avtalegiro.generateAvtaleGiroFile(
      42,
      mockAgreements,
      DateTime.fromJSDate(new Date("2021-10-10 10:00"))
    );

    expect(getLines().length).to.be.equal(14);

    /**
     * Start record
     */
    expect(getSubString(1, 1, 2)).to.be.equal("NY");
    expect(getSubString(1, 3, 2)).to.be.equal("00");
    expect(getSubString(1, 5, 2)).to.be.equal("00");
    expect(getSubString(1, 7, 2)).to.be.equal("10");
    expect(getSubString(1, 9, 8)).to.be.equal("00230456");
    expect(getSubString(1, 17, 7)).to.be.equal("0000042");
    expect(getSubString(1, 24, 8)).to.be.equal("00008080");

    /**
     * End record
     */
    expect(getSubString(14, 1, 2)).to.be.equal("NY");
    expect(getSubString(14, 3, 2)).to.be.equal("00");
    expect(getSubString(14, 5, 2)).to.be.equal("00");
    expect(getSubString(14, 7, 2)).to.be.equal("89");
    expect(getSubString(14, 9, 8)).to.be.equal("00000003");
    expect(getSubString(14, 17, 8)).to.be.equal("00000014");
    expect(getSubString(14, 25, 17)).to.be.equal("00000000005390000");
    expect(getSubString(14, 42, 6)).to.be.equal("101021");
  });

  it("Has correct number of assignments", async () => {
    file = await avtalegiro.generateAvtaleGiroFile(
      42,
      mockAgreements,
      DateTime.fromJSDate(new Date("2021-10-10 10:00"))
    );

    // Assignment 1
    expect(getSubString(2, 1, 8)).to.be.equal("NY210020");
    expect(getSubString(5, 1, 8)).to.be.equal("NY210088");

    // Assignment 2
    expect(getSubString(6, 1, 8)).to.be.equal("NY210020");
    expect(getSubString(9, 1, 8)).to.be.equal("NY210088");

    // Assignment 3
    expect(getSubString(10, 1, 8)).to.be.equal("NY210020");
    expect(getSubString(13, 1, 8)).to.be.equal("NY210088");
  });

  it("Has correct structure on assignment wrappers", async () => {
    // Testing assignment 2

    // Start record assignment
    // Assignment nr.
    expect(getSubString(6, 18, 7)).to.be.equal(
      `${DateTime.fromJSDate(new Date()).toFormat("ddLL")}001`
    );
    // Our bank account nr.
    expect(getSubString(6, 25, 11)).to.be.equal("15062995960");

    // End record assignment
    // No. of transactions, expected to just be one
    expect(getSubString(9, 9, 8)).to.be.equal("00000001");
    // No. of records in assignment, expected to be four
    expect(getSubString(9, 17, 8)).to.be.equal("00000004");
    // Total sum of transactions
    expect(getSubString(9, 25, 17)).to.be.equal("00000000000340000");
    // First due date of transactions
    expect(getSubString(9, 42, 6)).to.be.equal("101021");
    // Last due date of transactions
    expect(getSubString(9, 48, 6)).to.be.equal("101021");
  });

  it("Has correct structure on payment claim in assignment", async () => {
    // Testing assignment 3

    // Line 1
    expect(getSubString(11, 1, 8)).to.be.equal("NY210230");
    // Transaction number
    expect(getSubString(11, 9, 7)).to.be.equal("0000001");
    // Due date
    expect(getSubString(11, 16, 6)).to.be.equal("101021");
    // Sum
    expect(getSubString(11, 33, 17)).to.be.equal("00000000005000000");
    // KID
    expect(getSubString(11, 50, 25)).to.be.equal("          000675978627833");
    // Filler
    expect(getSubString(11, 75, 6)).to.be.equal("000000");

    // Line 2
    expect(getSubString(12, 1, 8)).to.be.equal("NY210231");
    // Transaction number
    expect(getSubString(12, 9, 7)).to.be.equal("0000001");
    // Short name
    expect(getSubString(12, 16, 10)).to.be.equal(" HÅKONHARN");
    // Filler
    expect(getSubString(12, 76, 5)).to.be.equal("00000");
  });

  after(function () {
    sinon.restore();
  });
});

describe("Check that /avtalegiro/agreement/{id} works", () => {
  const mockAgreement = {
    ID: 1,
    KID: "002556289731589",
    claimDate: 10,
    amount: 50000,
    notice: true,
    active: true,
  };

  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);
    checkDonorStub = sinon.replace(
      authMiddleware,
      "checkDonor",
      function (donorId, res, req, next) {
        next();
      }
    );

    const avtalegiroRoute = require("../routes/avtalegiro");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/avtalegiro", avtalegiroRoute);

    agreementStub = sinon.stub(DAO.avtalegiroagreements, "getAgreement");
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK when agreement returns", async function () {
    agreementStub.withArgs("1").resolves(mockAgreement);
    const response = await request(server)
      .get("/avtalegiro/agreement/1")
      .expect(200);
  });

  it("Should return agreement with id 1", async function () {
    agreementStub.withArgs("1").resolves(mockAgreement);
    const response = await request(server).get("/avtalegiro/agreement/1");
    expect(response.body.content).to.deep.equal(mockAgreement);
  });

  it("Should return 404 when no id is passed as an argument", async function () {
    agreementStub.withArgs("").resolves(null);
    const response = await request(server)
      .get("/avtalegiro/agreement/")
      .expect(404);
  });

  it("Should return 500 when agreement id does not exist", async function () {
    agreementStub.withArgs("2").resolves(null);
    const response = await request(server)
      .get("/avtalegiro/agreement/2")
      .expect(500);
  });

  after(function () {
    sinon.restore();
  });
});

describe("Check that /avtalegiro/{KID}/distribution works", () => {
  const mockDistribution = {
    distribution: [
      {
        organizationId: 1,
        share: "50.000000000000",
      },
      {
        organizationId: 2,
        share: "50.000000000000",
      },
    ],
  };

  const mockDistributionFalse = {
    distribution: [
      {
        organizationId: 1,
        share: "30.000000000000",
      },
      {
        organizationId: 2,
        share: "40.000000000000",
      },
    ],
  };

  const mockDistributionEmpty = {
    distribution: [],
  };

  const jack = {
    id: 237,
    name: "Jack Torrance",
    ssn: "02016126007",
    email: "jack@overlookhotel.com",
    registered: "1921-07-04T23:00:00.000Z",
  };

  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);
    checkDonorStub = sinon.replace(
      authMiddleware,
      "checkDonor",
      function (donorId, res, req, next) {
        next();
      }
    );

    const avtalegiroRoute = require("../routes/avtalegiro");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/avtalegiro", avtalegiroRoute);

    agreementStub = sinon.stub(DAO.donors, "getByKID");
    agreementStub.withArgs("123456789123456").resolves(jack);

    newKidStub = sinon.stub(donationHelpers, "createKID");
    newKidStub.withArgs(15, jack.id).resolves("123456789123453");

    kidStub = sinon.stub(DAO.avtalegiroagreements, "replaceDistribution");
    kidStub
      .withArgs(
        "123456789123453",
        "123456789123456",
        mockDistribution.distribution,
        jack.id,
        3
      )
      .resolves(true);
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK and true", async function () {
    const response = await request(server)
      .post("/avtalegiro/123456789123456/distribution")
      .send(mockDistribution)
      .expect(200);
    expect(response.ok).to.deep.equal(true);
  });

  it("Should return 400 and false when distribution sum ≠ 100", async function () {
    const response = await request(server)
      .post("/avtalegiro/123456789123456/distribution")
      .send(mockDistributionFalse);
    expect(response.status).to.equal(400);
    expect(response.ok).to.deep.equal(false);
  });

  it("Should return 400 and false when empty distribution", async function () {
    const response = await request(server)
      .post("/avtalegiro/123456789123456/distribution")
      .send(mockDistributionEmpty);
    expect(response.status).to.equal(400);
    expect(response.ok).to.deep.equal(false);
  });

  after(function () {
    sinon.restore();
  });
});

describe("Check that /avtalegiro/{KID}/status works", () => {
  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);

    const avtalegiroRoute = require("../routes/avtalegiro");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/avtalegiro", avtalegiroRoute);

    activeStub = sinon.stub(DAO.avtalegiroagreements, "setActive");
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK and true when active is set to true", async function () {
    activeStub.withArgs("002556289731589", 1).resolves(true);
    const response = await request(server)
      .post("/avtalegiro/002556289731589/status")
      .send({
        active: 1,
      })
      .expect(200);
    expect(response.ok).to.deep.equal(true);
  });

  it("Should return 200 OK and true when active is set to false", async function () {
    activeStub.withArgs("002556289731589", 0).resolves(true);
    const response = await request(server)
      .post("/avtalegiro/002556289731589/status")
      .send({ active: 0 })
      .expect(200);
    expect(response.ok).to.deep.equal(true);
  });

  it("Should return 400 and true when wrong data is sent", async function () {
    activeStub.withArgs("002556289731589").resolves(true);
    const response = await request(server)
      .post("/avtalegiro/002556289731589/status")
      .send({ test: "no" });
    expect(response.status).to.equal(400);
  });

  it("Should return 400 and true when no data is sent", async function () {
    activeStub.withArgs("002556289731589").resolves(true);
    const response = await request(server)
      .post("/avtalegiro/002556289731589/status")
      .send();
    expect(response.status).to.equal(400);
  });

  after(function () {
    sinon.restore();
  });
});

describe("Check that /avtalegiro/{KID}/amount works", () => {
  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);

    const avtalegiroRoute = require("../routes/avtalegiro");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/avtalegiro", avtalegiroRoute);

    amountStub = sinon.stub(DAO.avtalegiroagreements, "updateAmount");
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK and true when amount is updated", async function () {
    amountStub.withArgs("002556289731589", 10000).resolves(true);
    const response = await request(server)
      .post("/avtalegiro/002556289731589/amount")
      .send({ amount: 10000 })
      .expect(200);
    expect(response.ok).to.deep.equal(true);
  });

  it("Should return 400 when invalid amount is sent in", async function () {
    amountStub.withArgs("002556289731589", -10000).resolves(false);
    const response = await request(server)
      .post("/avtalegiro/002556289731589/amount")
      .send({ amount: -10000 })
      .expect(400);
  });

  after(function () {
    sinon.restore();
  });
});

describe("Check that /avtalegiro/{KID}/paymentdate works", () => {
  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);

    const avtalegiroRoute = require("../routes/avtalegiro");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/avtalegiro", avtalegiroRoute);

    paymentDateStub = sinon.stub(DAO.avtalegiroagreements, "updatePaymentDate");
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK and true when payment date is updated", async function () {
    paymentDateStub.withArgs("002556289731589", 5).resolves(true);
    const response = await request(server)
      .post("/avtalegiro/002556289731589/paymentdate")
      .send({ paymentDate: 5 })
      .expect(200);
    expect(response.ok).to.deep.equal(true);
  });

  it("Should return 400 when paymentdate is not betweeen 1 and 28", async function () {
    paymentDateStub.withArgs("002556289731589", 0).resolves(true);
    const response = await request(server)
      .post("/avtalegiro/002556289731589/paymentdate")
      .send({ paymentDate: 100 })
      .expect(400);
  });

  it("Should return 400 when paymentdate is not defined", async function () {
    paymentDateStub.withArgs("002556289731589").resolves(true);
    const response = await request(server)
      .post("/avtalegiro/002556289731589/paymentdate")
      .send()
      .expect(400);
  });

  it("Should return 400 when paymentdate is not a number", async function () {
    paymentDateStub.withArgs("002556289731589").resolves(true);
    const response = await request(server)
      .post("/avtalegiro/002556289731589/paymentdate")
      .send({ paymentDate: "test" })
      .expect(400);
  });

  after(function () {
    sinon.restore();
  });
});
