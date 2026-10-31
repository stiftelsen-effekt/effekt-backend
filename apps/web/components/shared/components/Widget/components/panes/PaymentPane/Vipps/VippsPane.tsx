import React, { useState } from "react";
import { useWidgetSelector, useWidgetStore } from "../../../../store/store";
import { draftVippsAgreement } from "../../../../store/flows";
import { RadioButtonGroup } from "../../../../../RadioButton/RadioButtonGroup";
import { Referrals } from "../../../shared/Referrals/Referrals";
import { setVippsAgreement } from "../../../../store/actions";
import { State } from "../../../../store/state";
import { RecurringDonation } from "../../../../types/Enums";
import { SubmitButton } from "../../../shared/Buttons/NavigationButtons";
import { VippsDatePicker } from "./VippsDatePicker/VippsDatePicker";
import { VippsPaymentMethod, WidgetPane3ReferralsProps } from "../../../../types/WidgetProps";
import { usePlausible } from "next-plausible";
import panes from "../../Panes.module.scss";
import payment from "../PaymentPane.module.scss";

export const VippsPane: React.FC<{
  referrals: WidgetPane3ReferralsProps;
  config: VippsPaymentMethod;
}> = ({ referrals, config }) => {
  const store = useWidgetStore();
  const { dispatch } = store;
  const donationState = useWidgetSelector((state: State) => state.donation);
  const { paymentProviderURL, recurring, vippsAgreement } = donationState;
  const [chooseChargeDay, setChooseChargeDay] = useState(0);
  const plausible = usePlausible();

  return (
    <div className={panes.pane}>
      <div className={panes.paneContainer}>
        {recurring === RecurringDonation.RECURRING && (
          <>
            <div>
              <h2 className={panes.paneTitle}>{config.recurring_title}</h2>
              <div style={{ paddingTop: 20, marginBottom: 30 }}>
                <RadioButtonGroup
                  options={[
                    { title: config.recurring_selector_earliest_text, value: 0 },
                    { title: config.recurring_selector_choose_date_text, value: 1 },
                  ]}
                  selected={chooseChargeDay}
                  onSelect={(option: number) => {
                    setChooseChargeDay(option);
                    if (vippsAgreement) {
                      dispatch(
                        setVippsAgreement({
                          ...vippsAgreement,
                          initialCharge: option === 0,
                        }),
                      );
                    }
                  }}
                />
              </div>
              {chooseChargeDay === 1 && (
                <VippsDatePicker config={config.recurring_selector_date_picker_configuration} />
              )}
            </div>
            <div className={panes.centerDiv}>
              <div data-cy="vipps-recurring-button" style={{ marginBottom: 30 }}>
                <SubmitButton
                  onClick={async () => {
                    if (recurring === RecurringDonation.RECURRING) {
                      plausible("DraftVippsRecurringAgreement");
                      void draftVippsAgreement(store);
                    }
                    (document.activeElement as HTMLElement).blur();
                  }}
                >
                  {config.recurring_button_text}
                </SubmitButton>
              </div>
            </div>
          </>
        )}
        {recurring === RecurringDonation.NON_RECURRING && (
          <>
            <div>
              <h2 className={panes.paneTitle}>{config.single_title}</h2>
            </div>
            <div className={panes.centerDiv}>
              <div className={payment.vippsButtonWrapper} data-cy="vipps-single-button">
                <SubmitButton
                  onClick={async () => {
                    plausible("InitiateSingleVippsPayment");
                    if (recurring === RecurringDonation.NON_RECURRING && paymentProviderURL) {
                      window.location.href = paymentProviderURL;
                    }
                    (document.activeElement as HTMLElement).blur();
                  }}
                >
                  {config.single_button_text}
                </SubmitButton>
              </div>
            </div>
          </>
        )}

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
