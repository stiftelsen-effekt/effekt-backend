import React from "react";
import { useWidgetSelector } from "../../../../store/store";
import { State } from "../../../../store/state";
import { Referrals } from "../../../shared/Referrals/Referrals";
import {
  QuickPayCardPaymentMethod,
  QuickPayMobilePayPaymentMethod,
  WidgetPane3ReferralsProps,
} from "../../../../types/WidgetProps";
import { EffektButton } from "../../../../../EffektButton/EffektButton";
import panes from "../../Panes.module.scss";

export const QuickPayPane: React.FC<{
  config: QuickPayCardPaymentMethod | QuickPayMobilePayPaymentMethod;
  referrals: WidgetPane3ReferralsProps;
}> = ({ config, referrals }) => {
  const donation = useWidgetSelector((state: State) => state.donation);
  const { paymentProviderURL, recurring } = donation;

  return (
    <div className={panes.pane}>
      <div className={panes.paneContainer}>
        <h2 className={panes.paneTitle}>QuickPay</h2>

        <EffektButton
          onClick={() => {
            if (paymentProviderURL) {
              window.location.href = paymentProviderURL;
            }
          }}
        >
          {recurring ? config.recurring_button_text : config.single_button_text}
        </EffektButton>

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
