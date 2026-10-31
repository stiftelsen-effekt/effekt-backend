import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { NumericFormat } from "react-number-format";
import { State } from "../../../store/state";
import {
  setGlobalOperationsEnabled,
  setGlobalOperationsPercentage,
  setOperationsPercentageModeByCauseArea,
} from "../../../store/donation/actions";
import { CustomCheckBox } from "../DonorPane/CustomCheckBox";
import { OperationsConfig } from "../../../types/WidgetProps";
import { splitOperationsLabelTemplate } from "../../../utils/operationsLabel";
import styles from "../AmountPane.module.scss";
import forms from "../Forms.module.scss";

interface GlobalCutToggleProps {
  operationsConfig?: OperationsConfig;
}

export const GlobalCutToggle: React.FC<GlobalCutToggleProps> = ({ operationsConfig }) => {
  const dispatch = useDispatch<any>();
  const {
    globalOperationsEnabled = false,
    globalOperationsPercentage = 5,
    operationsConfig: stateConfig,
  } = useSelector((state: State) => state.donation);
  const causeAreas = useSelector((state: State) => state.layout.causeAreas) ?? [];

  // Use config from props if available, otherwise from state
  // Not used: the label template below reads only the prop. CauseAreaForm reads it from
  // `config`, so this probably should too.
  // oxlint-disable-next-line no-unused-vars -- kept to flag the likely mismatch
  const config = operationsConfig || stateConfig;
  const { prefix: operationsLabelPrefix, suffix: operationsLabelSuffix } =
    splitOperationsLabelTemplate(operationsConfig?.operations_label_template);

  // Explicitly toggling the global cut applies it to every eligible cause area -
  // otherwise a donor who only meant to turn it off/on globally would still see
  // individual cause areas retain whatever they defaulted/were set to before.
  const handleGlobalCutToggle = (checked: boolean) => {
    dispatch(setGlobalOperationsEnabled(checked));
    causeAreas
      .filter(
        (area) =>
          area.id !== stateConfig?.operationsCauseAreaId &&
          !stateConfig?.excludedCauseAreaIds?.includes(area.id),
      )
      .forEach((area) => dispatch(setOperationsPercentageModeByCauseArea(area.id, checked)));
  };

  const handlePercentageChange = (
    values: { floatValue: number | undefined },
    sourceInfo: { source: string },
  ) => {
    // react-number-format also fires this when `value` changes because the default
    // percentage prop mounts/updates, not just on real keystrokes.
    if (sourceInfo.source !== "event") return;
    const v = values.floatValue === undefined ? 0 : values.floatValue;
    // Limit percentage to 0-100
    const limitedPercentage = Math.min(Math.max(v, 0), 100);
    dispatch(setGlobalOperationsPercentage(limitedPercentage));
  };

  return (
    <div
      style={{
        marginTop: "20px",
        marginBottom: "20px",
        padding: "15px",
        border: "1px solid var(--primary)",
        borderRadius: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div className={forms.checkBoxWrapper}>
          <input
            className={forms.hiddenCheckBox}
            type="checkbox"
            checked={globalOperationsEnabled}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleGlobalCutToggle(e.target.checked)
            }
            data-cy={`global-cut-checkbox`}
          />
          <CustomCheckBox checked={globalOperationsEnabled} label="" />
        </div>
        <div className={styles.operationsPercentageInputWrapper}>
          {operationsLabelPrefix && <span>{operationsLabelPrefix}</span>}
          <span>
            <NumericFormat
              name={`global-percentage-cut`}
              allowNegative={false}
              decimalScale={1}
              max={100}
              type="tel"
              placeholder="5"
              value={globalOperationsPercentage}
              autoComplete="off"
              data-cy={`global-percentage-cut-input`}
              onValueChange={handlePercentageChange}
              // Matches the per-cause-area cut input: editing a percentage that isn't
              // being applied would be misleading
              disabled={!globalOperationsEnabled}
            />
          </span>
          {operationsLabelSuffix && <span>{operationsLabelSuffix}</span>}
        </div>
      </div>
    </div>
  );
};
