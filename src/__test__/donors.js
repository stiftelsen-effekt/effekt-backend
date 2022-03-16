const sinon = require("sinon");
const request = require("supertest");
const express = require("express");
const { expect } = require("chai");
const authMiddleware = require("../custom_modules/authorization/authMiddleware");
const DAO = require("../custom_modules/DAO");
const bodyParser = require("body-parser");

const jack = {
  id: 237,
  name: "Jack Torrance",
  ssn: "02016126007",
  email: "jack@overlookhotel.com",
  newsletter: true,
  trash: false,
  registered: "1921-07-04T23:00:00.000Z",
};

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

const mockAgreementsVipps = [
  {
    ID: "29",
    donorID: 237,
    KID: "986532",
    sum: 500,
    status: "active",
    monthly_charge_day: 5,
    agreement_url_code: "vipps/hello",
    paused_until_date: "04.05.22",
    force_charge_date: "false",
  },
  {
    ID: "58",
    donorID: 237,
    KID: "8764723",
    sum: 4000,
    status: "active",
    monthly_charge_day: 2,
    agreement_url_code: "vipps/test",
    paused_until_date: "07.02.22",
    force_charge_date: "true",
  },
];

describe("Check if profile information is updated", function () {
  let server;
  let authStub;
  let checkDonorStub;
  let donorStub;

  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);
    checkDonorStub = sinon.replace(
      authMiddleware,
      "checkDonor",
      function (donorId, res, req, next) {
        next();
      }
    );

    donorStub = sinon.stub(DAO.donors, "getByID");

    donorStub.withArgs("237").resolves(jack);

    donorUpdateStub = sinon.stub(DAO.donors, "update");

    const donorsRoute = require("../routes/donors");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/donors", donorsRoute);
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK with the donor by ID", async function () {
    const response = await request(server).get("/donors/237").expect(200);
  });

  it("Should return a donor that matches the provided id", async function () {
    const response = await request(server).get("/donors/237");
    expect(response.body.content).to.deep.equal(jack);
  });

  it("Should return 404 when donor is not found", async function () {
    donorStub.withArgs("123").resolves(null);
    const response = await request(server).put("/donors/123");
    expect(response.status).to.equal(404);
  });

  it("Should update donor", async function () {
    donorUpdateStub.resolves(true);
    const response = await request(server).put("/donors/237").send(jack);
    expect(response.status).to.equal(200);
    expect(donorUpdateStub.callCount).to.equal(1);
  });

  it("Should return 400 when name is not a string", async function () {
    donorUpdateStub.resolves(true);
    const response = await request(server).put("/donors/237").send({
      name: 1010,
    });
    expect(response.status).to.equal(400);
    expect(donorUpdateStub.callCount).to.equal(0);
  });

  it("Should return 400 when SSN is not 11 numbers in length", async function () {
    donorUpdateStub.resolves(true);
    const response = await request(server).put("/donors/237").send({
      name: "Jack Torrance",
      ssn: "123",
    });
    expect(response.status).to.equal(400);
    expect(donorUpdateStub.callCount).to.equal(0);
  });

  it("Should return 400 when SSN is not a number", async function () {
    donorUpdateStub.resolves(true);
    const response = await request(server).put("/donors/237").send({
      name: "Jack Torrance",
      ssn: "Not a number",
    });
    expect(response.status).to.equal(400);
    expect(donorUpdateStub.callCount).to.equal(0);
  });

  it("Should return 400 when newsletter is not a boolean", async function () {
    donorUpdateStub.resolves(true);
    const response = await request(server).put("/donors/237").send({
      name: "Jack Torrance",
      ssn: "02016126007",
      newsletter: "Yes",
    });
    expect(response.status).to.equal(400);
    expect(donorUpdateStub.callCount).to.equal(0);
  });

  after(function () {
    authMiddleware.auth.restore();
    DAO.donors.getByID.restore();
    DAO.donors.update.restore();
  });
});

describe("Check if /:id/recurring/avtalegiro return agreements", function () {
  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);

    agreementStub = sinon.stub(DAO.avtalegiroagreements, "getByDonorId");
    agreementStub.resolves(mockAgreements);

    const donorsRoute = require("../routes/donors");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/donors", donorsRoute);
  });

  beforeEach(function () {
    sinon.resetHistory();
  });
  it("Should return 200 OK", async function () {
    const response = await request(server)
      .get("/donors/237/recurring/avtalegiro")
      .expect(200);
  });

  it("Should return the agreements", async function () {
    const response = await request(server).get(
      "/donors/237/recurring/avtalegiro"
    );
    expect(response.body.content).to.deep.equal(mockAgreements);
  });

  after(function () {
    authMiddleware.auth.restore();
  });
});

describe("Check if /:id/recurring/vipps return agreements", function () {
  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);

    agreementStub = sinon.stub(DAO.vipps, "getAgreementsByDonorId");
    agreementStub.resolves(mockAgreementsVipps);

    const donorsRoute = require("../routes/donors");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/donors", donorsRoute);
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK", async function () {
    const response = await request(server)
      .get("/donors/237/recurring/vipps")
      .expect(200);
  });

  it("Should return the agreements", async function () {
    const response = await request(server).get("/donors/237/recurring/vipps");
    expect(response.body.content).to.deep.equal(mockAgreementsVipps);
  });

  after(function () {
    authMiddleware.auth.restore();
  });
});
