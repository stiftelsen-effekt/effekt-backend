import React, { useEffect, useRef } from "react";
import { useWidgetSelector, useWidgetStore } from "../../../store/store";
import { submitReferral } from "../../../store/flows";
import { EffektButton, EffektButtonVariant } from "../../../../EffektButton/EffektButton";
import { selectReferral, setOtherText } from "../../../store/actions";
import { State } from "../../../store/state";
import { ReferralData } from "../../../types/Temp";
import { WidgetPane3ReferralsProps } from "../../../types/WidgetProps";
import { widgetAsksForReferrals } from "../../../store/widgetApi";
import panes from "../../panes/Panes.module.scss";
import styles from "./Referrals.module.scss";

// The "other" answer is saved once the donor pauses typing, not on every keystroke
const OTHER_TEXT_DEBOUNCE_MS = 600;

const OTHER_REFERRAL_ID = 10;

export const Referrals: React.FC<{ text: WidgetPane3ReferralsProps }> = ({ text }) => {
  const store = useWidgetStore();
  const { dispatch } = store;

  const referrals = useWidgetSelector((state: State) => state.referrals.referrals);
  const selectedReferrals = useWidgetSelector((state: State) => state.referrals.selectedReferrals);
  const otherText = useWidgetSelector((state: State) => state.referrals.otherText);

  const pendingOtherText = useRef<{ timer: ReturnType<typeof setTimeout>; text: string } | null>(
    null,
  );
  const submitOtherText = React.useCallback(
    (value: string) => {
      void submitReferral(
        store,
        value.trim() !== ""
          ? { referralID: OTHER_REFERRAL_ID, active: true, comment: value }
          : { referralID: OTHER_REFERRAL_ID, active: false },
      );
    },
    [store],
  );
  // Save what the donor typed if they leave before the debounce fires
  useEffect(
    () => () => {
      if (pendingOtherText.current) {
        clearTimeout(pendingOtherText.current.timer);
        submitOtherText(pendingOtherText.current.text);
      }
    },
    [submitOtherText],
  );

  // The Danish backend has nowhere to record the answer
  if (!widgetAsksForReferrals()) return null;

  return (
    <div>
      <div
        style={{
          position: "relative",
          left: "-40px",
          marginTop: "1.5rem",
          paddingBottom: "0.5rem",
        }}
      >
        <svg height="2" width="576" style={{ position: "absolute", left: "0", top: "0" }}>
          <g fill="none" stroke="currentcolor" strokeWidth="1">
            <path strokeDasharray="12,12" strokeDashoffset="6" d="M0 1 l576 0" />
          </g>
          Sorry, your browser does not support inline SVG.
        </svg>
      </div>
      <h2 className={panes.paneTitle}>{text.referrals_title}</h2>
      <div className={styles.buttonsWrapper}>
        {referrals
          ?.filter((ref) => ref.id !== OTHER_REFERRAL_ID)
          .map((ref) => (
            <EffektButton
              squared
              variant={EffektButtonVariant.SECONDARY}
              cy={`referral-button-${ref.id}`}
              key={ref.id}
              selected={selectedReferrals.includes(ref.id)}
              useCheckmark={true}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                if (selectedReferrals.includes(ref.id)) {
                  const refData: ReferralData = {
                    referralID: ref.id,
                    active: false,
                  };
                  dispatch(selectReferral(refData));
                  void submitReferral(store, refData);
                } else {
                  const refData: ReferralData = {
                    referralID: ref.id,
                    active: true,
                  };
                  dispatch(selectReferral(refData));
                  void submitReferral(store, refData);
                }

                e.currentTarget.blur();
              }}
            >
              {ref.name}
            </EffektButton>
          ))}
      </div>
      <input
        className={styles.textInput}
        data-cy="referral-text-input"
        type="text"
        placeholder={text.other_referral_input_placeholder}
        value={otherText}
        onChange={(e) => {
          const value = e.currentTarget.value;
          dispatch(setOtherText(value));
          if (pendingOtherText.current) clearTimeout(pendingOtherText.current.timer);
          pendingOtherText.current = {
            text: value,
            timer: setTimeout(() => {
              pendingOtherText.current = null;
              submitOtherText(value);
            }, OTHER_TEXT_DEBOUNCE_MS),
          };
        }}
      />
    </div>
  );
};
