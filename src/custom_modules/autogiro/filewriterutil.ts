/**
 * AutoGiro payment specification parser
 * Based on the technical specification found here:
 * https://www.bankgirot.se/globalassets/dokument/tekniska-manualer/directdebit_autogiro_technicalmanual_en.pdf
 * See section 7
 * "Record and file descriptions – files to Bankgirot"
 */

import { AutoGiro_agreement_charges } from "@prisma/client";
import { DateTime } from "luxon";
import config from "../../config";

/* Example file:
0120160713AUTOGIRO                                            4711170009902346  
82201607140    00000000000001010000000750000009902346INBETALNING1               
82201607140    00000000000001020000000250500009902346INBETALNING2               
82201608315006 00000000000001030000001100000009902346INBETALNING3               
82201608316003 00000000022221010000005000250009902346INBETALNING4               
82GENAST  0    00000000033310220000000350000009902346INBETALNING5               
32201607140    00000000077710140000000125000009902346UTBETALN1                  
32201607140    00000000000001040000000325000009902346UTBETALN2                  
32201607140    00000000000001050000000030000009902346UTBETALN3                  
32201607140    00000000055510040000000030000009902346UTBETALN4       
*/

export default {
  getOpeningRecord: (date: DateTime, customerNumber: string, bankgiroNumber: string) => {
    return `01${date.toFormat(
      "yyyyLLdd",
    )}AUTOGIRO                                            ${customerNumber.padStart(
      6,
      "0",
    )}${bankgiroNumber.padStart(10, "0")}  `;
  },
  getWithdrawalRecord: (
    date: DateTime,
    donorId: number,
    bankgiroNumber: string,
    paymentAmount: number,
    paymentReference: string,
  ) => {
    /**
     * Note: It's possible to specify recurring payments with a single record.
     * E.g. keep withdrawing on a specific date until cancelled.
     * The reason we're only working with single withdrawals here, is because
     * it's difficult to change the amount of a recurring payment. You have to
     * cancel the old one and create a new one. This is unecessary complexity
     * that we don't want to deal with, since we already have a robust system
     * for doing the necessary logic in the AvtaleGiro module.
     */
    return `${AutoGiroPaymentCodes.INCOMMING}${date.toFormat("yyyyLLdd")}0    ${donorId
      .toString()
      .padStart(16, "0")}${paymentAmount.toString().padStart(12, "0")}${bankgiroNumber.padStart(
      10,
      "0",
    )}${paymentReference.padEnd(16, " ")}           `;
  },
  getCancellationRecord: (charge: AutoGiro_agreement_charges, donorId: number) => {
    if (charge.status !== "PENDING") throw new Error("Can only cancel pending charges");

    /**
     * The charge ID is used as a payment reference
     * Donor ID is the payer number
     */
    const cancellationDate = DateTime.fromJSDate(charge.claim_date).toFormat("yyyyLLdd");
    return `${
      AutoGiroCancellationRecordCode.CANCEL_ALL_FOR_PAYMENT_DATE_AMOUNT_AND_REFERENCE
    }${config.autogiro_bankgiro_number.padStart(10, "0")}${donorId
      .toString()
      .padStart(16, "0")}${cancellationDate}${charge.amount.toString().padStart(12, "0")}${
      AutoGiroPaymentCodes.INCOMMING
    }        ${charge.ID.toString().padEnd(16, " ")}      `;
  },
  /*
    getMandateApprovalRecord: (mandate: ) => {
        return `04${config.autogiro_bankgiro_number.padStart(10, "0")}${donorId.toString().padStart(16, "0")}${mandateDate.toFormat("yyyyLLdd")} `;
    }
    */
};

enum AutoGiroCancellationRecordCode {
  CANCEL_ALL_FOR_PAYER_NUMBER = 23,
  CANCEL_ALL_FOR_PAYMENT_DATE = 24,
  CANCEL_ALL_FOR_PAYMENT_DATE_AMOUNT_AND_REFERENCE = 25,
}

enum AutoGiroPaymentCodes {
  INCOMMING = 82,
  OUTGOING = 32,
}
