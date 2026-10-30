import { describe, it } from "vitest";
import * as chai from "chai";
import chaiDatetime from "chai-datetime";
import * as fs from "fs";
import moment from "moment";
import { parseReport as vippsParseReport } from "../custom_modules/parsers/vipps";
import { parseReport as bankParseReport } from "../custom_modules/parsers/bank";

const expect = chai.expect;
chai.use(chaiDatetime);

const reportType = {
  vipps: "vipps",
};

describe("Vipps CSV", () => {
  it("Parses vipps CSV with semicolon seperation", () => {
    const sample = readCSV(reportType.vipps, "Vipps April 2019");

    const data = vippsParseReport(sample);
    expect(data.transactions).to.be.length(15);
  });

  it("Parses the new Vipps details settlement CSV", () => {
    const sample = readCSV(reportType.vipps, "Vipps Details June 2026");

    const data = vippsParseReport(sample);
    expect(data.transactions).to.be.length(4);
    expect(data.minDate.getTime()).to.equal(moment.utc("2026-06-17").valueOf());
    expect(data.maxDate.getTime()).to.equal(moment.utc("2026-06-17").valueOf());

    expect(data.transactions[0]).to.include({
      location: "Gi Effektivt.",
      transactionID: "36173222624",
      amount: 15,
      name: "Ada Lovelace",
      message: "",
    });
    expect(data.transactions[0].date.isSame(moment.utc("2026-06-17"))).to.equal(true);
    expect(data.transactions[0].KID).to.equal(null);

    expect(data.transactions[1].KID).to.equal(62354782);
    expect(data.transactions[2].message).to.equal("Elvebakken innsamling");
    expect(data.transactions.some((transaction) => transaction.amount < 0)).to.equal(false);
  });
});

describe("Bank CSV", () => {
  it("Parses bank report correctly when downloaded from google drive", () => {
    let transactions = bankParseReport(readCSV("bank", "sampleReport"));

    expect(transactions[0].KID).to.be.equal(57967549);
    expect(transactions[6].date.isSame(moment.utc("02.01.2019", "DD.MM.YYYY"))).to.be.equal(true);
    expect(transactions[2].amount).to.be.equal(250.15);
    expect(transactions[4].transactionID).to.be.equal("1264");
  });
});

function readCSV(type, filename) {
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename.detect-non-literal-fs-filename -- test fixture file names are literals in this spec
  return fs.readFileSync(`src/__test__/data/${type}/${filename}.CSV`);
}
