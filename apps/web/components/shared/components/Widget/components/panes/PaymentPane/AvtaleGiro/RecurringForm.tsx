import React from "react";
import { useWidgetSelector, useWidgetStore } from "../../../../store/store";
import { Donation, State } from "../../../../store/state";
import { draftAvtaleGiro } from "../../../../store/flows";
import { API_URL } from "../../../../config/api";
import {
  AVTALEGIRO_COMPANY_ACCOUNT_NO,
  AVTALEGIRO_COMPANY_NAME,
  AVTALEGIRO_FORM_URL,
  AVTALEGIRO_MIN_AMOUNT_LIMIT,
} from "../../../../config/avtalegiro";
import { SubmitButton } from "../../../shared/Buttons/NavigationButtons";
import { usePlausible } from "next-plausible";
import { calculateDonationBreakdown } from "../../../../utils/donationCalculations";

export const RecurringBankDonationForm: React.FC<{
  donation: Donation;
  buttonText: string;
}> = ({ donation, buttonText }) => {
  const store = useWidgetStore();
  const plausible = usePlausible();

  const causeAreas = useWidgetSelector((state: State) => state.layout.causeAreas) || [];

  const breakdown = calculateDonationBreakdown(
    donation.causeAreaAmounts ?? {},
    donation.orgAmounts ?? {},
    donation.causeAreaDistributionType ?? {},
    donation.operationsPercentageModeByCauseArea ?? {},
    donation.operationsPercentageByCauseArea ?? {},
    causeAreas,
    donation.selectionType ?? "single",
    donation.selectedCauseAreaId ?? 1,
    donation.globalOperationsEnabled ?? false,
    donation.globalOperationsPercentage ?? 0,
    donation.operationsConfig?.excludedCauseAreaIds ?? [],
    donation.operationsConfig?.operationsCauseAreaId,
    donation.smartDistributionTotal,
  );
  const totalSumIncludingTip = breakdown.totalAmount;

  const onSubmit = (e: React.MouseEvent<Element, MouseEvent>) => {
    plausible("DraftAvtalegiro");
    e.preventDefault();
    void draftAvtaleGiro(store);
  };

  return (
    <div>
      <form
        data-cy="avtalegiro-form"
        id="avtalegiro-form"
        action={AVTALEGIRO_FORM_URL}
        method="post"
        target="_parent"
        style={{ paddingBottom: 30, display: "flex", justifyContent: "center" }}
      >
        <input type="hidden" name="companyName" id="companyName" value={AVTALEGIRO_COMPANY_NAME} />
        <input
          type="hidden"
          name="companyAccountNo"
          id="companyAccountNo"
          value={AVTALEGIRO_COMPANY_ACCOUNT_NO}
        />
        <input type="hidden" name="kid" id="kid" value={donation.kid} />
        <input
          type="hidden"
          name="amountLimit"
          id="amountLimit"
          value={
            totalSumIncludingTip && totalSumIncludingTip > AVTALEGIRO_MIN_AMOUNT_LIMIT
              ? totalSumIncludingTip
              : AVTALEGIRO_MIN_AMOUNT_LIMIT
          }
        />
        <input
          type="hidden"
          name="returnUrl"
          id="returnUrl"
          value={`${API_URL}/avtalegiro/${donation.kid}/redirect`}
        />
        <input type="hidden" name="notificationDisabled" id="notificationDisabled" value="false" />
        <SubmitButton onClick={(e) => onSubmit(e)}>{buttonText}</SubmitButton>
      </form>
    </div>
  );
};
