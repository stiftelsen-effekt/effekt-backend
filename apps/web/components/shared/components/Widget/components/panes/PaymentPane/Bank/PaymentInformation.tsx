import React from "react";
import { Donation } from "../../../../store/state";
import payment from "../PaymentPane.module.scss";

export const PaymentInformation: React.FC<{
  accountTitle: string;
  kidTitle: string;
  donation: Donation;
  accountNr: string;
}> = ({ donation, accountTitle, kidTitle, accountNr }) => {
  return (
    <>
      <div className={payment.roundedBorder}>
        <div className={payment.textWrapper}>
          <span>{accountTitle}</span>
          <span>{accountNr}</span>
        </div>
      </div>
      <div className={payment.roundedBorder}>
        <div className={payment.textWrapper}>
          <span>{kidTitle}</span>
          <span data-cy="kidNumber">{donation.kid}</span>
        </div>
      </div>
    </>
  );
};
