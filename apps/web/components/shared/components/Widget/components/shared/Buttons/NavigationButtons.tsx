import React from "react";
import { useSelector } from "react-redux";
import { LoadingButtonSpinner } from "../../../../Spinner/LoadingButtonSpinner";
import { State } from "../../../store/state";
import { EffektButton } from "../../../../EffektButton/EffektButton";
import styles from "./NavigationButtons.module.scss";

/**
 * While a request is in flight the button shows a spinner and ignores clicks, so a second
 * click can't start a second registration or agreement draft.
 */
const useLoadingGuard = (onClick: React.ButtonHTMLAttributes<HTMLButtonElement>["onClick"]) => {
  const loading = useSelector((state: State) => state.layout.loading);
  const guardedOnClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (loading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return { loading, guardedOnClick };
};

export const NextButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  onClick,
  ...props
}) => {
  const { loading, guardedOnClick } = useLoadingGuard(onClick);

  return (
    <EffektButton
      {...props}
      className={styles.button}
      onClick={guardedOnClick}
      aria-busy={loading || undefined}
    >
      {loading ? <LoadingButtonSpinner /> : children}
    </EffektButton>
  );
};

export const SubmitButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  onClick,
  ...props
}) => {
  const { loading, guardedOnClick } = useLoadingGuard(onClick);

  return (
    <EffektButton
      {...props}
      className={styles.button}
      onClick={guardedOnClick}
      aria-busy={loading || undefined}
    >
      {loading ? <LoadingButtonSpinner /> : children}
    </EffektButton>
  );
};
