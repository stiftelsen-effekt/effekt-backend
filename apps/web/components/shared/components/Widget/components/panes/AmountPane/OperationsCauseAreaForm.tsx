import React from "react";
import { useWidgetDispatch } from "../../../store/store";
import { NumericFormat } from "react-number-format";

import { setCauseAreaAmount } from "../../../store/actions";
import { usePlausible } from "next-plausible";
import { EffektButton, EffektButtonVariant } from "../../../../EffektButton/EffektButton";
import { thousandize } from "../../../../../../../util/formatting";
import { CauseArea } from "../../../types/CauseArea";
import { CauseAreaDisplayConfig } from "../../../types/WidgetProps";
import { CauseAreaRollout } from "../../shared/CauseAreaRollout/CauseAreaRollout";
import styles from "../AmountPane.module.scss";
import { getCauseAreaIconById } from "../../shared/CauseAreaIcon/CauseAreaIcon";

interface OperationsCauseAreaFormProps {
  causeArea: CauseArea;
  suggestedSums: Array<{ amount: number; subtext?: string }>;
  causeAreaAmounts: Record<number, number>;
  causeAreaDisplayConfig: CauseAreaDisplayConfig;
}

export const OperationsCauseAreaForm: React.FC<OperationsCauseAreaFormProps> = ({
  causeArea,
  suggestedSums,
  causeAreaAmounts,
  causeAreaDisplayConfig,
}) => {
  const dispatch = useWidgetDispatch();
  const plausible = usePlausible();

  return (
    <div className={styles.formWrapper}>
      <div>
        <div className={styles.causeAreaTitle}>
          {getCauseAreaIconById(causeArea.id)}
          {causeArea.widgetDisplayName || causeArea.name}
        </div>
        <div className={styles.causeAreaContext}>
          {getCauseAreaContext(causeArea.id, causeAreaDisplayConfig)}
        </div>
      </div>
      <div>
        <div className={styles.totalSumWrapper}>
          <div className={styles.sumButtonsWrapper}>
            {suggestedSums.map((suggested) => (
              <div key={suggested.amount}>
                <EffektButton
                  variant={EffektButtonVariant.SECONDARY}
                  selected={causeAreaAmounts[causeArea.id] === suggested.amount}
                  onClick={() => {
                    plausible("SelectSuggestedSum", { props: { sum: suggested.amount } });
                    dispatch(setCauseAreaAmount(causeArea.id, suggested.amount));
                  }}
                  noMinWidth={true}
                >{`${suggested.amount ? thousandize(suggested.amount) : "-"} kr`}</EffektButton>
                {suggested.subtext && <i>{suggested.subtext}</i>}
              </div>
            ))}
          </div>
          <div className={styles.sumWrapper}>
            <span>
              <NumericFormat
                name="sum-operations"
                type="tel"
                placeholder="0"
                thousandSeparator=" "
                value={causeAreaAmounts[causeArea.id] > 0 ? causeAreaAmounts[causeArea.id] : ""}
                autoComplete="off"
                data-cy="donation-sum-input-operations"
                onValueChange={(values, sourceInfo) => {
                  // react-number-format also fires this on mount/reformat, not just on
                  // real keystrokes - only a genuine user edit should overwrite the amount.
                  if (sourceInfo.source !== "event") return;
                  const v = values.floatValue === undefined ? 0 : values.floatValue;
                  dispatch(setCauseAreaAmount(causeArea.id, v));
                }}
                allowNegative={false}
                decimalScale={0}
              />
            </span>
          </div>
        </div>
      </div>
      <CauseAreaRollout causeAreaId={causeArea.id} config={causeAreaDisplayConfig} />
    </div>
  );
};

const getCauseAreaContext = (id: number, config?: CauseAreaDisplayConfig) => {
  const context = config?.cause_area_contexts?.find((c) => c.cause_area_id === id);
  return context?.context_text || null;
};
