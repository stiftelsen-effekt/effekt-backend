import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { expect } from "chai";
import express from "express";
import fileUpload from "express-fileupload";
import * as fs from "fs";
import type { Request, Response } from "express";
import sinon from "sinon";
import request from "supertest";
import { DAO } from "../custom_modules/DAO";
import * as mail from "../custom_modules/mail";
import * as reportsService from "../custom_modules/reportsService";
import { passMultipartBodyToTrpc, skipForTrpc } from "../trpc/reportsMultipart";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

const callerWith = (permissions?: string[]) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: permissions ? { permissions } : undefined,
  });

const admin = () => callerWith(["admin"]).reports;

const readData = (path: string) => fs.readFileSync(`src/__test__/data/${path}`);

const uploadForm = (
  path: string,
  fields: Record<string, string> = { metaOwnerID: "3" },
  type = "text/plain",
) => {
  const formData = new FormData();
  formData.append("report", new File([readData(path)], path.split("/").pop()!, { type }));
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return formData;
};

const expectTrpcError = async (promise: Promise<unknown>, code: string, message?: RegExp) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
    if (message) expect(err.message).to.match(message);
  }
};

describe("tRPC reports router", () => {
  let addStub: sinon.SinonStub;
  let queueStub: sinon.SinonStub;
  let logStub: sinon.SinonStub;

  beforeEach(() => {
    logStub = sinon.stub(DAO.logging, "add").resolves(77);
    addStub = sinon.stub(DAO.donations, "add").resolves(10);
    queueStub = sinon
      .stub(DAO.reviewqueue, "add")
      .callsFake(async (_source, items) => ({ added: items.length, existing: 0 }));
    sinon
      .stub(DAO.reviewqueue, "getCountsForImport")
      .resolves({ open: 1, registered: 2, ignored: 3 });
    sinon.stub(mail, "sendDonationReceipt").resolves();
    sinon.stub(DAO.meta, "getDataOwners").resolves([
      { id: 1, name: "Default", default: true },
      { id: 3, name: "Other", default: false },
    ] as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("auth and validation", () => {
    it("rejects anonymous callers", async () => {
      const getEntries = sinon.stub(DAO.logging, "getEntries");
      await expectTrpcError(callerWith().reports.logs.list({ page: 0, limit: 10 }), "UNAUTHORIZED");
      expect(getEntries.called).to.be.false;
    });

    it("rejects callers without the admin permission", async () => {
      await expectTrpcError(
        callerWith(["read:profile"]).reports.uploads.ocr(uploadForm("ocr/TBOC2072.DAT")),
        "FORBIDDEN",
      );
      expect(addStub.called).to.be.false;
    });

    it("rejects invalid list input", async () => {
      await expectTrpcError(admin().logs.list({ page: 0, limit: 0 }), "BAD_REQUEST");
      await expectTrpcError(
        admin().fundraisers.list({ page: 0, limit: 10, sort: { id: "secret" as any, desc: true } }),
        "BAD_REQUEST",
      );
    });

    it("rejects uploads without a valid file or meta owner", async () => {
      const unknownOwner = uploadForm("ocr/TBOC2072.DAT", { metaOwnerID: "99" });
      await expectTrpcError(admin().uploads.ocr(unknownOwner), "BAD_REQUEST", /Data owner 99/);

      const badOwner = uploadForm("ocr/TBOC2072.DAT", { metaOwnerID: "3abc" });
      await expectTrpcError(admin().uploads.ocr(badOwner), "BAD_REQUEST");

      const noFile = new FormData();
      noFile.append("metaOwnerID", "3");
      await expectTrpcError(admin().uploads.ocr(noFile), "BAD_REQUEST");

      const twoFiles = uploadForm("ocr/TBOC2072.DAT");
      twoFiles.append("report", new File(["x"], "second.DAT"));
      await expectTrpcError(admin().uploads.ocr(twoFiles), "BAD_REQUEST", /one report file/);

      expect(addStub.called).to.be.false;
    });
  });

  describe("uploads", () => {
    it("registers with the default owner when metaOwnerID is omitted", async () => {
      await admin().uploads.ocr(uploadForm("ocr/TBOC2072.DAT", {}));
      expect(addStub.called).to.be.true;
      expect(addStub.firstCall.args[5]).to.equal(null);
    });

    it("accepts and validates metaOwnerID on every upload", async () => {
      const bankSe = sinon
        .stub(reportsService, "processBankSeReport")
        .resolves({ valid: 0, invalid: 0, invalidTransactions: [] });
      sinon.stub(reportsService, "processFacebookReport").resolves({ fbCampaigns: [] });
      sinon
        .stub(reportsService, "processAutogiroReport")
        .resolves({ type: "eMandates", newMandates: 0 });

      await admin().uploads.bankSe(uploadForm("camt/camt053_mixed.xml"));
      expect(bankSe.firstCall.args[2]).to.equal(3);
      await admin().uploads.facebook(uploadForm("bank/sampleReport.CSV"));
      await admin().uploads.autogiro(uploadForm("autogiro/e-mandates.txt"));

      for (const upload of [
        admin().uploads.bankSe,
        admin().uploads.facebook,
        admin().uploads.autogiro,
      ]) {
        await expectTrpcError(
          upload(uploadForm("bank/sampleReport.CSV", { metaOwnerID: "99" })),
          "BAD_REQUEST",
          /Data owner 99/,
        );
      }
    });

    it("rejects files that are not the expected report type, writing nothing", async () => {
      sinon.stub(DAO.parsing, "getVippsParsingRules").resolves([]);
      sinon.stub(DAO.donations, "getByExternalPaymentID").resolves(null as any);
      const kidExists = sinon.stub(DAO.distributions, "KIDexists").resolves(true);

      const cases: [Promise<unknown>, RegExp][] = [
        [admin().uploads.vipps(uploadForm("bank/sampleReport.CSV")), /Not a Vipps settlement/],
        [
          admin().uploads.vipps(uploadForm("autogiro/e-mandates.txt")),
          /Could not read the Vipps report/,
        ],
        [admin().uploads.bankSe(uploadForm("bank/sampleReport.CSV")), /Not a CAMT.053/],
        [admin().uploads.bankSe(uploadForm("camt/camt053_malformed.xml")), /CAMT.053/],
        [admin().uploads.bankSe(uploadForm("camt/camt053_wrong_namespace.xml")), /No statement/],
        [admin().uploads.bankSe(uploadForm("camt/camt053_xxe.xml")), /entity/],
        [admin().uploads.autogiro(uploadForm("bank/sampleReport.CSV")), /AutoGiro file/],
      ];
      for (const [promise, message] of cases) {
        await expectTrpcError(promise, "BAD_REQUEST", message);
      }
      expect(addStub.called).to.be.false;
      expect(kidExists.called).to.be.false;
    });

    it("rejects an unreadable xlsx sent as a Vipps report", async () => {
      const formData = new FormData();
      // A zip container (xlsx) with binary content
      const xlsx = Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(64, 0xff)]);
      formData.append("report", new File([xlsx], "report.xlsx"));
      await expectTrpcError(admin().uploads.vipps(formData), "BAD_REQUEST");
      expect(addStub.called).to.be.false;
    });

    it("rejects files that don't match the chosen source before writing anything", async () => {
      await expectTrpcError(
        admin().uploads.ocr(uploadForm("bank/sampleReport.CSV")),
        "BAD_REQUEST",
        /Not a Nets OCR file/,
      );
      await expectTrpcError(
        admin().uploads.ocr(uploadForm("ocr_no_valid_records.ocr")),
        "BAD_REQUEST",
        /no KID or AvtaleGiro payments/,
      );
      await expectTrpcError(
        admin().uploads.bankNo(uploadForm("vipps/Vipps Details June 2026.CSV")),
        "BAD_REQUEST",
        /Not a bank account export: row 2 has no date/,
      );
      await expectTrpcError(
        admin().uploads.bankNo(uploadForm("ocr/TBOC2072.DAT")),
        "BAD_REQUEST",
        /Not a bank account export/,
      );
      const fetchRates = sinon.stub(DAO.facebook, "removeAllFacebookReports").resolves();
      await expectTrpcError(
        admin().uploads.facebook(uploadForm("bank/sampleReport.CSV", {})),
        "BAD_REQUEST",
        /Not a Facebook payout report: missing the columns Charge date/,
      );
      expect(fetchRates.called).to.be.false;
      expect(addStub.called).to.be.false;
      expect(logStub.called).to.be.false;
      expect(queueStub.called).to.be.false;
    });

    it("keeps stored Facebook reports when the file can't be parsed", async () => {
      sinon.stub(console, "error");
      const remove = sinon.stub(DAO.facebook, "removeAllFacebookReports").resolves();
      const register = sinon.stub(DAO.facebook, "registerFacebookReport").resolves();

      await expectTrpcError(
        admin().uploads.facebook(uploadForm("ocr/TBOC2072.DAT", {})),
        "BAD_REQUEST",
        /Facebook payout report/,
      );
      expect(remove.called).to.be.false;
      expect(register.called).to.be.false;
    });

    it("ocr registers donations and lists failed ones for review", async () => {
      addStub.onCall(0).rejects(new Error("EXISTING_DONATION"));
      addStub.onCall(1).rejects(new Error("Invalid KID"));

      const result = await admin().uploads.ocr(uploadForm("ocr/TBOC2072.DAT"));

      expect(addStub.callCount).to.equal(2);
      expect(addStub.firstCall.args[5]).to.equal(3);
      expect(result.ignored).to.equal(1);
      expect(result.invalid).to.equal(1);
      expect(result.valid).to.equal(addStub.callCount - 2);
      expect(result.invalidTransactions).to.have.length(1);
      const [item] = result.invalidTransactions;
      expect(item.reason).to.equal("Invalid KID");
      expect(item.transaction.paymentID).to.be.a("number");
      expect(item.transaction.date).to.match(/^\d{4}-\d{2}-\d{2}T/);
      expect(item.transaction.KID).to.be.a("string");

      expect(result.queue).to.deep.equal({
        added: 1,
        existing: 0,
        skipped: 0,
        statuses: { open: 1, registered: 2, ignored: 3 },
      });
      expect(queueStub.calledOnce).to.be.true;
      const [source, queued, importLogId, metaOwnerId] = queueStub.firstCall.args;
      expect(source).to.equal("ocr");
      expect(importLogId).to.equal(77);
      expect(metaOwnerId).to.equal(3);
      expect(result.importLogId).to.equal(77);
      expect(queued).to.have.length(1);
      expect(queued[0]).to.include({
        reason: "Invalid KID",
        KID: item.transaction.KID,
        amount: item.transaction.amount,
        externalId: item.transaction.transactionID,
        paymentId: item.transaction.paymentID,
      });
      expect(queued[0].date).to.be.instanceOf(Date);
      expect(queued[0].raw).to.have.property("transactionID", item.transaction.transactionID);
    });

    it("logs the upload with file, owner and uploader, like the scheduled import", async () => {
      addStub.rejects(new Error("Invalid KID"));
      const caller = createCaller({
        req: {} as Request,
        res: {} as Response,
        auth: { permissions: ["admin"], sub: "auth0|1", email: "admin@example.org" } as any,
      });

      const result = await caller.reports.uploads.ocr(uploadForm("ocr/TBOC2072.DAT"));

      expect(logStub.calledOnce).to.be.true;
      const [label, entry] = logStub.firstCall.args;
      expect(label).to.equal("OCR - Upload");
      expect(entry.upload).to.deep.equal({
        source: "ocr",
        metaOwnerID: 3,
        uploadedBy: "admin@example.org",
      });
      expect(entry.filename).to.equal("TBOC2072.DAT");
      expect(entry.file).to.equal(readData("ocr/TBOC2072.DAT").toString("utf8"));
      expect(entry.donations).to.deep.equal({
        valid: result.valid,
        invalid: result.invalid,
        ignored: result.ignored,
      });
      expect(entry.invalidTransactions).to.deep.equal(result.invalidTransactions);
      // The log is written before the items are queued, so they can link to it
      expect(logStub.calledBefore(queueStub)).to.be.true;
    });

    it("labels the log per source and stores null for the default owner", async () => {
      sinon.stub(DAO.parsing, "getVippsParsingRules").resolves([]);
      await admin().uploads.vipps(uploadForm("vipps/Vipps April 2019.CSV"));
      await admin().uploads.bankNo(uploadForm("bank/sampleReport.CSV", {}));
      expect(logStub.firstCall.args[0]).to.equal("Vipps - Upload");
      expect(logStub.firstCall.args[1].filename).to.equal("Vipps April 2019.CSV");
      expect(logStub.secondCall.args[0]).to.equal("Bank NO - Upload");
      expect(logStub.secondCall.args[1].upload.metaOwnerID).to.equal(null);
    });

    it("queues without a log link when writing the log fails", async () => {
      sinon.stub(console, "error");
      logStub.rejects(new Error("db down"));
      addStub.rejects(new Error("Invalid KID"));

      const result = await admin().uploads.ocr(uploadForm("ocr/TBOC2072.DAT"));

      expect(result.importLogId).to.equal(null);
      expect(result.queue).to.not.equal(null);
      expect(queueStub.firstCall.args[2]).to.equal(null);
    });

    it("still returns the upload result when queueing for review fails", async () => {
      sinon.stub(console, "error");
      queueStub.rejects(new Error("db down"));
      addStub.rejects(new Error("Invalid KID"));

      const result = await admin().uploads.ocr(uploadForm("ocr/TBOC2072.DAT"));

      expect(result.invalidTransactions.length).to.be.greaterThan(0);
      expect(result.queue).to.deep.include({ added: 0, existing: 0 });
      expect(result.queue!.skipped).to.equal(result.invalidTransactions.length);
    });

    it("vipps adds donations with a KID and queues the rest", async () => {
      sinon.stub(DAO.parsing, "getVippsParsingRules").resolves([]);

      const result = await admin().uploads.vipps(uploadForm("vipps/Vipps April 2019.CSV"));

      expect(result.valid).to.equal(10);
      expect(result.invalidTransactions.length).to.be.greaterThan(0);
      const [item] = result.invalidTransactions;
      expect(item.reason).to.equal("Could not find valid KID or matching parsing rule");
      expect(item.transaction).to.include.keys(
        "KID",
        "amount",
        "date",
        "transactionID",
        "paymentID",
        "message",
        "name",
        "location",
      );
      expect(item.transaction.paymentID).to.equal(4);
      expect(item.transaction.date).to.be.a("string");
    });

    it("bankNo registers transactions with a KID", async () => {
      const result = await admin().uploads.bankNo(uploadForm("bank/sampleReport.CSV"));

      expect(result.valid).to.equal(addStub.callCount);
      expect(result.valid + result.invalid).to.be.greaterThan(0);
      for (const item of result.invalidTransactions) {
        expect(item.transaction.paymentID).to.equal(5);
      }
    });

    it("bankSe dry run writes nothing and reports would-be donations", async () => {
      sinon.stub(DAO.donations, "getByExternalPaymentID").resolves(null as any);
      sinon.stub(DAO.distributions, "KIDexists").resolves(true);
      sinon.stub(DAO.distributions, "getKIDsByPrefix").resolves([]);
      sinon.stub(DAO.donations, "getLatestByLegacySeDistribution").resolves(null as any);

      const result = await admin().uploads.bankSe(
        uploadForm("camt/camt053_mixed.xml", { dryRun: "true" }),
      );

      expect(addStub.called).to.be.false;
      expect(result.dryRun).to.not.equal(null);
      expect(result.dryRun!.fileFormat).to.equal("xml");
      expect(result.dryRun!.totalParsed).to.be.greaterThan(0);
      expect(result.dryRun!.validTransactions).to.have.length(result.valid);
      expect(result.queue).to.equal(null);
      expect(result.importLogId).to.equal(null);
      expect(queueStub.called).to.be.false;
      expect(logStub.called).to.be.false;
    });

    it("bankSe without dryRun returns no dry run info", async () => {
      const processStub = sinon
        .stub(reportsService, "processBankSeReport")
        .resolves({ valid: 1, invalid: 0, invalidTransactions: [] });

      const result = await admin().uploads.bankSe(uploadForm("camt/camt053_mixed.xml", {}));

      expect(processStub.firstCall.args[1]).to.equal(false);
      expect(result).to.deep.equal({
        valid: 1,
        invalid: 0,
        invalidTransactions: [],
        queue: {
          added: 0,
          existing: 0,
          skipped: 0,
          statuses: { open: 0, registered: 0, ignored: 0 },
        },
        importLogId: 77,
        dryRun: null,
      });
      expect(logStub.firstCall.args[0]).to.equal("Bank SE - Upload");
    });

    it("facebook returns campaigns missing shares", async () => {
      const campaigns = [
        { ID: "1", fundraiserTitle: "Bday", campaignOwnerName: "Ola", permalink: "https://x" },
      ];
      sinon.stub(reportsService, "processFacebookReport").resolves({ fbCampaigns: campaigns });

      const result = await admin().uploads.facebook(uploadForm("bank/sampleReport.CSV", {}));

      expect(result).to.deep.equal({ fbCampaigns: campaigns });
    });

    it("autogiro maps payment results for review, with amounts in whole SEK", async () => {
      const date = new Date("2024-03-28T00:00:00.000Z");
      sinon.stub(reportsService, "processAutogiroReport").resolves({
        type: "payments",
        importLogId: 41,
        valid: 2,
        invalid: 1,
        invalidTransactions: [
          {
            reason: "KID 123 not found in distributions",
            transaction: { KID: "123", transactionID: "ag.1", paymentID: 12, amount: 10000, date },
          },
        ],
      });

      const result = await admin().uploads.autogiro(
        uploadForm("autogiro/paymentSpecification.txt"),
      );

      expect(result.type).to.equal("payments");
      if (result.type !== "payments") return;
      expect(result.invalidTransactions[0].transaction).to.deep.equal({
        KID: "123",
        amount: 100,
        date: "2024-03-28T00:00:00.000Z",
        transactionID: "ag.1",
        paymentID: 12,
        message: null,
        name: null,
        location: null,
      });
      expect(result.importLogId).to.equal(41);
      // AutoGiro processing writes its own log entry; the upload doesn't add another
      expect(logStub.called).to.be.false;
      expect(queueStub.firstCall.args[0]).to.equal("autogiro");
      expect(queueStub.firstCall.args.slice(2)).to.deep.equal([41, 3]);
      expect(queueStub.firstCall.args[1][0]).to.include({ amount: 100, externalId: "ag.1" });
    });

    it("autogiro passes other file types through", async () => {
      sinon
        .stub(reportsService, "processAutogiroReport")
        .resolves({ type: "eMandates", newMandates: 4 });

      const result = await admin().uploads.autogiro(uploadForm("autogiro/e-mandates.txt", {}));

      expect(result).to.deep.equal({ type: "eMandates", newMandates: 4 });
    });
  });

  describe("transactions", () => {
    it("range returns the donations as rows", async () => {
      const rows = [
        {
          ID: 1,
          time: new Date("2024-01-02"),
          name: "Ola",
          donorID: 2,
          sum: "100.00",
          paymentMethod: "Bank",
          transactionCost: null,
          split: [],
        },
      ];
      const rangeStub = sinon.stub(DAO.donations, "getFromRange").resolves(rows);

      const file = await admin().transactions.range({
        fromDate: "2024-01-01",
        toDate: "2024-01-31",
        paymentMethodIDs: [2, 5],
      });

      // Whole Oslo days: from the start of 1 January to the start of 1 February (CET)
      expect(rangeStub.firstCall.args[0]).to.deep.equal(new Date("2023-12-31T23:00:00Z"));
      expect(rangeStub.firstCall.args[1]).to.deep.equal(new Date("2024-01-31T23:00:00Z"));
      expect(rangeStub.firstCall.args[2]).to.deep.equal([2, 5]);
      expect(rangeStub.firstCall.args[3]).to.deep.equal({ exclusiveEnd: true });
      expect(file).to.deep.equal({ filename: "transactions_2024-01-01_2024-01-31", rows });
    });

    it("range rejects a reversed date range", async () => {
      const rangeStub = sinon.stub(DAO.donations, "getFromRange").resolves([]);
      await expectTrpcError(
        admin().transactions.range({ fromDate: "2024-02-01", toDate: "2024-01-31" }),
        "BAD_REQUEST",
      );
      expect(rangeStub.called).to.be.false;
    });

    it("range passes null for all payment methods", async () => {
      const rangeStub = sinon.stub(DAO.donations, "getFromRange").resolves([]);
      await admin().transactions.range({ fromDate: "2024-01-01", toDate: "2024-01-31" });
      expect(rangeStub.firstCall.args[2]).to.equal(null);
    });
  });

  describe("tax", () => {
    it("ku65 builds the XML file", async () => {
      const formData = new FormData();
      formData.append(
        "report",
        new File(["191212121212,500\n191212121212,250\n"], "ku65.csv", { type: "text/csv" }),
      );
      formData.append("year", "2025");

      const file = await admin().tax.ku65(formData);

      expect(file.filename).to.equal("ku65_2025.xml");
      expect(file.contentType).to.equal("application/xml");
      expect(file.content).to.contain("<?xml");
      expect(file.content).to.contain("750");
    });

    it("ku65 accepts .csv files with the content types Windows browsers send", async () => {
      for (const type of ["application/vnd.ms-excel", "application/octet-stream"]) {
        const formData = new FormData();
        formData.append("report", new File(["191212121212,500\n"], "KU65.CSV", { type }));
        formData.append("year", "2025");
        expect((await admin().tax.ku65(formData)).content).to.contain("500");
      }

      const notCsvName = new FormData();
      notCsvName.append(
        "report",
        new File(["191212121212,500\n"], "ku65.xls", { type: "application/vnd.ms-excel" }),
      );
      notCsvName.append("year", "2025");
      await expectTrpcError(admin().tax.ku65(notCsvName), "BAD_REQUEST");
    });

    it("ku65 rejects invalid personnummer and non-CSV files", async () => {
      const invalid = new FormData();
      invalid.append("report", new File(["123,500\n"], "ku65.csv", { type: "text/csv" }));
      invalid.append("year", "2025");
      await expectTrpcError(admin().tax.ku65(invalid), "BAD_REQUEST");

      const notCsv = new FormData();
      notCsv.append("report", new File(["x"], "ku65.txt", { type: "text/plain" }));
      notCsv.append("year", "2025");
      await expectTrpcError(admin().tax.ku65(notCsv), "BAD_REQUEST");
    });
  });

  describe("logs", () => {
    it("list pages through log entries", async () => {
      const rows = [{ ID: 1, label: "Vipps", timestamp: new Date(), meta: "" }];
      const getEntries = sinon
        .stub(DAO.logging, "getEntries")
        .resolves({ results: rows, pages: 3, total: 70 });

      const result = await admin().logs.list({
        page: 2,
        limit: 25,
        filter: { fileSearch: "002370000101" },
      });

      expect(getEntries.firstCall.args).to.deep.equal([
        25,
        50,
        "002370000101",
        { id: "timestamp", desc: true },
      ]);
      expect(result).to.deep.equal({ rows, pages: 3, total: 70 });

      await admin().logs.list({ page: 0, limit: 10, sort: { id: "label", desc: false } });
      expect(getEntries.secondCall.args[3]).to.deep.equal({ id: "label", desc: false });
      await expectTrpcError(
        admin().logs.list({ page: 0, limit: 10, sort: { id: "result" as any, desc: false } }),
        "BAD_REQUEST",
      );
    });

    it("sorts with an id tie-break, keeping the REST order when unsorted", async () => {
      const query = sinon.stub(DAO, "query");
      query.resolves([[{ count: 3 }], []] as any);

      await DAO.logging.getEntries(25, 0, null, { id: "label", desc: false });
      expect(query.firstCall.args[0]).to.match(/ORDER BY label ASC, ID ASC\s+LIMIT/);

      await DAO.logging.getEntries(25, 0, null);
      expect(query.thirdCall.args[0]).to.match(/ORDER BY timestamp DESC\s+LIMIT/);
    });

    it("counts pages with the file search filter applied", async () => {
      const query = sinon.stub(DAO, "query");
      query.onCall(0).resolves([[], []] as any);
      query.onCall(1).resolves([[{ count: 30 }], []] as any);

      const result = await DAO.logging.getEntries(25, 0, "0023");

      expect(query.secondCall.args[0]).to.match(
        /WHERE JSON_EXTRACT\(result, "\$\.file"\) LIKE '%0023%'/,
      );
      expect(result.pages).to.equal(2);
      expect(result.total).to.equal(30);
    });

    it("get returns an entry or NOT_FOUND", async () => {
      const entry = { ID: 7, label: "OCR", result: { file: "..." }, timestamp: new Date() };
      const get = sinon.stub(DAO.logging, "get");
      get.withArgs(7).resolves(entry);
      get.resolves(null);

      expect(await admin().logs.get({ id: 7 })).to.deep.equal(entry);
      await expectTrpcError(admin().logs.get({ id: 8 }), "NOT_FOUND");
    });
  });

  describe("fundraisers", () => {
    const fundraiser = {
      id: 5,
      donorId: 42,
      secret: "s3cret",
      registered: new Date("2025-01-01"),
      lastUpdated: new Date("2025-01-02"),
    };

    it("list passes filter with dates, sort and secrets to the DAO", async () => {
      const list = {
        rows: [],
        statistics: { totalCount: 0, totalSum: 0, avgDonation: 0 },
        pages: 0,
      };
      const getList = sinon.stub(DAO.fundraisers, "getList").resolves(list);

      const result = await admin().fundraisers.list({
        page: 1,
        limit: 20,
        sort: { id: "totalSum", desc: true },
        filter: {
          registrationDate: { from: "2025-01-01" },
          donationSum: { from: 100 },
          donor: "Ola",
          organizationIDs: [1],
        },
      });

      expect(result).to.deep.equal(list);
      const [page, limit, filter, sort, includeSecrets] = getList.firstCall.args;
      expect([page, limit, includeSecrets]).to.deep.equal([1, 20, true]);
      expect(sort).to.deep.equal({ id: "totalSum", desc: true });
      expect(filter).to.deep.equal({
        registrationRange: { from: new Date("2024-12-31T23:00:00Z"), before: undefined },
        donationSum: { from: 100 },
        donor: "Ola",
        organizationIDs: [1],
      });
    });

    it("get combines the fundraiser with its totals and transactions", async () => {
      sinon.stub(DAO.fundraisers, "getFundraiserWithSecret").resolves(fundraiser);
      const transactions = [{ id: 3, name: null, message: "Go!", amount: 100, date: new Date() }];
      sinon
        .stub(DAO.fundraisers, "getFundraiserByID")
        .resolves({ totalSum: 100, donationCount: 1, transactions });

      const result = await admin().fundraisers.get({ id: 5 });

      expect(result).to.deep.equal({
        ...fundraiser,
        totalSum: 100,
        donationCount: 1,
        transactions,
      });
    });

    it("get throws NOT_FOUND for unknown fundraisers", async () => {
      sinon.stub(DAO.fundraisers, "getFundraiserWithSecret").resolves(null);
      await expectTrpcError(admin().fundraisers.get({ id: 5 }), "NOT_FOUND");
    });

    it("create makes a fundraiser for an existing donor", async () => {
      sinon.stub(DAO.donors, "getByID").resolves({ id: 42 } as any);
      const create = sinon
        .stub(DAO.fundraisers, "createFundraiser")
        .resolves({ id: 5, secret: "s3cret" });
      sinon.stub(DAO.fundraisers, "getFundraiserWithSecret").resolves(fundraiser);

      expect(await admin().fundraisers.create({ donorId: 42 })).to.deep.equal(fundraiser);
      expect(create.firstCall.args).to.deep.equal([42]);
    });

    it("create rejects unknown donors", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(null);
      const create = sinon.stub(DAO.fundraisers, "createFundraiser");

      await expectTrpcError(admin().fundraisers.create({ donorId: 42 }), "BAD_REQUEST");
      expect(create.called).to.be.false;
    });
  });

  describe("multipart transport through Express", () => {
    // Same middleware order as server.ts: express.json, file upload (skipped for /trpc), tRPC
    const app = express();
    app.use(express.json());
    app.use(skipForTrpc(fileUpload()));
    app.post("/reports/ocr", (req, res) => {
      res.json({ hasFile: !!(req as any).files?.report, metaOwnerID: req.body.metaOwnerID });
    });
    app.use(
      "/trpc",
      passMultipartBodyToTrpc,
      createExpressMiddleware({
        router: appRouter,
        createContext: ({ req, res }) => ({ req, res, auth: { permissions: ["admin"] } }),
      }),
    );

    it("passes FormData uploads to tRPC procedures", async () => {
      const res = await request(app)
        .post("/trpc/reports.uploads.ocr")
        .field("metaOwnerID", "3")
        .attach("report", readData("ocr/TBOC2072.DAT"), "TBOC2072.DAT")
        .expect(200);

      expect(res.body.result.data.valid).to.equal(addStub.callCount);
      expect(addStub.firstCall.args[5]).to.equal(3);
    });

    it("rejects multipart requests with invalid fields", async () => {
      await request(app)
        .post("/trpc/reports.uploads.ocr")
        .field("metaOwnerID", "x")
        .attach("report", readData("ocr/TBOC2072.DAT"), "TBOC2072.DAT")
        .expect(400);
      expect(addStub.called).to.be.false;
    });

    it("still parses uploads for REST routes", async () => {
      const res = await request(app)
        .post("/reports/ocr")
        .field("metaOwnerID", "3")
        .attach("report", readData("ocr/TBOC2072.DAT"), "TBOC2072.DAT")
        .expect(200);
      expect(res.body).to.deep.equal({ hasFile: true, metaOwnerID: "3" });
    });
  });
});
