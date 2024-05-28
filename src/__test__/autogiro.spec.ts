import fs from "fs";
import { AutoGiroParser } from "../custom_modules/parsers/autogiro";
import { expect } from "chai";
import AutoGiroFileWriter from "../custom_modules/autogiro/filewriterutil";
import { DateTime } from "luxon";
import { AutoGiroPaymentStatusCode } from "../custom_modules/parsers/autogiro/transactions";
import { getSeBankingDaysBetweenDates } from "../custom_modules/autogiro";

describe("Autogiro parser", () => {
  it("Should parse a valid autogiro transactions file", () => {
    const data = fs.readFileSync("src/__test__/data/autogiro/paymentSpecification.txt", "latin1");
    const result = AutoGiroParser.parse(data);

    /**
     * Type guard to ensure that the result is a valid deposit report
     */
    if (!("deposits" in result) || !("withdrawals" in result) || !("refunds" in result)) {
      throw new Error("Expected a deposit object");
    }

    expect(result).to.have.property("deposits");

    for (const deposit of result.deposits) {
      const approvedPayments = deposit.payments.filter(
        (p) => p.paymentStatusCode === AutoGiroPaymentStatusCode.APPROVED,
      );
      expect(approvedPayments.length).to.equal(deposit.numberOfApprovedPayments);
      expect(deposit.approvedAmount).to.equal(
        approvedPayments.reduce((acc, curr) => acc + curr.amount, 0),
      );
    }

    expect(result).to.have.property("withdrawals");

    for (const withdrawal of result.withdrawals) {
      const approvedPayments = withdrawal.payments.filter(
        (p) => p.paymentStatusCode === AutoGiroPaymentStatusCode.APPROVED,
      );
      expect(approvedPayments.length).to.equal(withdrawal.numberOfApprovedPayments);
      expect(withdrawal.approvedAmount).to.equal(
        approvedPayments.reduce((acc, curr) => acc + curr.amount, 0),
      );
    }

    for (const refund of result.refunds) {
      /**
       * Note: The withdrawal record can apply to only one payment record.
       * See section 8.2.2 subheading "Withdrawal record for Payment refund (TK17)"
       * in the Autogiro technical specification.
       * https://www.bankgirot.se/globalassets/dokument/tekniska-manualer/directdebit_autogiro_technicalmanual_en.pdf
       */
      expect(refund.refunds.length).to.equal(1);
      expect(refund.approvedAmount).to.equal(refund.refunds[0].originalAmount);
    }
  });

  it("Should parse a valid autogiro mandates file", () => {
    const data = fs.readFileSync("src/__test__/data/autogiro/mandates.txt", "latin1");
    const result = AutoGiroParser.parse(data);

    /**
     * Type guard to ensure that the result is a valid mandate report
     */
    if (!("mandates" in result)) {
      throw new Error("Expected a mandate object");
    }

    expect(result).to.have.property("mandates");

    for (const mandate of result.mandates) {
      expect(mandate.payeeBankGiroNumber).to.equal("0052323524");
      expect(mandate.acceptedDate.day).to.equal(7);
      expect(mandate.acceptedDate.month).to.equal(8);
      expect(mandate.acceptedDate.year).to.equal(2023);
    }
  });

  it("Should parse a valid autogiro e-mandates file", () => {
    const data = fs.readFileSync("src/__test__/data/autogiro/e-mandates.txt", "latin1");
    const result = AutoGiroParser.parse(data);

    /**
     * Type guard to ensure that the result is a valid e-mandate report
     */
    if (!("emandates" in result)) {
      throw new Error("Expected an e-mandate object");
    }

    expect(result).to.have.property("emandates");

    expect(result.openingRecord.clearingNumber).to.equal("9900");

    for (const eMandate of result.emandates) {
      expect(eMandate.payeeBankGiroNumber).to.equal("0052323524");
    }
  });

  it("Should parse a valid autogiro amendment and cancellation file", () => {
    const data = fs.readFileSync(
      "src/__test__/data/autogiro/cancellationsamendments.txt",
      "latin1",
    );
    const result = AutoGiroParser.parse(data);

    /**
     * Type guard to ensure that the result is a valid e-mandate report
     */
    if (!("cancellations" in result)) {
      throw new Error("Expected an e-mandate object");
    }

    expect(result).to.have.property("cancellations");

    expect(result.cancellations.length).to.eq(2);

    expect(result.cancellations[0].commentCode).to.eq("12");
    expect(result.cancellations[1].commentCode).to.eq("12");
    expect(result.cancellations[0].reference).to.eq("119             ");
    expect(result.cancellations[1].reference).to.eq("255             ");
  });
});

describe("Autogiro file writer", () => {
  it("Should return a valid opening record", () => {
    const date = DateTime.fromObject({ year: 2016, month: 7, day: 13 });
    const record = AutoGiroFileWriter.getOpeningRecord(date, "471117", "0009902346");

    expect(record.length).to.equal(80);
    expect(record).to.equal(
      "0120160713AUTOGIRO                                            4711170009902346  ",
    );
  });

  it("Should return a valid withdrawal record", () => {
    const date = DateTime.fromObject({ year: 2016, month: 7, day: 14 });
    const record = AutoGiroFileWriter.getWithdrawalRecord(
      date,
      "123",
      "0009902346",
      75000,
      "INBETALNING1",
    );

    expect(record.length).to.equal(80);
    expect(record).to.equal(
      "82201607140    00000000000001230000000750000009902346INBETALNING1               ",
    );
  });

  describe.only("Banking days between two dates", () => {
    it("Should return 0 between two consecutive dates", () => {
      const start = DateTime.fromObject({ year: 2024, month: 6, day: 11 });
      const end = DateTime.fromObject({ year: 2016, month: 6, day: 12 });

      const days = getSeBankingDaysBetweenDates(start, end);

      expect(days).to.equal(0);
    });

    it("Should return 0 between two friday and monday over the weekend", () => {
      const start = DateTime.fromObject({ year: 2024, month: 6, day: 14 });
      const end = DateTime.fromObject({ year: 2024, month: 6, day: 17 });

      const days = getSeBankingDaysBetweenDates(start, end);

      expect(days).to.equal(0);
    });

    it("Should return 0 between the day before and the day after a holiday", () => {
      const start = DateTime.fromObject({ year: 2024, month: 6, day: 5 });
      // National day of Sweden is on the 6th of June
      const end = DateTime.fromObject({ year: 2024, month: 6, day: 7 });

      const days = getSeBankingDaysBetweenDates(start, end);

      expect(days).to.equal(0);
    });

    it("Should return 1 between a monday and a wednesday with no holidays in between", () => {
      const start = DateTime.fromObject({ year: 2024, month: 6, day: 12 });
      const end = DateTime.fromObject({ year: 2024, month: 6, day: 14 });

      const days = getSeBankingDaysBetweenDates(start, end);

      expect(days).to.equal(1);
    });

    it("Should return 1 between a friday and a tuesday", () => {
      const start = DateTime.fromObject({ year: 2024, month: 6, day: 14 });
      const end = DateTime.fromObject({ year: 2024, month: 6, day: 18 });

      const days = getSeBankingDaysBetweenDates(start, end);

      expect(days).to.equal(1);
    });

    it("Should return 5 over a regular week with no holidays", () => {
      const start = DateTime.fromObject({ year: 2024, month: 6, day: 23 }); // Sunday 23rd of June
      const end = DateTime.fromObject({ year: 2024, month: 6, day: 30 }); // Sunday 30th of June

      const days = getSeBankingDaysBetweenDates(start, end);

      expect(days).to.equal(5);
    });

    it("Should return the correct number when crossing a monthly boundary", () => {
      // 29th of April to 5th of May 2024
      const start = DateTime.fromObject({ year: 2024, month: 4, day: 29 });
      const end = DateTime.fromObject({ year: 2024, month: 5, day: 5 });

      const days = getSeBankingDaysBetweenDates(start, end);

      expect(days).to.equal(3);
    });

    it("Should return the correct number of days over new year", () => {
      // Saturday 30th of December 2023 to friday 5th of January 2024
      const start = DateTime.fromObject({ year: 2023, month: 12, day: 30 });
      const end = DateTime.fromObject({ year: 2024, month: 1, day: 5 });

      const days = getSeBankingDaysBetweenDates(start, end);

      expect(days).to.equal(3);
    });

    it("Should return correct number of days for spans over several months", () => {
      // 1st of May to 5th of August 2024
      const start = DateTime.fromObject({ year: 2024, month: 5, day: 1 });
      const end = DateTime.fromObject({ year: 2024, month: 8, day: 5 });

      const days = getSeBankingDaysBetweenDates(start, end);

      expect(days).to.equal(64);
    });
  });
});
