import { DAO } from "../custom_modules/DAO";
import sinon from "sinon";
import { expect } from "chai";
import * as fs from "fs";
import * as mail from "../custom_modules/mail";

const config = require("../config");

const vippsRoute = require("../routes/reports/vipps");
const ocrRoute = require("../routes/reports/ocr");

let addStub;
let mailStub;
let parsingRulesStub;
let queueStub;

describe("Vipps route handles report correctly", () => {
  before(() => {
    addStub = sinon
      .stub(DAO.donations, "add")
      //Returns donation ID
      .resolves(10);

    mailStub = sinon.stub(mail, "sendDonationReceipt");

    parsingRulesStub = sinon.stub(DAO.parsing, "getVippsParsingRules").resolves([]);

    queueStub = sinon.stub(DAO.reviewqueue, "add").resolves({ added: 5, existing: 0 });
  });

  beforeEach(() => {
    sinon.resetHistory();
  });

  it("Adds donations to DB", async () => {
    await runVipps("Vipps April 2019");
    expect(addStub.callCount).to.be.equal(10);
  });

  it("Queues unmatched transactions for review without changing the response", async () => {
    parsingRulesStub.resolves([]);
    const json = await runVipps("Vipps April 2019");

    expect(queueStub.calledOnce).to.be.true;
    expect(queueStub.firstCall.args[0]).to.equal("vipps");
    const queued = queueStub.firstCall.args[1];
    const { content } = (json.firstCall.args as any[])[0];
    expect(Object.keys(content)).to.deep.equal(["valid", "invalid", "invalidTransactions"]);
    expect(queued).to.have.length(content.invalidTransactions.length);
    expect(queued[0]).to.include({
      externalId: content.invalidTransactions[0].transaction.transactionID,
      paymentId: 4,
      amount: content.invalidTransactions[0].transaction.amount,
    });
  });

  it("Attempts to send mail when in production", async () => {
    config.env = "production";
    await runVipps("Vipps April 2019");
    config.env = "development";

    expect(mailStub.callCount).to.be.equal(10);
  });

  it("Adds default donations", async () => {
    parsingRulesStub.resolves([
      {
        salesLocation: "Stiftelsen Effekt",
        message: "Vipps",
        resolveKID: 12345678,
      },
    ]);

    await runVipps("Vipps April 2019");

    expect(addStub.callCount).to.be.equal(13);
  });

  it("Adds donations from the new Vipps details settlement CSV", async () => {
    parsingRulesStub.resolves([
      {
        salesLocation: "Gi Effektivt.",
        message: null,
        resolveKID: 12345678,
      },
    ]);

    await runVipps("Vipps Details June 2026");

    expect(addStub.callCount).to.be.equal(4);
    expect(addStub.firstCall.args[0]).to.equal(12345678);
    expect(addStub.secondCall.args[0]).to.equal(62354782);
    expect(addStub.thirdCall.args[2]).to.equal(30);
  });

  after(() => {
    sinon.restore();
  });
});

async function runVipps(filename) {
  let res = {
    json: () => {},
  };

  const jsonStub = sinon.stub(res, "json");

  const query = {
    body: {
      metaOwnerID: 3,
    },
    files: {
      report: {
        data: readReport("vipps", filename),
      },
    },
  };

  await vippsRoute(query, res, (ex) => {
    throw ex;
  });
  return jsonStub;
}

async function runOCR(filename) {
  let res = {
    json: () => {},
  };

  const jsonStub = sinon.stub(res, "json");

  const query = {
    body: {
      metaOwnerID: 3,
    },
    files: {
      report: {
        data: readReport("ocr", filename, "DAT"),
      },
    },
  };

  await ocrRoute(query, res, (ex) => {
    throw ex;
  });
}

function readReport(type, filename, extension = "CSV") {
  return fs.readFileSync(`src/__test__/data/${type}/${filename}.${extension}`);
}
