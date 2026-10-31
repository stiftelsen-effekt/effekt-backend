import React, { useContext } from "react";
import { useWidgetDispatch, useWidgetSelector } from "../../../store/store";
import { WidgetContext } from "../../../../../../main/layout/layout";
import { prevPane } from "../../../store/actions";
import { State } from "../../../store/state";
import styles from "./ProgressBar.module.scss";

export const ProgressBar: React.FC<{ inline?: boolean; numberOfPanes?: number }> = ({
  inline,
  numberOfPanes = 4,
}) => {
  const dispatch = useWidgetDispatch();
  const paneNumber = useWidgetSelector((state: State) => state.layout.paneNumber);
  const [widgetContext, setWidgetContext] = useContext(WidgetContext);
  // The payment pane keeps its back button so donors can correct a mistake. Going back after
  // a bank donation is registered only leaves an unused KID behind.
  const hideBackButton = paneNumber === 0;

  const points = [];
  for (let i = 0; i < numberOfPanes; i++) {
    points.push(
      <div
        key={i}
        className={paneNumber >= i ? `${styles.circle} ${styles.circleFilled}` : styles.circle}
      />,
    );
  }

  return (
    <div className={styles.header}>
      <button
        data-cy="back-button"
        disabled={hideBackButton}
        className={
          hideBackButton
            ? `${styles.actionButton} ${styles.actionButtonHidden}`
            : styles.actionButton
        }
        onClick={(e) => {
          dispatch(prevPane());
          e.currentTarget.blur();
        }}
      >
        ←
      </button>
      <div className={styles.progress}>
        {points.map((p) => p)}
        <div className={styles.line} />
      </div>
      {!inline && (
        <button
          className={styles.actionButton}
          data-cy="close-widget"
          onClick={(e) => {
            setWidgetContext({ ...widgetContext, open: false });
            e.currentTarget.blur();
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};
