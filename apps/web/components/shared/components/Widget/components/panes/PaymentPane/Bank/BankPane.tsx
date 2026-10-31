import React, { useState, useEffect } from "react";
import { useDonationTotal, useWidgetSelector } from "../../../../store/store";
import { State } from "../../../../store/state";
import { PaymentInformation } from "./PaymentInformation";
import { Referrals } from "../../../shared/Referrals/Referrals";
import { BankPaymentMethod, WidgetPane3ReferralsProps } from "../../../../types/WidgetProps";
import { ANONYMOUS_DONOR } from "../../../../config/anonymous-donor";
import AnimateHeight from "react-animate-height";
import { usePlausible } from "next-plausible";
import { currencyForLocale } from "../../../../utils/currency";
import panes from "../../Panes.module.scss";
import payment from "../PaymentPane.module.scss";

export const BankPane: React.FC<{
  config: BankPaymentMethod;
  referrals: WidgetPane3ReferralsProps;
}> = ({ config, referrals }) => {
  const plausible = usePlausible();
  const donation = useWidgetSelector((state: State) => state.donation);
  const [hasCompletedTransaction, setHasCompletedTransaction] = useState(false);

  const totalSumIncludingTip = useDonationTotal();

  const currency = currencyForLocale(config.locale);

  useEffect(() => {
    if (hasCompletedTransaction && totalSumIncludingTip && donation.kid) {
      plausible("CompletedDonation", {
        revenue: {
          currency: currency,
          amount: totalSumIncludingTip,
        },
        props: {
          method: "bank",
          recurring: false,
          kid: donation.kid,
        },
      });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- tracks the completed donation once
  }, [hasCompletedTransaction]);

  return (
    <div className={panes.pane}>
      <div className={panes.paneContainer}>
        <div>
          <AnimateHeight height={hasCompletedTransaction ? 0 : "auto"}>
            <h2 className={panes.paneTitle}>{config.title}</h2>
            <PaymentInformation
              donation={donation}
              accountTitle={config.kontonr_title}
              kidTitle={config.kid_title}
              accountNr={config.kontonr}
            />
            <div className={payment.infoText}>{config.explanatory_text}</div>

            {donation.donor?.email !== ANONYMOUS_DONOR.email && donation.donor?.email && (
              <div className={payment.infoText}>
                {config.explanatory_text_email_template.replaceAll("{email}", donation.donor.email)}
              </div>
            )}

            <div className={payment.completeButtonWrapper}>
              <button
                className={payment.completeButton}
                onClick={() => {
                  if (config.completed_redirect && config.completed_redirect.slug) {
                    window.open(config.completed_redirect.slug, "_parent");
                  } else {
                    setHasCompletedTransaction(true);
                  }
                }}
              >
                {config.button_text}
              </button>
            </div>
          </AnimateHeight>
          <AnimateHeight height={hasCompletedTransaction ? "auto" : 0}>
            <h2 className={panes.paneTitle}>{config.completed_title}</h2>
            <div className={payment.infoText}>{config.completed_text}</div>
          </AnimateHeight>
        </div>

        {!(referrals.show_referrals === false) && (
          <Referrals
            text={{
              referrals_title: referrals.referrals_title,
              other_referral_input_placeholder: referrals.other_referral_input_placeholder,
            }}
          />
        )}
      </div>
    </div>
  );
};
