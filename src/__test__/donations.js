const sinon = require("sinon");
const DAO = require("../custom_modules/DAO");
const request = require("supertest");
const express = require("express");
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js");
const { expect } = require("chai");

describe("See descriptive statistics of my donations", function () {
  let server;
  let authStub;
  let checkDonorStub;
  let aggregatedStub;

  before(function () {
    authStub = sinon.stub(authMiddleware, "auth").returns([]);
    checkDonorStub = sinon.replace(
      authMiddleware,
      "checkDonor",
      function (donorID, res, req, next) {
        next();
      }
    );
    aggregatedStub = sinon
      .stub(DAO.donations, "getYearlyAggregateByDonorId")
      .resolves([
        {
          organizationId: 1,
          organization: "Against Malaria Foundation",
          abbriv: "AMF",
          value: "18.000000000000000000",
          year: 2018,
        },
      ]);

    const donorsRoute = require("../routes/donors");
    server = express();
    server.use("/donors", donorsRoute);
  });

  beforeEach(function () {
    sinon.resetHistory();
  });

  it("Gets all the donations of a donor", async function () {
    const response = await request(server)
      .get("/donors/2349/donations/aggregated")
      .expect(200);

    expect(response.body.content[0].year).to.be.equal(2018);
  });

  it("Gets all the donations of a donor", async function () {
    const response = await request(server)
      .get("/donors/1/donations/aggregated")
      .expect(200);

    expect(response.body.content[0].year).to.be.equal(2018);
  });

  after(function () {
    authMiddleware.auth.restore();
  });
});
