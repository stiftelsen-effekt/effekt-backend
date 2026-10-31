import React from "react";
import { useWidgetDispatch, useWidgetSelector } from "../../../store/store";
import { NumericFormat } from "react-number-format";
import { usePlausible } from "next-plausible";
import { PortableText } from "@portabletext/react";
import AnimateHeight from "react-animate-height";

import { NextButton } from "../../shared/Buttons/NavigationButtons";
import { ToolTip } from "../../shared/ToolTip/ToolTip";
import { Spinner } from "../../../../Spinner/Spinner";
import { RadioButtonGroup } from "../../../../RadioButton/RadioButtonGroup";
import { EffektButton, EffektButtonVariant } from "../../../../EffektButton/EffektButton";
import { State } from "../../../store/state";
import { RecurringDonation, ShareType } from "../../../types/Enums";
import {
  setRecurring,
  setCauseAreaAmount,
  setOrgAmount,
  setCauseAreaDistributionType,
  setShowAllOrganizations,
  setHasManuallyEditedPrefilledOrgAmount,
  nextPane,
} from "../../../store/actions";
import { thousandize } from "../../../../../../../util/formatting";
import { useAmountCalculation } from "../AmountPane/useAmountCalculation";
import { AmountContext, SmartDistributionContext } from "../../../types/WidgetProps";
import { useIsMobile } from "../../../../../../../hooks/useIsMobile";
import { splitAmountByShares, standardShareByOrgId } from "../../../utils/donationCalculations";
import panes from "../Panes.module.scss";
import styles from "./SingleCauseAreaPane.module.scss";

interface SingleCauseAreaPaneProps {
  nextButtonText: string;
  enableRecurring: boolean;
  enableSingle: boolean;
  singleDonationText: string;
  monthlyDonationText: string;
  amountContext: AmountContext;
  smartDistributionContext: SmartDistributionContext;
}

/**
 * Amount pane used when a platform has a single (active) cause area, e.g. Norway.
 *
 * It reproduces the pre-rewrite ("main") widget experience — recurring toggle,
 * suggested sums, a smart/custom distribution selector with an explanatory
 * description — using main's markup and styling, but is driven by the rewritten
 * donation state. The one thing carried over from the new widget is that custom
 * organization distribution is entered as direct kroner amounts rather than
 * percentages. Operations/tip is intentionally omitted to match the old widget.
 */
export const SingleCauseAreaPane: React.FC<SingleCauseAreaPaneProps> = ({
  nextButtonText,
  enableRecurring,
  enableSingle,
  singleDonationText,
  monthlyDonationText,
  amountContext,
  smartDistributionContext,
}) => {
  const dispatch = useWidgetDispatch();
  const plausible = usePlausible();
  const isMobile = useIsMobile();

  const causeAreas = useWidgetSelector((state: State) => state.layout.causeAreas);
  const {
    recurring,
    causeAreaAmounts = {},
    orgAmounts = {},
    causeAreaDistributionType = {},
    prefilledShares = null,
    showAllOrganizations = false,
    hasManuallyEditedPrefilledOrgAmount = false,
  } = useWidgetSelector((state: State) => state.donation);

  const activeCauseAreas = causeAreas?.filter((ca) => ca.isActive) ?? [];
  const causeArea = activeCauseAreas[0];

  const { totalAmount } = useAmountCalculation("single", causeArea?.id ?? null, causeAreas ?? []);

  const currentAmount = causeArea ? causeAreaAmounts[causeArea.id] || 0 : 0;
  // setAmount stores the entered amount verbatim in the store, so the input reads it from there.
  const inputValue = currentAmount;
  const [showErrors, setShowErrors] = React.useState(false);

  // While one or more organizations are prefilled (e.g. arriving from the organizations list -
  // one org at 100% - or a CMS-configured distribution link with several) and the donor hasn't
  // edited any of them yet, each keeps tracking its percentage share of the cause area amount -
  // so typing a sum afterwards still splits it the same way. The tracked amounts are only
  // derived for display; they're committed to orgAmounts (for the actual payload) once the
  // donor moves on, to avoid a dispatch/re-render race while typing. This state lives in the widget store
  // (not local component state) because panes unmount/remount when navigating.
  const hasPrefilledOrgs = !!prefilledShares && Object.keys(prefilledShares).length > 0;
  const isTrackingPrefilledShares = hasPrefilledOrgs && !hasManuallyEditedPrefilledOrgAmount;
  const trackedOrgAmounts =
    isTrackingPrefilledShares && prefilledShares
      ? splitAmountByShares(currentAmount, prefilledShares)
      : {};
  const displayOrgAmount = (orgId: number) => {
    if (isTrackingPrefilledShares && prefilledShares?.[orgId] !== undefined) {
      return trackedOrgAmounts[orgId] ?? 0;
    }
    return orgAmounts[orgId] || 0;
  };
  // totalAmount is derived from orgAmounts while in custom mode, which hasn't been synced yet
  // for still-tracking prefilled organizations - currentAmount is the real intended total then.
  const effectiveTotalAmount = isTrackingPrefilledShares ? currentAmount : totalAmount;

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

  if (!causeArea) {
    return (
      <div className={panes.pane}>
        <div className={panes.paneContainer}>
          <div>Missing cause area</div>
        </div>
      </div>
    );
  }

  const activeOrganizations = causeArea.organizations
    .filter((org) => org.isActive)
    .sort((a, b) => a.ordering - b.ordering);
  const hasMultipleOrgs = activeOrganizations.length > 1;
  const distributionType = causeAreaDistributionType[causeArea.id] ?? ShareType.STANDARD;
  // Once the donor enters per-organization amounts themselves those are the total (see
  // effectiveTotalAmount), so the cause area sum above would be a stale, silently ignored
  // field - hide it, matching CauseAreaForm in the multiple-cause-area widget. A prefilled
  // distribution keeps the sum for as long as it's still tracking: custom was picked for the
  // donor (not by them), so the sum - with its suggested amounts - is their amount entry, and
  // the prefilled shares just split it. Editing one of those amounts freezes the tracking,
  // and from then on the sum is stale here too.
  const hideAmountInput =
    hasMultipleOrgs &&
    distributionType === ShareType.CUSTOM &&
    (!hasPrefilledOrgs || hasManuallyEditedPrefilledOrgAmount);

  const suggestedSums = recurring
    ? amountContext.preset_amounts_recurring
    : amountContext.preset_amounts_single;

  const setAmount = (amount: number) => {
    dispatch(setCauseAreaAmount(causeArea.id, amount));
    // With a single organization the cause area amount is the organization amount.
    if (activeOrganizations.length <= 1 && activeOrganizations[0]) {
      dispatch(setOrgAmount(activeOrganizations[0].id, amount));
    }
  };

  const handleDistributionChange = (value: ShareType) => {
    dispatch(setCauseAreaDistributionType(causeArea.id, value));

    // When switching to custom, seed the per-organization amounts from the
    // standard split so the user has a sensible starting point.
    if (value === ShareType.CUSTOM) {
      const hasSetOrgAmounts = activeOrganizations.some((org) => (orgAmounts[org.id] || 0) > 0);
      if (!hasSetOrgAmounts) {
        const amountByOrgId = splitAmountByShares(
          causeAreaAmounts[causeArea.id] || 0,
          standardShareByOrgId(causeArea),
        );
        for (const org of causeArea.organizations) {
          if (!org.standardShare) continue;
          dispatch(setOrgAmount(org.id, amountByOrgId[org.id] ?? 0));
        }
      }
    }
  };

  const amountInput = (
    <>
      <div className={styles.sumButtonsWrapper}>
        {suggestedSums.map((suggested) => (
          <div key={suggested.amount}>
            <EffektButton
              variant={EffektButtonVariant.SECONDARY}
              selected={inputValue === suggested.amount}
              onClick={() => {
                plausible("SelectSuggestedSum", { props: { sum: suggested.amount } });
                setAmount(suggested.amount);
              }}
              noMinWidth={true}
              data-cy={`suggested-sum-${causeArea.id}-${suggested.amount}`}
            >{`${suggested.amount ? thousandize(suggested.amount) : "-"} kr`}</EffektButton>
            {suggested.subtext && <i>{suggested.subtext}</i>}
          </div>
        ))}
      </div>
      <div className={styles.sumWrapper}>
        <label>{amountContext.custom_amount_text}</label>
        <span>
          <NumericFormat
            name={`sum-${causeArea.id}`}
            thousandSeparator=" "
            allowNegative={false}
            decimalScale={0}
            type="tel"
            placeholder="0"
            value={inputValue > 0 ? inputValue : ""}
            autoComplete="off"
            data-cy={`donation-sum-input-${causeArea.id}`}
            onValueChange={(values) => setAmount(values.floatValue ?? 0)}
          />
        </span>
      </div>
    </>
  );

  return (
    <div className={panes.pane}>
      <div className={panes.paneContainer}>
        <div>
          <h2 className={panes.paneTitle}>
            <wbr />
          </h2>

          <RadioButtonGroup
            options={[
              {
                title: singleDonationText,
                value: RecurringDonation.NON_RECURRING,
                data_cy: "radio-single",
                disabled: !enableSingle,
              },
              {
                title: monthlyDonationText,
                value: RecurringDonation.RECURRING,
                data_cy: "radio-recurring",
                disabled: !enableRecurring,
              },
            ]}
            selected={recurring}
            onSelect={(value) => dispatch(setRecurring(value as RecurringDonation))}
          />

          <AnimateHeight height={hideAmountInput ? 0 : "auto"} animateOpacity duration={300}>
            <div
              className={
                hasMultipleOrgs
                  ? styles.amountInputSection
                  : `${styles.amountInputSection} ${styles.amountInputSectionPadBottom}`
              }
            >
              {amountInput}
            </div>
          </AnimateHeight>

          {hasMultipleOrgs && (
            <div className={styles.shareSelectionSpacer}>
              <RadioButtonGroup
                options={[
                  {
                    title: smartDistributionContext.smart_distribution_radiobutton_text,
                    value: ShareType.STANDARD,
                    data_cy: "radio-smart-share",
                  },
                  {
                    title: smartDistributionContext.custom_distribution_radiobutton_text,
                    value: ShareType.CUSTOM,
                    data_cy: "radio-custom-share",
                  },
                ]}
                selected={distributionType}
                onSelect={(value) => handleDistributionChange(value as ShareType)}
              />

              <AnimateHeight
                height={
                  distributionType === ShareType.STANDARD &&
                  smartDistributionContext.smart_distribution_description
                    ? "auto"
                    : 0
                }
                animateOpacity
                duration={300}
              >
                <div className={styles.infoParagraph}>
                  {smartDistributionContext.smart_distribution_description && (
                    <PortableText value={smartDistributionContext.smart_distribution_description} />
                  )}
                </div>
              </AnimateHeight>

              <AnimateHeight
                height={distributionType === ShareType.CUSTOM ? "auto" : 0}
                animateOpacity
                duration={300}
              >
                <div className={styles.sharesSelectorContainer}>
                  <div className={styles.shareSelectionWrapper}>
                    <div className={styles.shareContainer}>
                      {(hasPrefilledOrgs && !showAllOrganizations
                        ? activeOrganizations.filter(
                            (org) => prefilledShares?.[org.id] !== undefined,
                          )
                        : activeOrganizations
                      ).map((org) => (
                        <div className={styles.shareInputContainer} key={org.id}>
                          <div>
                            <a
                              className={styles.shareLink}
                              href={org.informationUrl}
                              target={isMobile ? "_blank" : undefined}
                              rel={isMobile ? "noopener noreferrer" : undefined}
                            >
                              {org.widgetDisplayName || org.name}
                            </a>
                            {org.widgetContext && <ToolTip text={org.widgetContext} />}
                          </div>
                          <NumericFormat
                            id={`org-${org.id}`}
                            aria-label={org.widgetDisplayName || org.name}
                            type="tel"
                            placeholder="0"
                            value={displayOrgAmount(org.id) || ""}
                            step={1}
                            decimalScale={0}
                            allowNegative={false}
                            thousandSeparator=" "
                            autoComplete="off"
                            data-cy={`org-${org.id}`}
                            onValueChange={(values, sourceInfo) => {
                              // react-number-format also fires this when `value` changes because
                              // of the auto-tracking prop above, not just on real keystrokes -
                              // only a genuine user edit should freeze the auto-tracked amount.
                              if (sourceInfo.source !== "event") return;
                              // Only editing one of the actually-tracked (prefilled) organizations
                              // should freeze tracking - editing an unrelated one (after revealing
                              // "show all") shouldn't erase the still-tracked prefilled amounts.
                              if (prefilledShares?.[org.id] !== undefined) {
                                dispatch(setHasManuallyEditedPrefilledOrgAmount(true));
                              }
                              dispatch(setOrgAmount(org.id, values.floatValue ?? 0));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    {hasPrefilledOrgs && !showAllOrganizations && (
                      <button
                        className={styles.showAllOrganizationsLink}
                        type="button"
                        onClick={() => dispatch(setShowAllOrganizations(true))}
                        data-cy="show-all-organizations-button"
                      >
                        {smartDistributionContext.show_all_organizations_text} ↓
                      </button>
                    )}
                  </div>
                </div>
              </AnimateHeight>
            </div>
          )}
        </div>

        <div className={styles.actionBar}>
          <NextButton
            // Matches the pre-rewrite behavior: don't dim the button just
            // because no amount has been entered yet - only after the donor
            // has actually tried to proceed with an invalid amount
            disabled={showErrors && effectiveTotalAmount <= 0}
            onClick={() => {
              if (effectiveTotalAmount <= 0) {
                setShowErrors(true);
                return;
              }
              if (isTrackingPrefilledShares && prefilledShares) {
                Object.keys(prefilledShares).forEach((orgId) => {
                  dispatch(setOrgAmount(Number(orgId), trackedOrgAmounts[Number(orgId)] ?? 0));
                });
              }
              dispatch(nextPane());
            }}
            data-cy="next-button"
          >
            {nextButtonText}
          </NextButton>
        </div>
      </div>
    </div>
  );
};
