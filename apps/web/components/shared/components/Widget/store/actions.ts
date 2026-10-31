import { CauseArea } from "../types/CauseArea";
import { PaymentMethod, RecurringDonation, ShareType } from "../types/Enums";
import { ReferralData, ReferralType } from "../types/Temp";
import { Donation, DonorFormDraft, VippsAgreement } from "./state";

/** What widget.registerDonation (or the Danish REST route) answers */
export type RegisterDonationResponse = {
  KID: string;
  /** Only from the Danish backend */
  donorID?: number;
  /** Only from our backend: sent with the follow-up calls for this registration */
  registrationToken?: string | null;
  hasAnsweredReferral: boolean;
  paymentProviderUrl: string;
};

export type OperationsConfigState = NonNullable<Donation["operationsConfig"]>;

export type DonorInfo = {
  name: string;
  email: string;
  taxDeduction: boolean;
  ssn: string;
  newsletter: boolean;
};

/** Every change to the widget's state (see reducer.ts) */
export type WidgetAction =
  // Layout
  | { type: "setPaneNumber"; paneNumber: number }
  | { type: "nextPane" }
  | { type: "prevPane" }
  | { type: "setLoading"; loading: boolean }
  | { type: "causeAreasLoaded"; causeAreas: CauseArea[] }
  // Referrals ("how did you hear about us")
  | { type: "referralTypesLoaded"; referralTypes: ReferralType[] }
  | { type: "selectReferral"; ref: ReferralData }
  | { type: "setOtherText"; text: string }
  // Donation
  | { type: "registered"; result: RegisterDonationResponse }
  | { type: "selectPaymentMethod"; method: PaymentMethod }
  | { type: "submitDonorInfo"; donor: DonorInfo }
  | { type: "setDueDay"; day: number }
  | { type: "setRecurring"; recurring: RecurringDonation }
  | { type: "setPaymentProviderURL"; url: string }
  | { type: "setVippsAgreement"; vippsAgreement: VippsAgreement }
  | { type: "setCauseAreaSelection"; selectionType: "single" | "multiple"; causeAreaId?: number }
  | { type: "setCauseAreaAmount"; causeAreaId: number; amount: number }
  | { type: "setCauseAreaDistributionType"; causeAreaId: number; distributionType: ShareType }
  | { type: "setOrgAmount"; orgId: number; amount: number }
  | { type: "setSmartDistributionTotal"; smartDistributionTotal: number }
  | { type: "setGlobalOperationsEnabled"; enabled: boolean }
  | {
      type: "setOperationsPercentageModeByCauseArea";
      causeAreaId: number;
      isPercentageMode: boolean;
    }
  | { type: "setGlobalOperationsPercentage"; percentage: number }
  | { type: "setOperationsPercentageByCauseArea"; causeAreaId: number; percentage: number }
  | { type: "setOperationsConfig"; config: OperationsConfigState }
  | { type: "setApiError"; message: string | null }
  | { type: "clearApiError" }
  | { type: "setPrefilledShares"; shares: Record<number, number> | null }
  | { type: "setShowAllOrganizations"; show: boolean }
  | { type: "setHasManuallyEditedPrefilledOrgAmount"; edited: boolean }
  | { type: "setReferralCode"; referralCode?: string }
  | { type: "setDonorFormDraft"; draft: DonorFormDraft };

// Action creators, so call sites read as before: dispatch(setOrgAmount(id, amount))

export const setPaneNumber = (paneNumber: number): WidgetAction => ({
  type: "setPaneNumber",
  paneNumber,
});
export const nextPane = (): WidgetAction => ({ type: "nextPane" });
export const prevPane = (): WidgetAction => ({ type: "prevPane" });
export const setLoading = (loading: boolean): WidgetAction => ({ type: "setLoading", loading });

export const selectReferral = (ref: ReferralData): WidgetAction => ({
  type: "selectReferral",
  ref,
});
export const setOtherText = (text: string): WidgetAction => ({ type: "setOtherText", text });

export const selectPaymentMethod = (method: PaymentMethod): WidgetAction => ({
  type: "selectPaymentMethod",
  method,
});
export const submitDonorInfo = (donor: DonorInfo): WidgetAction => ({
  type: "submitDonorInfo",
  donor,
});
export const setDueDay = (day: number): WidgetAction => ({ type: "setDueDay", day });
/** Also clears the payment method, which depends on it */
export const setRecurring = (recurring: RecurringDonation): WidgetAction => ({
  type: "setRecurring",
  recurring,
});
export const setPaymentProviderURL = (url: string): WidgetAction => ({
  type: "setPaymentProviderURL",
  url,
});
export const setVippsAgreement = (vippsAgreement: VippsAgreement): WidgetAction => ({
  type: "setVippsAgreement",
  vippsAgreement,
});
/** Donate to one cause area ('single', with its id; -1 is smart distribution) or several */
export const setCauseAreaSelection = (
  selectionType: "single" | "multiple",
  causeAreaId?: number,
): WidgetAction => ({ type: "setCauseAreaSelection", selectionType, causeAreaId });
/** The amount entered for a cause area (kr) */
export const setCauseAreaAmount = (causeAreaId: number, amount: number): WidgetAction => ({
  type: "setCauseAreaAmount",
  causeAreaId,
  amount,
});
export const setCauseAreaDistributionType = (
  causeAreaId: number,
  distributionType: ShareType,
): WidgetAction => ({ type: "setCauseAreaDistributionType", causeAreaId, distributionType });
/** The amount entered for an organization (kr), when splitting a cause area by hand */
export const setOrgAmount = (orgId: number, amount: number): WidgetAction => ({
  type: "setOrgAmount",
  orgId,
  amount,
});
export const setSmartDistributionTotal = (smartDistributionTotal: number): WidgetAction => ({
  type: "setSmartDistributionTotal",
  smartDistributionTotal,
});
/** The operations cut (tip) across all cause areas, in multiple cause area mode */
export const setGlobalOperationsEnabled = (enabled: boolean): WidgetAction => ({
  type: "setGlobalOperationsEnabled",
  enabled,
});
/** Whether a cause area gets the operations cut (tip) */
export const setOperationsPercentageModeByCauseArea = (
  causeAreaId: number,
  isPercentageMode: boolean,
): WidgetAction => ({
  type: "setOperationsPercentageModeByCauseArea",
  causeAreaId,
  isPercentageMode,
});
export const setGlobalOperationsPercentage = (percentage: number): WidgetAction => ({
  type: "setGlobalOperationsPercentage",
  percentage,
});
export const setOperationsPercentageByCauseArea = (
  causeAreaId: number,
  percentage: number,
): WidgetAction => ({ type: "setOperationsPercentageByCauseArea", causeAreaId, percentage });
export const setOperationsConfig = (config: OperationsConfigState): WidgetAction => ({
  type: "setOperationsConfig",
  config,
});
/** null shows the widget's generic error message */
export const setApiError = (message: string | null): WidgetAction => ({
  type: "setApiError",
  message,
});
export const clearApiError = (): WidgetAction => ({ type: "clearApiError" });
/**
 * Organization shares (0-100) prefilled from an entry point (the organizations list, or a
 * distribution link from Sanity), or null to clear them
 */
export const setPrefilledShares = (shares: Record<number, number> | null): WidgetAction => ({
  type: "setPrefilledShares",
  shares,
});
export const setShowAllOrganizations = (show: boolean): WidgetAction => ({
  type: "setShowAllOrganizations",
  show,
});
export const setHasManuallyEditedPrefilledOrgAmount = (edited: boolean): WidgetAction => ({
  type: "setHasManuallyEditedPrefilledOrgAmount",
  edited,
});
/** A campaign/matching referral code (from the donor pane or ?referral=), or undefined to clear it */
export const setReferralCode = (referralCode?: string): WidgetAction => ({
  type: "setReferralCode",
  referralCode,
});
export const setDonorFormDraft = (draft: DonorFormDraft): WidgetAction => ({
  type: "setDonorFormDraft",
  draft,
});
