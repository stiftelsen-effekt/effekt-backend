import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import express from "express";
import moment from "moment";
import sinon from "sinon";
import request from "supertest";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";
import * as giroSftp from "../custom_modules/giroSftp";
import { enqueueInvalidTransactions } from "../custom_modules/reviewQueue";

const avtalegiro = require("../custom_modules/avtalegiro");

describe("review queue: enqueueInvalidTransactions", () => {
  let addStub: sinon.SinonStub;
  let countStub: sinon.SinonStub;
  const statuses = { open: 2, registered: 1, ignored: 0 };

  beforeEach(() => {
    addStub = sinon.stub(DAO.reviewqueue, "add").resolves({ added: 2, existing: 0 });
    countStub = sinon.stub(DAO.reviewqueue, "getCountsForImport").resolves(statuses);
  });

  afterEach(() => sinon.restore());

  it("normalises transactions from each source", async () => {
    const date = new Date("2026-10-01T00:00:00.000Z");
    await enqueueInvalidTransactions("ocr", [
      {
        reason: "Invalid KID",
        transaction: { KID: 123, amount: 250.5, date, transactionID: "ocr.1", paymentMethod: 6 },
      },
      {
        reason: undefined,
        transaction: {
          amount: 100,
          date: moment.utc("2026-10-02"),
          transactionID: "ocr.2",
          paymentID: 5,
          donorName: "Ola",
          message: "gave",
        },
      },
    ]);

    const [source, items, importLogId] = addStub.firstCall.args;
    expect(source).to.equal("ocr");
    expect(importLogId).to.equal(null);
    expect(items[0]).to.deep.include({
      reason: "Invalid KID",
      KID: "123",
      amount: 250.5,
      date,
      externalId: "ocr.1",
      paymentId: 6,
      message: null,
      name: null,
      location: null,
    });
    expect(items[0].raw).to.include({ transactionID: "ocr.1", KID: 123 });
    expect(items[1]).to.deep.include({
      reason: "Unknown error",
      KID: null,
      date: new Date("2026-10-02T00:00:00.000Z"),
      paymentId: 5,
      name: "Ola",
      message: "gave",
    });
  });

  it("writes nothing when there are no transactions", async () => {
    expect(await enqueueInvalidTransactions("vipps", [])).to.deep.equal({
      added: 0,
      existing: 0,
      skipped: 0,
      statuses: { open: 0, registered: 0, ignored: 0 },
    });
    expect(addStub.called).to.be.false;
  });

  it("counts rows as skipped instead of throwing when the queue can't be written", async () => {
    sinon.stub(console, "error");
    addStub.rejects(new Error("db down"));
    const result = await enqueueInvalidTransactions("bankNo", [
      { reason: "x", transaction: { amount: 1, transactionID: "b.1", paymentID: 5 } },
    ]);
    expect(result).to.deep.equal({ added: 0, existing: 0, skipped: 1, statuses });
  });

  it("skips unqueueable rows and queues the rest one by one if the batch fails", async () => {
    sinon.stub(console, "error");
    addStub.reset();
    addStub.callsFake(async (_source, items) => {
      if (items.length > 1) throw new Error("Incorrect decimal value");
      if (items[0].externalId === "b.3") throw new Error("Data too long");
      return { added: 1, existing: 0 };
    });
    const result = await enqueueInvalidTransactions("bankNo", [
      { reason: "x", transaction: { amount: 1, transactionID: "b.1", paymentID: 5 } },
      { reason: "x", transaction: { amount: NaN, transactionID: "b.2", paymentID: 5 } },
      { reason: "x", transaction: { amount: 2, transactionID: "b.3", paymentID: 5 } },
      {
        reason: "x",
        transaction: { amount: 3, transactionID: "b.4", paymentID: 5, date: new Date("x") },
      },
    ]);
    expect(result).to.deep.equal({ added: 2, existing: 0, skipped: 2, statuses });
    expect(countStub.firstCall.args).to.deep.equal(["bankNo", ["b.1", "b.3", "b.4"], null]);
    // The NaN amount is never sent; the invalid date is queued as null
    expect(addStub.firstCall.args[1].map((item) => item.externalId)).to.deep.equal([
      "b.1",
      "b.3",
      "b.4",
    ]);
    expect(addStub.lastCall.args[1][0].date).to.equal(null);
  });

  it("reports null statuses when they can't be counted", async () => {
    sinon.stub(console, "error");
    countStub.rejects(new Error("db down"));
    const result = await enqueueInvalidTransactions("bankNo", [
      { reason: "x", transaction: { amount: 1, transactionID: "b.1", paymentID: 5 } },
    ]);
    expect(result).to.deep.equal({ added: 2, existing: 0, skipped: 0, statuses: null });
  });
});

describe("review queue: POST /scheduled/ocr", () => {
  let server: express.Express;
  let addStub: sinon.SinonStub;
  let queueStub: sinon.SinonStub;
  let loggingStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.replace(authMiddleware, "isAdmin", []);
    const ocrFile = require("fs").readFileSync("src/__test__/data/ocr/TBOC2072.DAT");
    sinon
      .stub(giroSftp, "getOCRFiles")
      .resolves([{ name: "OCR.D311026", modifyTime: 1, contents: ocrFile }]);
    sinon
      .stub(DAO.logging, "getOcrImportState")
      .resolves({ imported: new Set(), trackedSince: null });
    sinon.stub(avtalegiro, "updateAgreements").resolves([]);
    addStub = sinon.stub(DAO.donations, "add").rejects(new Error("Invalid KID"));
    queueStub = sinon.stub(DAO.reviewqueue, "add").resolves({ added: 2, existing: 0 });
    loggingStub = sinon.stub(DAO.logging, "add").resolves(42);

    delete require.cache[require.resolve("../routes/scheduled")];
    const scheduledRoute = require("../routes/scheduled");
    server = express();
    server.use("/scheduled", scheduledRoute);
  });

  afterEach(() => {
    sinon.restore();
    delete require.cache[require.resolve("../routes/scheduled")];
  });

  it("queues failed transactions with the import log entry", async () => {
    const response = await request(server).post("/scheduled/ocr").expect(200);

    expect(response.body.files).to.have.length(1);
    const [imported] = response.body.files;
    expect(Object.keys(imported)).to.deep.equal([
      "filename",
      "fileModifyTime",
      "addedDonations",
      "updatedAgreements",
      "file",
    ]);
    const invalid = imported.addedDonations.invalidTransactions;
    expect(invalid.length).to.equal(addStub.callCount);
    expect(loggingStub.calledOnceWith("OCR")).to.be.true;
    expect(queueStub.calledOnce).to.be.true;
    const [source, items, importLogId] = queueStub.firstCall.args;
    expect(source).to.equal("ocr");
    expect(importLogId).to.equal(42);
    expect(items).to.have.length(invalid.length);
    expect(items[0].externalId).to.equal(invalid[0].transaction.transactionID);
  });
});
