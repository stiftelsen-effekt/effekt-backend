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
      year: 2022,
    },
    {
      organizationId: 2,
      organization: "Røde Kors",
      abbriv: "RK",
      value: "100.000000000000000000",
      year: 2018,
    },
    {
      organizationId: 45,
      organization: "Realfagbygget",
      abbriv: "A4",
      value: "250.000000000000000000",
      year: 2022,
    },
    {
      organizationId: 11,
      organization: "SOS Barnebyer",
      abbriv: "SOS",
      value: "250.000000000000000000",
      year: 2022,
    },
    {
      organizationId: 60,
      organization: "Barnekreftforeningen",
      abbriv: "BKF",
      value: "390.000000000000000000",
      year: 2019,
    },
  ];

  let server;
  let authStub;
  let checkDonorStub;
  let aggregatedByIdStub;

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
    expect(donations).to.have.length(5);
    for (var i = 0; i < donations.length; i++) {
      expect(donations[i].organizationId).to.be.a("number");
      expect(donations[i].organization).to.be.a("string");
      expect(donations[i].abbriv).to.be.a("string");
      expect(donations[i].value).to.be.a("string");
      expect(donations[i].year).to.be.a("number");
    }
  });

  it("Donor doesn't have donations", async function () {
    aggregatedByIdStub.withArgs("2349").resolves([]);

    const response = await request(server)
      .get("/donors/2349/donations/aggregated")
      .expect(200);

    expect(response.body.content).to.be.empty;
  });

  // it("Donor ID doesn't exist", async function () {
  //   authMiddleware.checkDonor.restore();

  //   checkDonorStub.callsFake(function (donorID, res, req, next) {
  //     throw new InvalidTokenError(
  //       "Unexpected 'https://konduit.no/user-id' value"
  //     );
  //   });

  //   const response = await request(server)
  //     .get("/donors/1/donations/aggregated")
  //     .expect(401);
  // });

  after(function () {
    authMiddleware.auth.restore();
  });

  describe("Test if you can get a donor's donation history", function () {
    const mockDonations = [
      {
        donationID: 1,
        kid: "123",
        method: "Bank",
        donationSum: "1000.00",
        date: "2021-05-09T22:00:00.000Z",
        distributions: [
          {
            organization: "Against Malaria Foundation",
            abbriv: "AMF",
            sum: "500.000000000000000000",
          },
          {
            organization: "GiveDirectly",
            abbriv: "GD",
            sum: "200.000000000000000000",
          },
          {
            organization: "New Incentives",
            abbriv: "NI",
            sum: "300.000000000000000000",
          },
        ],
      },
      {
        donationID: 2,
        kid: "123",
        method: "Bank u/KID",
        donationSum: "640.00",
        date: "2021-05-19T22:00:00.000Z",
        distributions: [
          {
            organization: "Against Malaria Foundation",
            abbriv: "AMF",
            sum: "20.000000000000000000",
          },
          {
            organization: "GiveDirectly",
            abbriv: "GD",
            sum: "520.000000000000000000",
          },
          {
            organization: "New Incentives",
            abbriv: "NI",
            sum: "100.000000000000000000",
          },
        ],
      },
      {
        donationID: 3,
        kid: "001",
        method: "Bank",
        donationSum: "800.00",
        date: "2020-01-12T22:00:00.000Z",
        distributions: [
          {
            organization: "Against Malaria Foundation",
            abbriv: "AMF",
            sum: "800.000000000000000000",
          },
        ],
      },
    ];

    let historyStub;

    before(function () {
      historyStub = sinon
        .stub(DAO.donations, "getHistory")
        .resolves(mockDonations);

      const donorsRoute = require("../routes/donors");
      server = express();
      server.use("/donors", donorsRoute);
    });

    it("Gets entire donation history", async function () {
      const response = await request(server)
        .get("/donors/2349/history")
        .expect(200);

      expect(response.body.content).to.deep.equal(mockDonations);
    });

    it("Same distribution of organizations gives identical KID", async function () {
      const response = await request(server)
        .get("/donors/2349/history")
        .expect(200);

      let donations = response.body.content;
      let distr1 = donations[0].distributions;
      let distr2 = donations[1].distributions;
      var org1 = [];
      var org2 = [];

      expect(distr1.length).to.equal(distr2.length);
      for (var i = 0; i < distr1.length; i++) {
        org1.push(distr1[i].organization);
        org2.push(distr2[i].organization);
      }
      expect(org1).to.have.members(org2);
      expect(donations[0].kid).to.equal(donations[1].kid);
    });

    it("Check if sum of all donations equals donationSum", async function () {
      historyStub.resolves(mockDonations);

      const response = await request(server)
        .get("/donors/2349/history")
        .expect(200);

      let donation = response.body.content;
      for (var x = 0; x < donation.length; x++) {
        let total = 0;
        for (var y = 0; y < donation[x].distributions.length; y++) {
          total += Number(donation[x].distributions[y].sum);
        }
        expect(total).to.equal(Number(donation[x].donationSum));
      }
    });
  });
});
