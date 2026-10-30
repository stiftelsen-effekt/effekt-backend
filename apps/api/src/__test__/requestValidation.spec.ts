import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";

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

  describe("POST /donations/register", () => {
    let server: express.Express;
    const valid = () => ({
      distributionCauseAreas: [
        {
          id: 1,
          percentageShare: "100",
          standardSplit: false,
          organizations: [{ id: 1, percentageShare: "100" }],
        },
      ],
      donor: { email: "a@b.no", name: "A B", newsletter: false, ssn: "" },
      method: 2,
      amount: 100,
      recurring: 0,
    });

    beforeEach(function () {
      server = express();
      server.use(express.json());
      server.use("/donations", require("../routes/donations").default);
    });

    const invalid: Array<[string, (body: any) => void]> = [
      ["an object as cause area id", (b) => (b.distributionCauseAreas[0].id = { id: 1 })],
      ["an object as share", (b) => (b.distributionCauseAreas[0].percentageShare = { a: 1 })],
      ["an array as donor name", (b) => (b.donor.name = ["A"])],
      ["an object as ssn", (b) => (b.donor.ssn = { ssn: "1" })],
      ["a missing email", (b) => delete b.donor.email],
      ["an object as amount", (b) => (b.amount = { amount: 1 })],
      ["no cause areas", (b) => (b.distributionCauseAreas = [])],
      ["a fundraiser without showName", (b) => (b.fundraiser = { id: 1 })],
    ];
    for (const [name, change] of invalid) {
      it(`rejects ${name} before touching the database`, async function () {
        const getIDbyEmail = sinon.stub(DAO.donors, "getIDbyEmail").resolves(null);
        const body = valid();
        change(body);
        await request(server).post("/donations/register").send(body).expect(400);
        expect(getIDbyEmail.called).to.equal(false);
      });
    }

    it("accepts the fundraiser widget's string fundraiser id", async function () {
      const parsed = require("../schemas/publicRequests").registerDonationSchema.safeParse({
        ...valid(),
        fundraiser: { id: "12", message: "", messageSenderName: null, showName: false },
      });
      expect(parsed.success).to.equal(true);
      expect(parsed.data.fundraiser.id).to.equal(12);
    });
  });

  describe("POST /fundraisers/list", () => {
    let server: express.Express;

    beforeEach(function () {
      server = express();
      server.use(express.json());
      server.use("/fundraisers", require("../routes/fundraisers").fundraisersRouter);
    });

    it("rejects a body without pagination", async function () {
      const getList = sinon.stub(DAO.fundraisers, "getList");
      await request(server).post("/fundraisers/list").send({}).expect(400);
      await request(server)
        .post("/fundraisers/list")
        .send({ pagination: { page: 0, limit: 10 }, filter: { donor: { a: 1 } } })
        .expect(400);
      expect(getList.called).to.equal(false);
    });

    it("passes a valid body on", async function () {
      const getList = sinon.stub(DAO.fundraisers, "getList").resolves({} as any);
      await request(server)
        .post("/fundraisers/list")
        .send({ pagination: { page: 0, limit: 10, sort: null }, filter: { donor: "a" } })
        .expect(200);
      expect(getList.calledOnceWith(0, 10, { donor: "a" }, null)).to.equal(true);
    });
  });

  describe("POST /avtalegiro/draft", () => {
    it("is gone: the widget drafts through widget.draftAvtaleGiro with a registration token", async function () {
      const server = express();
      server.use(express.json());
      server.use("/avtalegiro", require("../routes/avtalegiro"));
      const add = sinon.stub(DAO.avtalegiroagreements, "add").resolves();
      await request(server)
        .post("/avtalegiro/draft")
        .send({ KID: "12345678", amount: 250, dueDay: 5 })
        .expect(404);
      expect(add.called).to.equal(false);
    });
  });
});
