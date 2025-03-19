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
import { organizations } from "../custom_modules/DAO_modules/organizations";

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
          distributionCauseAreas: [
            {
              causeAreaID: 1,
              percentageShare: 100,
              organizations: [
                {
                  id: 1,
                  percentageShare: 100,
                },
              ],
            },
          ],
          donor: {
            email: "test@example.com",
            name: "Test Testsson",
            newsletter: true,
          },
          method: methods.BANK,
          amount: 100,
          recurring: false,
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
            swishPaymentRequestToken: null,
          },
          status: 200,
        });
      });

      it("should add tax unit to added donor", async () => {
        const donorId = 123;
        donorsAddStub.resolves(donorId);

        const body = {
          distributionCauseAreas: [
            {
              causeAreaID: 1,
              percentageShare: 100,
              organizations: [
                {
                  id: 1,
                  percentageShare: 100,
                },
              ],
            },
          ],
          donor: {
            name: "Test Testsson",
            email: "test@testeson.no",
            ssn: "1234567890",
          },
          method: methods.BANK,
          amount: 100,
          recurring: false,
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
          distributionCauseAreas: [
            {
              causeAreaID: 1,
              percentageShare: 100,
              organizations: [
                {
                  id: 1,
                  percentageShare: 100,
                },
              ],
            },
          ],
          donor: {
            name: "Test Testsson",
            email: "test@testesen.no",
            ssn: "1234567890",
          },
          method: methods.BANK,
          amount: 100,
          recurring: false,
        };
        await request(server).post("/donations/register").send(body).expect(200);

        expect(addTaxUnitStub.called).to.be.false;
      });

      it("should initiate swish order", async () => {
        const stub = sinon.stub(swish, "initiateOrder");
        const KID = "1234567890";
        withCreatedKID(KID);
        const orderID = "123";
        const paymentRequestToken = "234";
        stub.resolves({ orderID, paymentRequestToken });

        const body = {
          distributionCauseAreas: [
            {
              causeAreaID: 1,
              percentageShare: 100,
              organizations: [
                {
                  id: 1,
                  percentageShare: 100,
                },
              ],
            },
          ],
          method: methods.SWISH,
          amount: 100,
          recurring: false,
          donor: {
            email: "test@testesen.no",
            name: "Test Testesen",
            newsletter: false,
          },
        };
        const response = await request(server).post("/donations/register").send(body).expect(200);

        expect(stub.calledOnce).to.be.true;
        expect(stub.firstCall.args[0]).to.equal(KID);
        expect(stub.firstCall.args[1]).to.deep.equal({ amount: body.amount });

        expect(response.body)
          .to.have.property("content")
          .that.has.property("swishOrderID")
          .equal(orderID);
        expect(response.body)
          .to.have.property("content")
          .that.has.property("swishPaymentRequestToken")
          .equal(paymentRequestToken);
      });

      it("should return 400 if missing body", async () => {
        await request(server).post("/donations/register").send(undefined).expect(400);
      });

      it("should return 400 if for recurring swish", async () => {
        await request(server)
          .post("/donations/register")
          .send({
            method: methods.SWISH,
            recurring: true,
          })
          .expect(400);
      });
    });
  });

  afterEach(() => {
    sinon.restore();
  });
});
