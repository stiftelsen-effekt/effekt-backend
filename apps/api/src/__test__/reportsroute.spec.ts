import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { DAO } from "../custom_modules/DAO";
import sinon from "sinon";
import { expect } from "chai";
import * as fs from "fs";
import * as mail from "../custom_modules/mail";

const config = require("../config");

const vippsRoute = require("../routes/reports/vipps");

let addStub;
let mailStub;
let parsingRulesStub;
let queueStub;

describe("Vipps route handles report correctly", () => {
  beforeAll(() => {
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

  it("Only sends receipts for donations that were added", async () => {
    addStub.onFirstCall().rejects(new Error("EXISTING_DONATION | already added"));
    addStub.onSecondCall().rejects(new Error("NO_KID | KID does not exist"));
    config.env = "production";
    try {
      await runVipps("Vipps April 2019");
    } finally {
      config.env = "development";
      addStub.resetBehavior();
      addStub.resolves(10);
    }

    expect(addStub.callCount).to.be.equal(10);
    expect(mailStub.callCount).to.be.equal(8);
    expect(mailStub.alwaysCalledWith(10)).to.be.true;
  });

  it("Waits for receipts and keeps going if one fails", async () => {
    let pending = 0;
    let maxPending = 0;
    mailStub.callsFake(async () => {
      pending++;
      maxPending = Math.max(maxPending, pending);
      await new Promise((r) => setTimeout(r, 1));
      pending--;
      throw new Error("mail failed");
    });
    config.env = "production";
    try {
      await runVipps("Vipps April 2019");
    } finally {
      config.env = "development";
      mailStub.resetBehavior();
    }

    expect(mailStub.callCount).to.be.equal(10);
    expect(maxPending).to.equal(1);
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

  afterAll(() => {
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

function readReport(type, filename, extension = "CSV") {
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename.detect-non-literal-fs-filename -- test fixture file names are literals in this spec
  return fs.readFileSync(`src/__test__/data/${type}/${filename}.${extension}`);
}
