const sinon = require("sinon");
const request = require("supertest");
const express = require("express");
const { expect } = require("chai");
const authMiddleware = require("../custom_modules/authorization/authMiddleware");
const DAO = require("../custom_modules/DAO");
const bodyParser = require("body-parser");

describe("Check if profile information is updated", function () {
  let server;
  let authStub;
  let checkDonorStub;
  let donorStub;

  const jack = {
    id: 237,
    name: "Jack Torrance",
    ssn: "02016126007",
    email: "jack@overlookhotel.com",
    newsletter: true,
    trash: false,
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
