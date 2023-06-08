import { DAO } from "../custom_modules/DAO";
import sinon from "sinon";
import { expect } from "chai";
import * as fs from "fs";
import * as mail from "../custom_modules/mail";

const config = require("../config");

const paypalroute = require("../routes/reports/paypal");
const vippsRoute = require("../routes/reports/vipps");
const ocrRoute = require("../routes/reports/ocr");

let addStub;
let mailStub;
let historicStub;
let parsingRulesStub;

describe("PayPal report route handles correctly", () => {
  before(() => {
    addStub = sinon
      .stub(DAO.donations, "add")
      //Returns donation ID
      .resolves(10);

    mailStub = sinon.stub(mail, "sendDonationReciept");

    historicStub = sinon.stub(DAO.distributions, "getHistoricPaypalSubscriptionKIDS");

    parsingRulesStub = sinon.stub(DAO.parsing, "getVippsParsingRules").resolves([]);
  });

  beforeEach(() => {
    sinon.resetHistory();
  });

  it("adds donations to DB when historic matching exists", async () => {
    historicStub.resolves({
      "I-YE66CY1W4DPU": 23,
    });

    await runPaypal("Paypal April 2019");

    expect(addStub.callCount).to.be.equal(1);
  });

  it("does not fail on 0 historic paypal matches", async () => {
    historicStub.resolves([]);

    await runPaypal("Paypal Special");

    expect(addStub.callCount).to.be.equal(0);
  });

  after(() => {
    sinon.restore();
  });
});

describe("Vipps route handles report correctly", () => {
  before(() => {
    addStub = sinon
      .stub(DAO.donations, "add")
      //Returns donation ID
      .resolves(10);

    mailStub = sinon.stub(mail, "sendDonationReciept");

    historicStub = sinon.stub(DAO.distributions, "getHistoricPaypalSubscriptionKIDS");

    parsingRulesStub = sinon.stub(DAO.parsing, "getVippsParsingRules").resolves([]);
  });

  beforeEach(() => {
    sinon.resetHistory();
  });

  it("Adds donations to DB", async () => {
    await runVipps("Vipps April 2019");
    expect(addStub.callCount).to.be.equal(10);
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

  after(() => {
    sinon.restore();
  });
});

async function runPaypal(filename) {
  var res = {
    json: () => {},
  };
  const jsonStub = sinon.stub(res, "json");

  var query = {
    body: {
      metaOwnerID: 3,
    },
    files: {
      report: {
        data: readReport("paypal", filename),
      },
    },
  };

  await paypalroute(query, res, (ex) => {
    throw ex;
  });
}

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
