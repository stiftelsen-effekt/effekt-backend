import React, { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { EffektButton, EffektButtonVariant } from "../../../../EffektButton/EffektButton";
import {
  selectReferralAction,
  setOtherText,
  submitReferralAction,
} from "../../../store/referrals/actions";
import { State } from "../../../store/state";
import { ReferralData } from "../../../types/Temp";
import { WidgetPane3ReferralsProps } from "../../../types/WidgetProps";
import { ReferralActionTypes } from "../../../store/referrals/types";
import { Action } from "typescript-fsa";
import { Dispatch } from "@reduxjs/toolkit";
import { widgetAsksForReferrals } from "../../../store/widgetApi";
import panes from "../../panes/Panes.module.scss";
import styles from "./Referrals.module.scss";

// The "other" answer is saved once the donor pauses typing, not on every keystroke
const OTHER_TEXT_DEBOUNCE_MS = 600;

const OTHER_REFERRAL_ID = 10;

export const Referrals: React.FC<{ text: WidgetPane3ReferralsProps }> = ({ text }) => {
  const dispatch = useDispatch<Dispatch<ReferralActionTypes | Action<ReferralData>>>();

  const referrals = useSelector((state: State) => state.referrals.referrals);
  const selectedReferrals = useSelector((state: State) => state.referrals.selectedReferrals);
  const otherText = useSelector((state: State) => state.referrals.otherText);

  const pendingOtherText = useRef<{ timer: ReturnType<typeof setTimeout>; text: string } | null>(
    null,
  );
  const submitOtherText = React.useCallback(
    (value: string) => {
      dispatch(
        submitReferralAction.started(
          value.trim() !== ""
            ? { referralID: OTHER_REFERRAL_ID, active: true, comment: value }
            : { referralID: OTHER_REFERRAL_ID, active: false },
        ),
      );
    },
    [dispatch],
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
                  dispatch(selectReferralAction(refData));
                  dispatch(submitReferralAction.started(refData));
                } else {
                  const refData: ReferralData = {
                    referralID: ref.id,
                    active: true,
                  };
                  dispatch(selectReferralAction(refData));
                  dispatch(submitReferralAction.started(refData));
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
