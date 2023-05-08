import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";
import sinon from "sinon";
import express from "express";
import { expect } from "chai";
import * as bodyParser from "body-parser";
import request from "supertest";

let server;
let authStub;
let checkDonorStub;
let checkDonationStub;
let donorUpdateStub;
let agreementStub;
let donorStub;

const jack = {
  id: 237,
  name: "Jack Torrance",
  email: "jack@overlookhotel.com",
  newsletter: true,
  trash: false,
  registered: "1921-07-04T23:00:00.000Z",
};

const donationsStub = [
  {
    id: 217,
    donor: "Jack Torance",
    donorId: 237,
    email: "jack@overlookhotel.com",
    sum: "100.00",
    transactionCost: "2.00",
    method: "Bank",
    KID: "00009912345678",
    registered: "2018-03-29T23:00:00.000Z",
    $$ref: "#/components/schemas/Donation/example",
  },
  {
    id: 456,
    donor: "Jack Torance",
    donorId: 237,
    email: "jack@overlookhotel.com",
    sum: "399.00",
    transactionCost: "2.00",
    method: "Bank",
    KID: "000094567886",
    registered: "2020-08-05T19:00:00.000Z",
    $$ref: "#/components/schemas/Donation/example",
  },
];

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

describe("Check if donations returns for user ID", function () {
  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);
    checkDonorStub = sinon.replace(
      authMiddleware,
      "checkDonor",
      function (donorId, res, req, next) {
        next();
      },
    );

    donorStub = sinon.stub(DAO.donors, "getByID");
    donorStub.withArgs("237").resolves(jack);

    var donationStub = sinon.stub(DAO.donations, "getByDonorId");
    donationStub.withArgs("237").resolves(donationsStub);

    const donorsRoute = require("../routes/donors");
    server = express();
    server.use(bodyParser.json());
    server.use(bodyParser.urlencoded({ extended: true }));
    server.use("/donors", donorsRoute);
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Should return 200 OK with the dontions by ID", async function () {
    const response = await request(server).get("/donors/237/donations").expect(200);
  });

  it("Should return the donations", async function () {
    const response = await request(server).get("/donors/237/donations");
    expect(response.body.content).to.deep.equal(donationsStub);
  });

  after(function () {
    sinon.restore();
  });
});

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
      },
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

  it("Should return 200 when updating name", async function () {
    donorUpdateStub.resolves(true);
    const response = await request(server).put("/donors/237").send({
      name: "Jack Torrance",
    });
    expect(response.status).to.equal(200);
    expect(donorUpdateStub.callCount).to.equal(1);
  });

  it("Should return 400 when newsletter is not a boolean", async function () {
    donorUpdateStub.resolves(true);
    const response = await request(server).put("/donors/237").send({
      name: "Jack Torrance",
      newsletter: "Yes",
    });
    expect(response.status).to.equal(400);
    expect(donorUpdateStub.callCount).to.equal(0);
  });

  after(function () {
    sinon.restore();
  });
});

describe("Check if /:id/recurring/avtalegiro return agreements", function () {
  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);
    checkDonorStub = sinon.replace(
      authMiddleware,
      "checkDonor",
      function (donorId, res, req, next) {
        next();
      },
    );

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
    const response = await request(server).get("/donors/237/recurring/avtalegiro").expect(200);
  });

  it("Should return the agreements", async function () {
    const response = await request(server).get("/donors/237/recurring/avtalegiro");
    expect(response.body.content).to.deep.equal(mockAgreements);
  });

  after(function () {
    sinon.restore();
  });
});

describe("Check if /:id/recurring/vipps return agreements", function () {
  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);
    checkDonorStub = sinon.replace(
      authMiddleware,
      "checkDonor",
      function (donorId, res, req, next) {
        next();
      },
    );

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
    const response = await request(server).get("/donors/237/recurring/vipps").expect(200);
  });

  it("Should return the agreements", async function () {
    const response = await request(server).get("/donors/237/recurring/vipps");
    expect(response.body.content).to.deep.equal(mockAgreementsVipps);
  });

  after(function () {
    sinon.restore();
  });
});
