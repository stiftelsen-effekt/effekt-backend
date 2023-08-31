import fs from "fs";
import { AutoGiroParser, AutoGiroPaymentStatusCode } from "../custom_modules/parsers/autogiro";
import { expect } from "chai";

describe("Autogiro parser", () => {
  it("Should parse a valid autogiro file", () => {
    const data = fs.readFileSync("src/__test__/data/autogiro/paymentSpecification.txt", "utf8");
    console.log(data);
    const result = AutoGiroParser.parse(data);

    for (const deposit of result.deposits) {
      const approvedPayments = deposit.payments.filter(
        (p) => p.paymentStatusCode === AutoGiroPaymentStatusCode.APPROVED,
      );
      expect(approvedPayments.length).to.equal(deposit.numberOfApprovedPayments);
      expect(deposit.approvedAmount).to.equal(
        approvedPayments.reduce((acc, curr) => acc + curr.amount, 0),
      );
    }

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
});
