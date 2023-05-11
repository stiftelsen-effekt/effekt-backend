import * as chai from "chai";
import chaiDatetime from "chai-datetime";
import * as fs from "fs";
import moment from "moment";
import { parseReport as paypalParseReport } from "../custom_modules/parsers/paypal";
import { parseReport as vippsParseReport } from "../custom_modules/parsers/vipps";
import { parseReport as bankParseReport } from "../custom_modules/parsers/bank";

const expect = chai.expect;
chai.use(chaiDatetime);

const reportType = {
  vipps: "vipps",
  paypal: "paypal",
};

describe("Paypal CSV", () => {
  it('Parses paypal CSV with comma seperation and "', () => {
    const sample = readCSV(reportType.paypal, "Paypal April 2019");

    let transactions = paypalParseReport(sample);
    expect(transactions).to.be.length(9);
  });

  it('Parses paypal CSV with semicolon seperation and "', () => {
    const sample = readCSV(reportType.paypal, "Paypal April 2019 - Semicolon");

    let transactions = paypalParseReport(sample);
    expect(transactions).to.be.length(9);
  });

  it('Parses paypal CSV with semicolon seperation and without "', () => {
    const sample = readCSV(reportType.paypal, "Paypal April 2019 - Semicolon Stripped");

    let transactions = paypalParseReport(sample);
    expect(transactions).to.be.length(9);
  });

  it('Parses paypal CSV with semicolon seperation and without " with . comma seperator', () => {
    const sample = readCSV(reportType.paypal, "Paypal April 2019 - Semicolon Stripped Dot");

    let transactions = paypalParseReport(sample);
    expect(transactions).to.be.length(9);
  });

  it("Parses problematic paypal CSV for september", () => {
    const sample = readCSV(reportType.paypal, "Paypal Special");

    let transactions = paypalParseReport(sample);
    expect(transactions).to.be.length(6);
  });

  it("Parses problematic paypal CSV for october", () => {
    const sample = readCSV(reportType.paypal, "Effekt PayPal oktober");

    let transactions = paypalParseReport(sample);
    expect(transactions).to.be.length(2);
  });
});

describe("Vipps CSV", () => {
  it("Parses vipps CSV with semicolon seperation", () => {
    const sample = readCSV(reportType.vipps, "Vipps April 2019");

    const data = vippsParseReport(sample);
    let transactions = data !== false ? data.transactions : [];
    expect(transactions).to.be.length(15);
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
  return fs.readFileSync(`src/__test__/data/${type}/${filename}.CSV`);
}
