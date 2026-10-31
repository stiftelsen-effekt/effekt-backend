import React from "react";
import { useWidgetDispatch, useWidgetSelector } from "../../../store/store";
import { NextButton } from "../../shared/Buttons/NavigationButtons";
import { State } from "../../../store/state";
import { setRecurring, nextPane } from "../../../store/actions";
import { RecurringDonation } from "../../../types/Enums";
import {
  AmountContext,
  OperationsConfig,
  CauseAreaDisplayConfig,
  UILabels,
  SmartDistributionContext,
} from "../../../types/WidgetProps";
import { CauseAreaForm } from "./CauseAreaForm";
import { SmartDistributionForm } from "./SmartDistributionForm";
import { OperationsCauseAreaForm } from "./OperationsCauseAreaForm";
import { GlobalCutToggle } from "./GlobalCutToggle";
import { useAmountCalculation } from "./useAmountCalculation";
import { thousandize } from "../../../../../../../util/formatting";
import { RadioButtonGroup } from "../../../../RadioButton/RadioButtonGroup";
import { usePrefilledCauseAreaIds } from "../../hooks";
import panes from "../Panes.module.scss";
import styles from "../AmountPane.module.scss";

interface AmountPaneProps {
  nextButtonText: string;
  smartDistContext: SmartDistributionContext;
  text: { single_donation_text: string; monthly_donation_text: string };
  enableRecurring: boolean;
  enableSingle: boolean;
  amountContext: AmountContext;
  operationsConfig?: OperationsConfig;
  causeAreaDisplayConfig?: CauseAreaDisplayConfig;
  uiLabels?: UILabels;
}

export const AmountPane: React.FC<AmountPaneProps> = ({
  nextButtonText,
  smartDistContext,
  text,
  enableRecurring,
  enableSingle,
  amountContext,
  operationsConfig,
  causeAreaDisplayConfig,
  uiLabels,
}) => {
  const dispatch = useWidgetDispatch();
  const { selectionType, selectedCauseAreaId, recurring, smartDistributionTotal } =
    useWidgetSelector((state: State) => state.donation);
  const causeAreas = useWidgetSelector((state: State) => state.layout.causeAreas) || [];
  const prefilledCauseAreaIds = usePrefilledCauseAreaIds();

  const { totalAmount, causeAreaAmounts, orgAmounts, causeAreaDistributionType } =
    useAmountCalculation(selectionType || "single", selectedCauseAreaId || null, causeAreas);

  const handleNext = () => {
    dispatch(nextPane());
  };

  // Determine the effective total for next button enable/disable logic
  const effectiveTotal = selectedCauseAreaId === -1 ? smartDistributionTotal || 0 : totalAmount;

  const suggestedSums = recurring
    ? amountContext.preset_amounts_recurring
    : amountContext.preset_amounts_single;

  // For single cause area
  const selectedCA = causeAreas.find((c) => c.id === selectedCauseAreaId);

  if (!causeAreaDisplayConfig) return <span>Missing cause area display config</span>;

  return (
    <div className={panes.pane}>
      <div className={panes.paneContainer}>
        <div>
          <div className={styles.recurringSelectionWrapper}>
            <RadioButtonGroup
              options={[
                {
                  title: text.single_donation_text,
                  value: RecurringDonation.NON_RECURRING,
                  disabled: !enableSingle,
                  data_cy: "single-donation-radio",
                },
                {
                  title: text.monthly_donation_text,
                  value: RecurringDonation.RECURRING,
                  disabled: !enableRecurring,
                  data_cy: "recurring-donation-radio",
                },
              ]}
              selected={recurring}
              onSelect={(val: RecurringDonation) => dispatch(setRecurring(val))}
            />
          </div>

          <div className={styles.causeAreasWrapper}>
            {/* For multiple cause areas */}
            {selectionType === "multiple" && selectedCauseAreaId !== -1 && (
              <>
                <SmartDistributionForm
                  suggestedSums={suggestedSums}
                  totalAmount={totalAmount}
                  causeAreas={causeAreas}
                  causeAreaAmounts={causeAreaAmounts}
                  causeAreaDistributionType={causeAreaDistributionType}
                  smartDistributionContext={smartDistContext}
                  causeAreaDisplayConfig={causeAreaDisplayConfig}
                />
                {causeAreas
                  .filter((ca) => ca.isActive || prefilledCauseAreaIds.has(ca.id))
                  .filter(
                    (ca) => !causeAreaDisplayConfig?.below_line_cause_area_ids?.includes(ca.id),
                  )
                  .map((ca) => (
                    <CauseAreaForm
                      key={ca.id}
                      causeArea={ca}
                      isSingleSelection={false}
                      suggestedSums={suggestedSums}
                      causeAreaAmounts={causeAreaAmounts}
                      orgAmounts={orgAmounts}
                      causeAreaDistributionType={causeAreaDistributionType}
                      showOperationsOption={false}
                      operationsConfig={operationsConfig}
                      causeAreaDisplayConfig={causeAreaDisplayConfig}
                      smartDistributionContext={smartDistContext}
                    />
                  ))}
                <GlobalCutToggle operationsConfig={operationsConfig} />
                <div className={styles.totalAmountWrapper} data-cy="total-amount-wrapper">
                  <div>{uiLabels?.total_label}</div>
                  <div>{thousandize(totalAmount)} kr</div>
                </div>
              </>
            )}

            {/* For single cause area */}
            {selectionType === "single" && selectedCA && (
              <>
                {selectedCA.id === operationsConfig?.operations_cause_area_id ? (
                  <OperationsCauseAreaForm
                    causeArea={selectedCA}
                    suggestedSums={suggestedSums}
                    causeAreaAmounts={causeAreaAmounts}
                    causeAreaDisplayConfig={causeAreaDisplayConfig}
                  />
                ) : (
                  <>
                    <CauseAreaForm
                      causeArea={selectedCA}
                      isSingleSelection={true}
                      suggestedSums={suggestedSums}
                      causeAreaAmounts={causeAreaAmounts}
                      orgAmounts={orgAmounts}
                      causeAreaDistributionType={causeAreaDistributionType}
                      showOperationsOption={
                        !operationsConfig?.excluded_cause_area_ids?.includes(selectedCA.id)
                      }
                      operationsConfig={operationsConfig}
                      causeAreaDisplayConfig={causeAreaDisplayConfig}
                      smartDistributionContext={smartDistContext}
                    />
                  </>
                )}
              </>
            )}

            {selectedCauseAreaId === -1 && (
              <>
                <SmartDistributionForm
                  suggestedSums={suggestedSums}
                  totalAmount={totalAmount}
                  causeAreas={causeAreas}
                  causeAreaAmounts={causeAreaAmounts}
                  causeAreaDistributionType={causeAreaDistributionType}
                  smartDistributionContext={smartDistContext}
                  causeAreaDisplayConfig={causeAreaDisplayConfig}
                />
                <GlobalCutToggle operationsConfig={operationsConfig} />
              </>
            )}
          </div>
        </div>

        <div className={styles.actionBar}>
          <NextButton disabled={effectiveTotal <= 0} onClick={handleNext} data-cy="next-button">
            {nextButtonText}
          </NextButton>
        </div>
      </div>
    </div>
  );
};
