const sinon = require("sinon");
const DAO = require("../custom_modules/DAO");
const request = require("supertest");
const express = require("express");
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js");
const { expect } = require("chai");

describe("See descriptive statistics of my donations", function () {
  const mockDonations = [
    {
      organizationId: 1,
      organization: "Against Malaria Foundation",
      abbriv: "AMF",
      value: "18.000000000000000000",
      year: 2018,
    },
    {
      organizationId: 2,
      organization: "Help Me In Need",
      abbriv: "SOS",
      value: "100.000000000000000000",
      year: 2022,
    },
  ];

  let server;
  let authStub;
  let checkDonorStub;
  let aggregatedByIdStub;
  let aggregatedByTime;

  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);

    checkDonorStub = sinon
      .stub(authMiddleware, "checkDonor")
      .callsFake(function (donorID, res, req, next) {
        next();
      });

    aggregatedByIdStub = sinon
      .stub(DAO.donations, "getYearlyAggregateByDonorId")
      .resolves(mockDonations);

    const donorsRoute = require("../routes/donors");
    server = express();
    server.use("/donors", donorsRoute);
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Gets all the donations of a donor by ID", async function () {
    aggregatedByIdStub.resolves(mockDonations);

    const response = await request(server)
      .get("/donors/2349/donations/aggregated")
      .expect(200);

    let donations = response.body.content;
    expect(donations).to.have.length(2);
    for (var i = 0; i < donations.length; i++) {
      expect(donations[i].organizationId).to.be.a("number");
      expect(donations[i].organization).to.be.a("string");
      expect(donations[i].abbriv).to.be.a("string");
      expect(donations[i].value).to.be.a("string");
      expect(donations[i].year).to.be.a("number");
    }
  });

  it("Donor doesn't have donations", async function () {
    aggregatedByIdStub.resolves([]);

    const response = await request(server)
      .get("/donors/2349/donations/aggregated")
      .expect(200);

    expect(response.body.content).to.be.empty;
  });

  it("Donor shouldn't exist", async function () {
    authMiddleware.checkDonor.restore();

    checkDonorStub.callsFake(function (donorID, res, req, next) {
      throw new InvalidTokenError(
        "Unexpected 'https://konduit.no/user-id' value"
      );
    });

    const response = await request(server)
      .get("/donors/1/donations/aggregated")
      .expect(401);
  });

  after(function () {
    authMiddleware.auth.restore();
  });
});
