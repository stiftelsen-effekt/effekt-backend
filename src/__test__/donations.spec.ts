import bodyParser from "body-parser";
import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import { DAO } from "../custom_modules/DAO";
import { donationHelpers } from "../custom_modules/donationHelpers";
import * as swish from "../custom_modules/swish";
import methods from "../enums/methods";
import donationsRouter from "../routes/donations";

describe("donations", () => {
  describe("routes", () => {
    let server: express.Express;

    beforeEach(() => {
      server = express();
      server.use(bodyParser.json());
      server.use(bodyParser.urlencoded({ extended: true }));
      server.use("/donations", donationsRouter);
    });

    describe("POST /donations/register", () => {
      let donorsGetIDByEmailStub: sinon.SinonStub;
      let donorsGetByIDStub: sinon.SinonStub;
      let donorsAddStub: sinon.SinonStub;
      let addTaxUnitStub: sinon.SinonStub;
      let taxGetByDonorIdAndSsnStub: sinon.SinonStub;
      let createKIDStub: sinon.SinonStub;
      let distributionsGetStandardDistributionByCauseAreaIDStub: sinon.SinonStub;
      let distributionsGetKIDBySplitStub: sinon.SinonStub;
      let distributionsAddStub: sinon.SinonStub;
      let addPaymentIntentStub: sinon.SinonStub;
      let referralsGetDonorAnsweredStub: sinon.SinonStub;

      function withDonor(
        donor: Partial<Awaited<ReturnType<typeof DAO.donors.getByID>>> | null,
      ): void {
        donorsGetIDByEmailStub.resolves(donor ? donor.id : null);
        donorsGetByIDStub.resolves(donor);
      }

      function withCauseAreaStandardDistribution(
        distribution: Awaited<
          ReturnType<typeof DAO.distributions.getStandardDistributionByCauseAreaID>
        >,
      ): void {
        distributionsGetStandardDistributionByCauseAreaIDStub.returns(distribution);
      }

      function withCreatedKID(KID: string) {
        createKIDStub.resolves(KID);
      }

      function withDistributionsKID(KID?: string) {
        distributionsGetKIDBySplitStub.resolves(KID);
      }

      function withReferralAnswered(answered: boolean) {
        referralsGetDonorAnsweredStub.resolves(answered);
      }

      function withTaxUnit(
        taxUnit: Partial<Awaited<ReturnType<typeof DAO.tax.getByDonorIdAndSsn>>> | null,
      ) {
        taxGetByDonorIdAndSsnStub.resolves(taxUnit);
      }

      beforeEach(() => {
        donorsGetIDByEmailStub = sinon.stub(DAO.donors, "getIDbyEmail");
        donorsGetByIDStub = sinon.stub(DAO.donors, "getByID");
        donorsAddStub = sinon.stub(DAO.donors, "add");
        addTaxUnitStub = sinon.stub(DAO.tax, "addTaxUnit");
        distributionsGetStandardDistributionByCauseAreaIDStub = sinon.stub(
          DAO.distributions,
          "getStandardDistributionByCauseAreaID",
        );
        createKIDStub = sinon.stub(donationHelpers, "createKID");
        distributionsGetKIDBySplitStub = sinon.stub(DAO.distributions, "getKIDbySplit");
        distributionsAddStub = sinon.stub(DAO.distributions, "add");
        addPaymentIntentStub = sinon.stub(DAO.initialpaymentmethod, "addPaymentIntent");
        referralsGetDonorAnsweredStub = sinon.stub(DAO.referrals, "getDonorAnswered");
        taxGetByDonorIdAndSsnStub = sinon.stub(DAO.tax, "getByDonorIdAndSsn");

        withDonor(null);
        withCauseAreaStandardDistribution([]);
        withDistributionsKID();
        withReferralAnswered(false);
      });

      it("should add a new donor if donor does not exist", async () => {
        const body = {
          distributionCauseAreas: [],
          donor: {
            email: "test@example.com",
            name: "Test Testsson",
            newsletter: true,
          },
        };
        const response = await request(server).post("/donations/register").send(body).expect(200);

        expect(donorsAddStub.calledOnce).to.be.true;
        expect(donorsAddStub.firstCall.args[0]).to.deep.equal({
          email: body.donor.email,
          full_name: body.donor.name,
          newsletter: body.donor.newsletter,
        });

        expect(response.body).to.deep.equal({
          content: {
            hasAnsweredReferral: false,
            paymentProviderUrl: "",
            swishOrderID: null,
          },
          status: 200,
        });
      });

      it("should add tax unit to added donor", async () => {
        const donorId = 123;
        donorsAddStub.resolves(donorId);

        const body = {
          distributionCauseAreas: [],
          donor: {
            name: "Test Testsson",
            ssn: "1234567890",
          },
        };
        await request(server).post("/donations/register").send(body).expect(200);

        expect(addTaxUnitStub.calledOnce).to.be.true;
        expect(addTaxUnitStub.firstCall.args[0]).to.equal(donorId);
        expect(addTaxUnitStub.firstCall.args[1]).to.equal(body.donor.ssn);
        expect(addTaxUnitStub.firstCall.args[2]).to.equal(body.donor.name);
      });

      it("should not add tax unit if donor already has one", async () => {
        withTaxUnit({});
        withDonor({ id: 123 });

        const body = {
          distributionCauseAreas: [],
          donor: {
            name: "Test Testsson",
            ssn: "1234567890",
          },
        };
        await request(server).post("/donations/register").send(body).expect(200);

        expect(addTaxUnitStub.called).to.be.false;
      });

      it("should initiate swish order", async () => {
        const stub = sinon.stub(swish, "initiateOrder");
        const KID = "1234567890";
        withCreatedKID(KID);
        const orderID = "123";
        stub.resolves({ orderID, paymentRequestToken: "123" });

        const body = {
          distributionCauseAreas: [],
          method: methods.SWISH,
          phone: "46701234567",
          amount: 100,
          recurring: false,
          donor: {},
        };
        const response = await request(server).post("/donations/register").send(body).expect(200);

        expect(stub.calledOnce).to.be.true;
        expect(stub.firstCall.args[0]).to.equal(KID);
        expect(stub.firstCall.args[1]).to.deep.equal({ amount: body.amount, phone: body.phone });

        expect(response.body)
          .to.have.property("content")
          .that.has.property("swishOrderID")
          .equal(orderID);
      });

      it("should return 400 if missing body", async () => {
        await request(server).post("/donations/register").send(undefined).expect(400);
      });

      it("should return 400 if badly formatted phone for swish", async () => {
        await request(server)
          .post("/donations/register")
          .send({
            method: methods.SWISH,
            phone: "123",
          })
          .expect(400);
      });
    });
  });

  afterEach(() => {
    sinon.restore();
  });
});
