import * as bodyParser from "body-parser";
import { expect } from "chai";
import express from "express";
import { InvalidTokenError } from "express-oauth2-jwt-bearer";
import sinon from "sinon";
import request from "supertest";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";

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

describe("donors", () => {
  let donorUpdateStub: sinon.SinonStub;
  let agreementStub: sinon.SinonStub;
  let donorStub: sinon.SinonStub;
  let checkDonorStub: sinon.SinonStub;

  describe("routes", () => {
    let server: express.Express;

    beforeEach(async () => {
      server = express();
      server.use(bodyParser.json());
      server.use(bodyParser.urlencoded({ extended: true }));

      // This must be stubbed before importing the routes
      sinon.stub(authMiddleware, "auth").returns([]);

      const { default: donorsRouter } = await import("../routes/donors");
      server.use("/donors", donorsRouter);

      checkDonorStub = sinon
        .stub(authMiddleware, "checkAdminOrTheDonor")
        .callsFake((_, req, res, next) => {
          next();
        });
    });

    describe("GET /donors/:id/donations", function () {
      beforeEach(function () {
        donorStub = sinon.stub(DAO.donors, "getByID");
        donorStub.withArgs("237").resolves(jack);

        var donationStub = sinon.stub(DAO.donations, "getByDonorId");
        donationStub.withArgs("237").resolves(donationsStub);
      });

      it("Should return 200 OK with the dontions by ID", async function () {
        const response = await request(server).get("/donors/237/donations").expect(200);
      });

      it("Should return the donations", async function () {
        const response = await request(server).get("/donors/237/donations");
        expect(response.body.content).to.deep.equal(donationsStub);
      });
    });

    describe("GET /donors/:id", function () {
      beforeEach(function () {
        donorStub = sinon.stub(DAO.donors, "getByID");

        donorStub.withArgs("237").resolves(jack);

        donorUpdateStub = sinon.stub(DAO.donors, "update");
      });

      it("Should return 200 OK with the donor by ID", async function () {
        const response = await request(server).get("/donors/237").expect(200);
      });

      it("Should return a donor that matches the provided id", async function () {
        const response = await request(server).get("/donors/237");
        expect(response.body.content).to.deep.equal(jack);
      });
    });

    describe("PUT /donors/:id", () => {
      beforeEach(function () {
        donorStub = sinon.stub(DAO.donors, "getByID");

        donorStub.withArgs("237").resolves(jack);

        donorUpdateStub = sinon.stub(DAO.donors, "update");
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
    });

    describe("GET /donors/:id/distributions", () => {
      let donorDistributionsStub: sinon.SinonStub;
      let taxUnitByKIDStub: sinon.SinonStub;
      let isStandardDistributionStub: sinon.SinonStub;

      beforeEach(function () {
        donorDistributionsStub = sinon.stub(DAO.distributions, "getAllByDonor");
        taxUnitByKIDStub = sinon.stub(DAO.tax, "getByKID");
        isStandardDistributionStub = sinon.stub(DAO.distributions, "isStandardDistribution");
      });

      function withDonorDistributions(
        distributions: Partial<Awaited<ReturnType<typeof DAO.distributions.getAllByDonor>>>,
      ) {
        donorDistributionsStub.resolves(distributions);
      }

      function withTaxUnits(
        entries: Array<[string, Partial<Awaited<ReturnType<typeof DAO.tax.getByKID>>>]>,
      ) {
        for (const [kid, taxUnit] of entries) {
          taxUnitByKIDStub.withArgs(kid).resolves(taxUnit);
        }
      }

      function withStandardDistributionKIDs(kids: string[]) {
        isStandardDistributionStub.callsFake((kid) => kids.includes(kid));
      }

      beforeEach(function () {
        withDonorDistributions({ distributions: [] });
      });

      it("should return 200", async () => {
        const response = await request(server).get("/donors/237/distributions").expect(200);
        expect(response.body.status).to.equal(200);
      });

      it("should return distribution tax units", async () => {
        const kid = "12345678901";
        withDonorDistributions({
          distributions: [
            {
              kid,
              shares: [],
            },
          ],
        });
        withStandardDistributionKIDs([kid]);
        const taxUnit = { id: 3 };
        withTaxUnits([[kid, taxUnit]]);
        const response = await request(server).get("/donors/237/distributions").expect(200);
        expect(response.body.content[0].taxUnit).to.deep.equal(taxUnit);
        expect(response.body.content[0].standardDistribution).to.equal(true);
      });
    });

    describe("GET /donors/:id/recurring/avtalegiro", function () {
      beforeEach(function () {
        agreementStub = sinon.stub(DAO.avtalegiroagreements, "getByDonorId");
        agreementStub.resolves(mockAgreements);
      });

      it("Should return 200 OK", async function () {
        const response = await request(server).get("/donors/237/recurring/avtalegiro").expect(200);
      });

      it("Should return the agreements", async function () {
        const response = await request(server).get("/donors/237/recurring/avtalegiro");
        expect(response.body.content).to.deep.equal(mockAgreements);
      });
    });

    describe("GET /donors/:id/recurring/vipps", function () {
      beforeEach(function () {
        agreementStub = sinon.stub(DAO.vipps, "getAgreementsByDonorId");
        agreementStub.resolves(mockAgreementsVipps);
      });

      it("Should return 200 OK", async function () {
        const response = await request(server).get("/donors/237/recurring/vipps").expect(200);
      });

      it("Should return the agreements", async function () {
        const response = await request(server).get("/donors/237/recurring/vipps");
        expect(response.body.content).to.deep.equal(mockAgreementsVipps);
      });
    });

    describe("GET /donors/:id/donations/aggregated", function () {
      let aggregatedByIdStub: sinon.SinonStub;

      const mockDonations = [
        {
          ID: 1,
          organization: "Against Malaria Foundation",
          abbriv: "AMF",
          value: "18.000000000000000000",
          year: 2022,
        },
        {
          ID: 2,
          organization: "Røde Kors",
          abbriv: "RK",
          value: "100.000000000000000000",
          year: 2018,
        },
        {
          ID: 45,
          organization: "Realfagbygget",
          abbriv: "A4",
          value: "250.000000000000000000",
          year: 2022,
        },
        {
          ID: 11,
          organization: "SOS Barnebyer",
          abbriv: "SOS",
          value: "250.000000000000000000",
          year: 2022,
        },
        {
          ID: 60,
          organization: "Barnekreftforeningen",
          abbriv: "BKF",
          value: "390.000000000000000000",
          year: 2019,
        },
      ];

      beforeEach(() => {
        aggregatedByIdStub = sinon
          .stub(DAO.donations, "getYearlyAggregateByDonorId")
          .resolves(mockDonations);
      });

      it("Gets all the donations of a donor by ID", async function () {
        aggregatedByIdStub.resolves(mockDonations);

        const response = await request(server).get("/donors/2349/donations/aggregated").expect(200);

        let donations = response.body.content;
        expect(donations).to.have.length(5);
        for (var i = 0; i < donations.length; i++) {
          expect(donations[i].ID).to.be.a("number");
          expect(donations[i].organization).to.be.a("string");
          expect(donations[i].abbriv).to.be.a("string");
          expect(donations[i].value).to.be.a("string");
          expect(donations[i].year).to.be.a("number");
        }
      });

      it("Donor doesn't have donations", async function () {
        aggregatedByIdStub.withArgs("2349").resolves([]);

        const response = await request(server).get("/donors/2349/donations/aggregated").expect(200);

        expect(response.body.content).to.be.empty;
      });

      it("Donor ID doesn't exist", async function () {
        checkDonorStub.callsFake(function (donorID, res, req, next) {
          throw new InvalidTokenError("Unexpected 'https://konduit.no/user-id' value");
        });

        const response = await request(server).get("/donors/1/donations/aggregated").expect(401);
      });
    });
  });

  afterEach(function () {
    sinon.restore();
  });
});
