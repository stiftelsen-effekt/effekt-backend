import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../custom_modules/DAO";
import paymentMethods from "../enums/paymentMethods";
import { utcDate } from "../custom_modules/utcDate";

const ocr = require("../custom_modules/ocr");

describe("OCR import links AvtaleGiro payments to charges", () => {
  const transaction = (overrides = {}) => ({
    KID: "002556289731589",
    paymentMethod: paymentMethods.avtalegiro,
    amount: 500,
    date: utcDate(2026, 10, 27),
    transactionID: "271026.123456789",
    ...overrides,
  });

  let addDonationStub: sinon.SinonStub;
  let openChargesStub: sinon.SinonStub;
  let markCompletedStub: sinon.SinonStub;

  beforeEach(() => {
    addDonationStub = sinon.stub(DAO.donations, "add").resolves(1234);
    openChargesStub = sinon.stub(DAO.avtalegirocharges, "getOpenChargesByKID");
    markCompletedStub = sinon.stub(DAO.avtalegirocharges, "markCompleted").resolves(true);
    sinon.stub(console, "log");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("links the payment to the charge for its due date", async () => {
    openChargesStub.resolves([
      { id: 7, dueDate: "2026-09-27" },
      { id: 9, dueDate: "2026-10-27" },
    ]);

    const result = await ocr.addDonation(transaction(), 3);

    expect(result).to.equal(1234);
    sinon.assert.calledOnceWithExactly(openChargesStub, "002556289731589");
    sinon.assert.calledOnceWithExactly(markCompletedStub, 9, 1234);
  });

  it("links a weekend due date paid on the next banking day", async () => {
    openChargesStub.resolves([{ id: 9, dueDate: "2026-10-24" }]);

    await ocr.addDonation(transaction({ date: utcDate(2026, 10, 26) }), 3);

    sinon.assert.calledOnceWithExactly(markCompletedStub, 9, 1234);
  });

  it("leaves the payment unlinked when no charge is close enough", async () => {
    openChargesStub.resolves([{ id: 7, dueDate: "2026-08-27" }]);

    const result = await ocr.addDonation(transaction(), 3);

    expect(result).to.equal(1234);
    expect(markCompletedStub.called).to.be.false;
  });

  it("leaves the payment unlinked when the KID has no open charges", async () => {
    openChargesStub.resolves([]);

    const result = await ocr.addDonation(transaction(), 3);

    expect(result).to.equal(1234);
    expect(markCompletedStub.called).to.be.false;
  });

  it("does not look for charges for bank transfers", async () => {
    await ocr.addDonation(transaction({ paymentMethod: paymentMethods.bank }), 3);

    expect(openChargesStub.called).to.be.false;
    expect(markCompletedStub.called).to.be.false;
  });

  it("does not look for charges when the donation already exists", async () => {
    addDonationStub.rejects(new Error("EXISTING_DONATION"));

    const result = await ocr.addDonation(transaction(), 3);

    expect(result).to.equal(-1);
    expect(openChargesStub.called).to.be.false;
  });

  it("still imports the donation when linking fails", async () => {
    openChargesStub.rejects(new Error("Database is down"));
    sinon.stub(console, "error");

    const result = await ocr.addDonation(transaction(), 3);

    expect(result).to.equal(1234);
    expect(markCompletedStub.called).to.be.false;
  });

  it("links every AvtaleGiro payment in a file", async () => {
    addDonationStub.onCall(0).resolves(1);
    addDonationStub.onCall(1).resolves(2);
    openChargesStub.withArgs("111").resolves([{ id: 11, dueDate: "2026-10-27" }]);
    openChargesStub.withArgs("222").resolves([{ id: 22, dueDate: "2026-10-27" }]);
    sinon.stub(ocr, "sendReciepts").resolves();

    const result = await ocr.addDonations(
      [transaction({ KID: "111" }), transaction({ KID: "222" })],
      3,
    );

    expect(result.valid).to.equal(2);
    sinon.assert.calledWithExactly(markCompletedStub, 11, 1);
    sinon.assert.calledWithExactly(markCompletedStub, 22, 2);
  });
});
