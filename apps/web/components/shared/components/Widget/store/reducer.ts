import { getEarliestPossibleChargeDate } from "../components/panes/PaymentPane/AvtaleGiro/AvtaleGiroDatePicker/avtalegirodates";
import { CauseArea } from "../types/CauseArea";
import { RecurringDonation, ShareType } from "../types/Enums";
import { WidgetAction } from "./actions";
import { Donation, Layout, Referrals, State } from "./state";

/** One per page load: referral answers from every widget on the page share it */
const WEBSITE_SESSION = new Date().getTime().toString();

export const createInitialState = (): State => {
  const today = new Date().getDate();
  return {
    donation: {
      recurring: RecurringDonation.NON_RECURRING,
      donor: {
        taxDeduction: false,
        newsletter: false,
      },
      dueDay: getEarliestPossibleChargeDate(),
      globalOperationsEnabled: false,
      vippsAgreement: {
        initialCharge: true,
        monthlyChargeDay: today <= 28 ? today : 0,
      },
    },
    layout: {
      paneNumber: 0,
      loading: false,
    },
    referrals: {
      websiteSession: WEBSITE_SESSION,
      selectedReferrals: [],
      otherText: "",
    },
  };
};

/** Sets up the distribution and the default selection once the cause areas have loaded */
const donationWithCauseAreas = (donation: Donation, areas: CauseArea[]): Donation => {
  const config = donation.operationsConfig;
  return {
    ...donation,
    // Default to the first cause area, unless something (a prefill) chose already
    selectionType: donation.selectionType ?? (areas.length > 0 ? "single" : undefined),
    selectedCauseAreaId:
      donation.selectedCauseAreaId ?? (areas.length > 0 ? areas[0].id : undefined),
    causeAreaDistributionType: Object.fromEntries(
      areas.map((area) => [area.id, ShareType.STANDARD]),
    ),
    operationsPercentageModeByCauseArea: config
      ? Object.fromEntries(
          areas.map((area) => {
            // The operations cause area itself never gets a tip on top of itself, whatever
            // excludedCauseAreaIds says
            const isExcluded =
              area.id === config.operationsCauseAreaId ||
              config.excludedCauseAreaIds.includes(area.id);
            return [area.id, !isExcluded && config.enabledByDefaultSingle];
          }),
        )
      : {},
    operationsPercentageByCauseArea: config
      ? Object.fromEntries(areas.map((area) => [area.id, config.defaultPercentage]))
      : {},
    globalOperationsEnabled: config?.enabledByDefaultGlobal ?? false,
    globalOperationsPercentage: config?.defaultPercentage,
  };
};

const donationReducer = (state: Donation, action: WidgetAction): Donation => {
  switch (action.type) {
    case "causeAreasLoaded":
      return donationWithCauseAreas(state, action.causeAreas);
    case "registered":
      return {
        ...state,
        kid: action.result.KID,
        registrationToken: action.result.registrationToken ?? undefined,
        paymentProviderURL: action.result.paymentProviderUrl,
        donor: { ...state.donor, donorID: action.result.donorID },
      };
    case "setCauseAreaSelection":
      // Amounts and the operations choice are kept, so the donor can switch back and forth
      return {
        ...state,
        selectionType: action.selectionType,
        selectedCauseAreaId: action.causeAreaId,
        causeAreaAmounts: state.causeAreaAmounts ?? {},
        globalOperationsEnabled: state.globalOperationsEnabled || false,
      };
    case "setCauseAreaAmount":
      return {
        ...state,
        causeAreaAmounts: { ...state.causeAreaAmounts, [action.causeAreaId]: action.amount },
      };
    case "setCauseAreaDistributionType":
      return {
        ...state,
        causeAreaDistributionType: {
          ...state.causeAreaDistributionType,
          [action.causeAreaId]: action.distributionType,
        },
      };
    case "setOrgAmount":
      return { ...state, orgAmounts: { ...state.orgAmounts, [action.orgId]: action.amount } };
    case "setPrefilledShares":
      return {
        ...state,
        prefilledShares: action.shares,
        showAllOrganizations: false,
        hasManuallyEditedPrefilledOrgAmount: false,
      };
    case "setShowAllOrganizations":
      return { ...state, showAllOrganizations: action.show };
    case "setHasManuallyEditedPrefilledOrgAmount":
      return { ...state, hasManuallyEditedPrefilledOrgAmount: action.edited };
    case "setReferralCode":
      return { ...state, referralCode: action.referralCode?.trim() || undefined };
    case "setDonorFormDraft":
      return { ...state, donorFormDraft: action.draft };
    case "setSmartDistributionTotal":
      return { ...state, smartDistributionTotal: action.smartDistributionTotal };
    case "setGlobalOperationsEnabled":
      return { ...state, globalOperationsEnabled: action.enabled };
    case "setOperationsPercentageModeByCauseArea":
      return {
        ...state,
        operationsPercentageModeByCauseArea: {
          ...state.operationsPercentageModeByCauseArea,
          [action.causeAreaId]: action.isPercentageMode,
        },
      };
    case "setGlobalOperationsPercentage":
      return { ...state, globalOperationsPercentage: action.percentage };
    case "setOperationsPercentageByCauseArea":
      return {
        ...state,
        operationsPercentageByCauseArea: {
          ...state.operationsPercentageByCauseArea,
          [action.causeAreaId]: action.percentage,
        },
      };
    case "setOperationsConfig":
      return { ...state, operationsConfig: action.config };
    case "selectPaymentMethod":
      return { ...state, method: action.method };
    case "submitDonorInfo":
      return { ...state, donor: { ...action.donor } };
    case "setDueDay":
      return { ...state, dueDay: action.day };
    case "setRecurring":
      return { ...state, recurring: action.recurring, method: undefined };
    case "setPaymentProviderURL":
      return { ...state, paymentProviderURL: action.url };
    case "setVippsAgreement":
      return { ...state, vippsAgreement: { ...state.vippsAgreement, ...action.vippsAgreement } };
    case "setApiError":
      return { ...state, apiError: action.message };
    case "clearApiError":
      return { ...state, apiError: undefined };
    default:
      return state;
  }
};

const layoutReducer = (state: Layout, action: WidgetAction): Layout => {
  switch (action.type) {
    case "causeAreasLoaded":
      return { ...state, causeAreas: action.causeAreas };
    case "setPaneNumber":
      return { ...state, paneNumber: action.paneNumber };
    case "nextPane":
      return { ...state, paneNumber: state.paneNumber + 1 };
    case "prevPane":
      return { ...state, paneNumber: state.paneNumber - 1 };
    case "setLoading":
      return { ...state, loading: action.loading };
    case "registered":
      return { ...state, loading: false };
    default:
      return state;
  }
};

const referralsReducer = (state: Referrals, action: WidgetAction): Referrals => {
  switch (action.type) {
    case "referralTypesLoaded":
      return { ...state, referrals: action.referralTypes };
    case "selectReferral":
      return {
        ...state,
        selectedReferrals: action.ref.active
          ? [...state.selectedReferrals, action.ref.referralID]
          : state.selectedReferrals.filter((id) => id !== action.ref.referralID),
      };
    case "setOtherText":
      return { ...state, otherText: action.text };
    default:
      return state;
  }
};

/** Pure: the widget's next state. Slices an action doesn't touch keep their identity. */
export const widgetReducer = (state: State, action: WidgetAction): State => {
  const donation = donationReducer(state.donation, action);
  const layout = layoutReducer(state.layout, action);
  const referrals = referralsReducer(state.referrals, action);
  return donation === state.donation && layout === state.layout && referrals === state.referrals
    ? state
    : { donation, layout, referrals };
};
