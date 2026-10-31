import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { setCauseAreaSelection, setGlobalOperationsEnabled } from "../../store/donation/actions";
import { nextPane } from "../../store/layout/actions";
import { State } from "../../store/state";
import { Spinner } from "../../../Spinner/Spinner";
import { CauseAreaDisplayConfig } from "../../types/WidgetProps";
import { usePrefilledCauseAreaIds } from "../hooks";
import panes from "./Panes.module.scss";
import styles from "./SelectionPane.module.scss";
import { getCauseAreaIconById, MultipleCauseAreaIcon } from "../shared/CauseAreaIcon/CauseAreaIcon";

/**
 * First pane: select one-time vs monthly, then choose a cause area or multiple.
 */
interface SelectionPaneProps {
  causeAreaDisplayConfig?: CauseAreaDisplayConfig;
  accentColor?: string;
}

const DEFAULT_ACCENT_COLOR = "var(--primary)";

export const SelectionPane: React.FC<SelectionPaneProps> = ({
  causeAreaDisplayConfig,
  accentColor,
}) => {
  const dispatch = useDispatch<any>();
  const causeAreas = useSelector((state: State) => state.layout.causeAreas);
  const prefilledCauseAreaIds = usePrefilledCauseAreaIds();
  const { operationsPercentageModeByCauseArea = {} } = useSelector(
    (state: State) => state.donation,
  );

  const onSelectArea = (id?: number) => {
    const selectionType = id && id != -1 ? "single" : "multiple";

    // Handle operations amount synchronization
    if (selectionType === "multiple") {
      // When switching to multiple cause areas, initialize the global toggle based on
      // whether any single cause area actually has the operations cut enabled - not
      // just whether it has a stored percentage, which defaults to a nonzero value
      // for every cause area regardless of whether the cut is enabled.
      const hasAnyOperationsEnabled = Object.values(operationsPercentageModeByCauseArea).some(
        (enabled) => enabled,
      );

      dispatch(setGlobalOperationsEnabled(hasAnyOperationsEnabled));
    }

    dispatch(setCauseAreaSelection(selectionType, id));
    dispatch(nextPane());
  };

  if (!causeAreas) {
    return (
      <div className={panes.pane}>
        <div className={panes.paneContainer}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
            }}
          >
            <Spinner />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={panes.pane}>
      <div className={panes.paneContainer}>
        <div>
          <h2 className={panes.paneTitle}>{causeAreaDisplayConfig?.cause_area_selection_title}</h2>

          <div className={styles.buttonsWrapper}>
            <button
              className={styles.causeAreaButton}
              key="default"
              onClick={() => onSelectArea(-1)}
              style={{
                background: accentColor || DEFAULT_ACCENT_COLOR,
                // Falling back to the outline color (var(--primary)) can mean a
                // light background depending on the widget's color scheme, so
                // match it with the theme's contrasting text color instead of
                // assuming white text works
                color: accentColor ? "white" : "var(--secondary)",
                border: "1px solid var(--primary)",
              }}
              data-cy="cause-area-recommendation"
            >
              {causeAreaDisplayConfig?.recommendation_button_text}
            </button>
          </div>

          <div className={styles.causeAreaButtonsDividerLine} />

          <div className={styles.buttonsWrapper}>
            {causeAreas
              .filter((ca) => ca.isActive || prefilledCauseAreaIds.has(ca.id))
              .filter((ca) => {
                const belowLineIds = causeAreaDisplayConfig?.below_line_cause_area_ids || [4, 5];
                return !belowLineIds.includes(ca.id); // Exclude below-line cause areas (e.g. operations, "andet")
              })
              .map((ca) => (
                <button
                  className={styles.causeAreaButton}
                  key={ca.id}
                  onClick={() => onSelectArea(ca.id)}
                  data-cy={`cause-area-${ca.id}`}
                >
                  {getCauseAreaIconById(ca.id)}
                  {ca.widgetDisplayName || ca.name}
                </button>
              ))}
            <button
              className={styles.causeAreaButton}
              onClick={() => onSelectArea(undefined)}
              style={{ marginTop: "20px" }}
              data-cy="cause-area-multiple"
            >
              <MultipleCauseAreaIcon />
              {causeAreaDisplayConfig?.multiple_cause_areas_button_text}
            </button>
          </div>

          <div className={styles.causeAreaButtonsDividerLine} />

          <div className={styles.buttonsWrapper}>
            {causeAreas
              .filter((ca) => ca.isActive || prefilledCauseAreaIds.has(ca.id))
              .filter((ca) => {
                const belowLineIds = causeAreaDisplayConfig?.below_line_cause_area_ids || [4, 5];
                return belowLineIds.includes(ca.id); // Include below-line cause areas (e.g. operations, "andet")
              })
              .map((ca) => (
                <button
                  className={styles.causeAreaButton}
                  key={ca.id}
                  onClick={() => onSelectArea(ca.id)}
                  data-cy={`cause-area-${ca.id}`}
                >
                  {getCauseAreaIconById(ca.id)}
                  {ca.widgetDisplayName || ca.name}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
