import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";

const pledge = {
  id: 1,
  sum: 1_350_000,
  decidedDate: "2026-10-23",
  receivedDate: null,
  donationId: null,
};

describe("pledges", () => {
  let server: express.Express;
  let parsePledgeInput: (body: any) => any;

  beforeEach(() => {
    sinon.replace(authMiddleware, "isAdmin", [] as any);
    delete require.cache[require.resolve("../routes/analysis")];
    const analysis = require("../routes/analysis");
    parsePledgeInput = analysis.parsePledgeInput;
    server = express();
    server.use(express.json());
    server.use("/analysis", analysis.analysisRouter);
  });

  afterEach(() => {
    sinon.restore();
    delete require.cache[require.resolve("../routes/analysis")];
  });

  describe("parsePledgeInput", () => {
    it("accepts an open pledge with only sum and decided date", () => {
      expect(parsePledgeInput({ sum: 1_350_000, decidedDate: "2026-10-23" })).to.deep.equal({
        sum: 1_350_000,
        decidedDate: "2026-10-23",
        receivedDate: null,
        donationId: null,
      });
    });

    it("ignores any other field, so nothing about the giver is stored", () => {
      const input = parsePledgeInput({ sum: 100, decidedDate: "2026-10-23", name: "Someone" });
      expect(input).to.not.have.property("name");
    });

    it("accepts a received pledge with a donation", () => {
      const input = parsePledgeInput({
        sum: 100.5,
        decidedDate: "2026-10-23",
        receivedDate: "2026-11-02",
        donationId: 42,
      });
      expect(input).to.include({ receivedDate: "2026-11-02", donationId: 42 });
    });

    it("rejects invalid input", () => {
      expect(parsePledgeInput({ sum: 0, decidedDate: "2026-10-23" })).to.be.a("string");
      expect(parsePledgeInput({ sum: -5, decidedDate: "2026-10-23" })).to.be.a("string");
      expect(parsePledgeInput({ sum: 10.555, decidedDate: "2026-10-23" })).to.be.a("string");
      expect(parsePledgeInput({ sum: 100, decidedDate: "23.10.2026" })).to.be.a("string");
      expect(parsePledgeInput({ sum: 100 })).to.be.a("string");
      expect(
        parsePledgeInput({ sum: 100, decidedDate: "2026-10-23", receivedDate: "soon" }),
      ).to.be.a("string");
      expect(
        parsePledgeInput({ sum: 100, decidedDate: "2026-10-23", donationId: 42 }),
        "donation without received date",
      ).to.be.a("string");
    });
  });

  describe("routes", () => {
    it("lists pledges", async () => {
      sinon.stub(DAO.pledges, "getAll").resolves([pledge]);
      const res = await request(server).get("/analysis/pledges");
      expect(res.status).to.equal(200);
      expect(res.body.content).to.deep.equal([pledge]);
    });

    it("adds a pledge", async () => {
      const addStub = sinon.stub(DAO.pledges, "add").resolves(1);
      sinon.stub(DAO.pledges, "getById").resolves(pledge);
      const res = await request(server)
        .post("/analysis/pledges")
        .send({ sum: 1_350_000, decidedDate: "2026-10-23" });
      expect(res.status).to.equal(200);
      expect(addStub.calledOnce).to.be.true;
      expect(res.body.content).to.deep.equal(pledge);
    });

    it("does not add an invalid pledge", async () => {
      const addStub = sinon.stub(DAO.pledges, "add");
      const res = await request(server).post("/analysis/pledges").send({ sum: "abc" });
      expect(res.status).to.equal(400);
      expect(addStub.called).to.be.false;
    });

    it("marks a pledge as received with a donation", async () => {
      sinon.stub(DAO.pledges, "donationExists").resolves(true);
      const updateStub = sinon.stub(DAO.pledges, "update").resolves(true);
      sinon.stub(DAO.pledges, "getById").resolves({
        ...pledge,
        receivedDate: "2026-11-02",
        donationId: 42,
      });
      const res = await request(server).put("/analysis/pledges/1").send({
        sum: 1_350_000,
        decidedDate: "2026-10-23",
        receivedDate: "2026-11-02",
        donationId: 42,
      });
      expect(res.status).to.equal(200);
      expect(updateStub.firstCall.args[0]).to.equal(1);
      expect(updateStub.firstCall.args[1]).to.include({ receivedDate: "2026-11-02" });
    });

    it("rejects a donation that does not exist", async () => {
      sinon.stub(DAO.pledges, "donationExists").resolves(false);
      const updateStub = sinon.stub(DAO.pledges, "update");
      const res = await request(server).put("/analysis/pledges/1").send({
        sum: 100,
        decidedDate: "2026-10-23",
        receivedDate: "2026-11-02",
        donationId: 999,
      });
      expect(res.status).to.equal(400);
      expect(updateStub.called).to.be.false;
    });

    it("returns 404 for an unknown pledge", async () => {
      sinon.stub(DAO.pledges, "update").resolves(false);
      const res = await request(server)
        .put("/analysis/pledges/77")
        .send({ sum: 100, decidedDate: "2026-10-23" });
      expect(res.status).to.equal(404);
    });

    it("deletes a pledge", async () => {
      sinon.stub(DAO.pledges, "remove").resolves(true);
      const res = await request(server).delete("/analysis/pledges/1");
      expect(res.status).to.equal(200);
    });
  });
});
