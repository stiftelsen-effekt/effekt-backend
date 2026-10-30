import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";
import * as mail from "../custom_modules/mail";

describe("request validation", () => {
  let queryStub: sinon.SinonStub;

  beforeEach(function () {
    // This must be stubbed before importing the routes
    sinon.stub(authMiddleware, "auth").returns([]);
    sinon.stub(authMiddleware, "checkAdminOrTheDonor").callsFake((_, req, res, next) => next());
    queryStub = sinon.stub(DAO, "query").rejects(new Error("unexpected query"));
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("donor ids", () => {
    let server: express.Express;

    beforeEach(function () {
      server = express();
      server.use(express.json());
      server.use("/donors", require("../routes/donors"));
    });

    for (const id of ["1.2345e4", "0x10", "12abc", "-1"]) {
      it(`rejects ${id}`, async function () {
        const getByID = sinon.stub(DAO.donors, "getByID").resolves(null);
        await request(server).get(`/donors/${id}`).expect(400);
        await request(server).put(`/donors/${id}`).send({ email: "a@b.no" }).expect(400);
        await request(server).get(`/donors/${id}/donations`).expect(400);
        expect(getByID.called).to.equal(false);
      });
    }

    it("rejects a non-integer tax unit id", async function () {
      await request(server).delete("/donors/1/taxunits/1e3").expect(400);
    });

    it("accepts a plain integer", async function () {
      sinon.stub(DAO.donations, "getByDonorId").resolves([]);
      await request(server).get("/donors/12345/donations").expect(200);
    });
  });

  describe("POST /referrals", () => {
    let server: express.Express;

    beforeEach(function () {
      server = express();
      server.use(express.json());
      server.use("/referrals", require("../routes/referrals"));
    });

    const valid = { referralID: 1, donorID: 2, active: false, session: "abc" };

    for (const [field, value] of [
      ["referralID", { ReferralID: 1 }],
      ["donorID", { DonorID: 1 }],
      ["session", { website_session: 1 }],
      ["session", 0],
      ["active", "false"],
      ["comment", { other_comment: "x" }],
    ] as const) {
      it(`rejects ${field} = ${JSON.stringify(value)}`, async function () {
        await request(server)
          .post("/referrals")
          .send({ ...valid, [field]: value })
          .expect(400);
        expect(queryStub.called).to.equal(false);
      });
    }

    it("accepts valid data", async function () {
      sinon.stub(DAO.referrals, "deleteRecord").resolves(true);
      await request(server).post("/referrals").send(valid).expect(200);
    });
  });

  describe("POST /donations/bank/pending", () => {
    let server: express.Express;
    let sendStub: sinon.SinonStub;

    beforeEach(function () {
      server = express();
      server.use("/donations", require("../routes/donations").default);
      sendStub = sinon.stub(mail, "sendDonationRegistered").resolves(true);
    });

    for (const data of [
      { KID: { KID: 1 }, sum: 100 },
      { KID: 12345, sum: 100 },
      { KID: "12a45", sum: 100 },
      { KID: "12345", sum: "100" },
    ]) {
      it(`rejects ${JSON.stringify(data)}`, async function () {
        await request(server)
          .post("/donations/bank/pending")
          .type("form")
          .send({ data: JSON.stringify(data) })
          .expect(400);
        expect(sendStub.called).to.equal(false);
      });
    }

    it("accepts the widget's payload", async function () {
      await request(server)
        .post("/donations/bank/pending")
        .type("form")
        .send({ data: '{"KID":"12345", "sum":100}' })
        .expect(200);
      expect(sendStub.calledOnceWith("12345", 100)).to.equal(true);
    });
  });
});
