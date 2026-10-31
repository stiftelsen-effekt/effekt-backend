import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import AnimateHeight from "react-animate-height";
import { X, AlertCircle } from "react-feather";
import { State } from "../../../store/state";
import { clearApiError } from "../../../store/donation/actions";
import { Dispatch } from "@reduxjs/toolkit";
import { DonationActionTypes } from "../../../store/donation/types";
import styles from "./ApiErrorNotification.module.scss";

export const ApiErrorNotification: React.FC<{ genericErrorMessage?: string }> = ({
  genericErrorMessage = "Something went wrong, please try again later.",
}) => {
  const dispatch = useDispatch<Dispatch<DonationActionTypes>>();
  const apiError = useSelector((state: State) => state.donation.apiError);
  const [isVisible, setIsVisible] = useState(typeof apiError !== "undefined");
  // Kept in state (not derived) so the last message stays on screen during the exit animation
  const [message, setMessage] = useState<string | null>(apiError ?? null);

  // Show/hide whenever apiError changes, adjusting state during render rather than in an
  // effect: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevApiError, setPrevApiError] = useState(apiError);
  if (apiError !== prevApiError) {
    setPrevApiError(apiError);
    if (typeof apiError !== "undefined") {
      setMessage(apiError);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }

  const handleClose = () => {
    setIsVisible(false);
    // Add a small delay before clearing the error to allow exit animation
    setTimeout(() => {
      dispatch(clearApiError());
    }, 250);
  };

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        handleClose();
      }, 8000);

      return () => clearTimeout(timer);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the timer restarts only when the notification shows
  }, [isVisible]);

  return (
    <AnimateHeight height={isVisible ? "auto" : 0} duration={300} animateOpacity>
      <div className={styles.wrapper} data-cy="api-error-notification">
        <div className={styles.content}>
          <div className={styles.icon}>
            <AlertCircle size={24} />
          </div>
          <div className={styles.message}>{message || genericErrorMessage}</div>
          <button
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Close notification"
          >
            <X size={24} />
          </button>
        </div>
      </div>
    </AnimateHeight>
  );
};
