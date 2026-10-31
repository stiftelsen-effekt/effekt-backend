import { CauseArea } from "../types/CauseArea";
import { PaymentMethod, RecurringDonation, ShareType } from "../types/Enums";
import { ReferralData, ReferralType } from "../types/Temp";
import {
  calculateDonationBreakdown,
  calculateOrganizationSharesWithinCauseArea,
  distributeSharesWithRemainder,
} from "../utils/donationCalculations";
import {
  clearApiError,
  nextPane,
  RegisterDonationResponse,
  setApiError,
  setLoading,
  setPaymentProviderURL,
  WidgetAction,
} from "./actions";
import { Donation, State } from "./state";
import type { WidgetStore } from "./store";
import {
  draftAvtaleGiroRequest,
  draftVippsAgreementRequest,
  registerBankPendingRequest,
  registerDonationRequest,
  submitReferralRequest,
  widgetTrpc,
} from "./widgetApi";

/*
 * The widget's requests and what follows them: plain async functions over the store, which read
 * the latest state with getState() after every await.
 *
 * Registering a donation and drafting an agreement are `leading`: a second call while one is in
 * flight is ignored, so a double click can't register or draft twice. Loading the cause areas and
 * referral types is `latest`: when it starts again before the last run answered (the site locale
 * changed), the older answer is dropped.
 */

/** Runs `run` unless a flow of the same name is in flight, in which case the call is ignored */
const leading = async (store: WidgetStore, name: string, run: () => Promise<void>) => {
  if (store.inFlight.has(name)) return;
  store.inFlight.add(name);
  try {
    await run();
  } finally {
    store.inFlight.delete(name);
  }
};

/** Runs `run` with a dispatch that drops its actions once a newer run of `name` has started */
const latest = async (
  store: WidgetStore,
  name: string,
  run: (dispatch: (action: WidgetAction) => void) => Promise<void>,
) => {
  const id = (store.runs.get(name) ?? 0) + 1;
  store.runs.set(name, id);
  await run((action) => {
    if (store.runs.get(name) === id) store.dispatch(action);
  });
};

/** The donation's amounts, operations cut included, from what the donor entered */
export const breakdownOf = (donation: Donation, causeAreas: CauseArea[]) =>
  calculateDonationBreakdown(
    donation.causeAreaAmounts ?? {},
    donation.orgAmounts ?? {},
    donation.causeAreaDistributionType ?? {},
    donation.operationsPercentageModeByCauseArea ?? {},
    donation.operationsPercentageByCauseArea ?? {},
    causeAreas,
    donation.selectionType || "multiple",
    donation.selectedCauseAreaId,
    donation.globalOperationsEnabled ?? false,
    donation.globalOperationsPercentage || 0,
    donation.operationsConfig?.excludedCauseAreaIds ?? [],
    donation.operationsConfig?.operationsCauseAreaId,
    donation.smartDistributionTotal,
  );

const causeAreasOf = (state: State) => state.layout.causeAreas ?? [];

export const fetchCauseAreas = (store: WidgetStore) =>
  latest(store, "fetchCauseAreas", async (dispatch) => {
    try {
      // On the Danish site the REST link answers this with GET /causeareas/all/
      const causeAreas = await widgetTrpc().widget.causeAreas.query();
      dispatch({ type: "causeAreasLoaded", causeAreas: causeAreas as CauseArea[] });
    } catch {
      // The panes keep showing their spinner, as before
    }
  });

export const fetchReferralTypes = (store: WidgetStore) =>
  latest(store, "fetchReferralTypes", async (dispatch) => {
    try {
      const referralTypes = await widgetTrpc().widget.referralTypes.query();
      dispatch({ type: "referralTypesLoaded", referralTypes: referralTypes as ReferralType[] });
    } catch {
      // No referral question then
    }
  });

/** Records (or with `active: false` removes) the donor's "how did you hear about us" answer */
export const submitReferral = async (store: WidgetStore, referral: ReferralData) => {
  const { donation, referrals } = store.getState();
  try {
    await submitReferralRequest({
      referralID: referral.referralID,
      registrationToken: donation.registrationToken,
      active: referral.active,
      comment: referral.comment,
      session: referrals.websiteSession,
    });
  } catch {
    // Best effort: the donation doesn't depend on it
  }
};

/**
 * The registration's distribution: each cause area with an amount, its organizations' shares
 * and the operations cut, with shares that add up to exactly 100.
 */
export const distributionPayload = (donation: Donation, causeAreas: CauseArea[]) => {
  const { causeAreaDistributionType = {}, selectedCauseAreaId, operationsConfig } = donation;
  const OPERATIONS_CAUSE_AREA_ID = operationsConfig?.operationsCauseAreaId;
  const breakdown = breakdownOf(donation, causeAreas);

  const causeAreaEntries: {
    id: number;
    standardSplit: boolean;
    name: string;
    amount: number;
    organizations: { id: number; percentageShare: string; amount: number }[];
  }[] = [];

  causeAreas.forEach((area) => {
    const orgAmountsForArea = area.organizations
      .map((org) => ({
        id: org.id,
        amount:
          (breakdown.organizationAmounts[org.id] || 0) +
          (area.id === OPERATIONS_CAUSE_AREA_ID && org.standardShare
            ? (org.standardShare / 100) * breakdown.operationsAmount
            : 0),
      }))
      .filter((org) => org.amount > 0);

    // Only areas with organizations that get an amount
    if (orgAmountsForArea.length > 0 && breakdown.totalAmount > 0) {
      const areaAmount = orgAmountsForArea.reduce((sum, org) => sum + org.amount, 0);
      const areaOrgPayloads = calculateOrganizationSharesWithinCauseArea(orgAmountsForArea);

      let isStandardSplit = causeAreaDistributionType[area.id] === ShareType.STANDARD;
      // Smart distribution uses the standard split everywhere, and so does the operations
      // cause area when it gets the operations cut
      if (selectedCauseAreaId === -1) {
        isStandardSplit = true;
      } else if (area.id === OPERATIONS_CAUSE_AREA_ID && breakdown.operationsAmount > 0) {
        isStandardSplit = true;
      }

      causeAreaEntries.push({
        id: area.id,
        name: area.name,
        standardSplit: isStandardSplit,
        amount: areaAmount,
        organizations: areaOrgPayloads,
      });
    }
  });

  // The operations cut, when the operations cause area didn't get an entry above
  if (breakdown.operationsAmount > 0) {
    const operationsCauseArea = causeAreas.find((ca) => ca.id === OPERATIONS_CAUSE_AREA_ID);
    if (operationsCauseArea && !causeAreaEntries.some((p) => p.id === OPERATIONS_CAUSE_AREA_ID)) {
      // Its organizations' amounts as shares of this cause area (not of the total)
      const operationsOrgAmounts = operationsCauseArea.organizations
        .filter((org) => org.standardShare && org.standardShare > 0)
        .map((org) => ({
          id: org.id,
          amount: (org.standardShare! / 100) * breakdown.operationsAmount,
        }));
      causeAreaEntries.push({
        id: operationsCauseArea.id,
        name: operationsCauseArea.name,
        standardSplit: true,
        amount: breakdown.operationsAmount,
        organizations: calculateOrganizationSharesWithinCauseArea(operationsOrgAmounts),
      });
    }
  }

  // Cause area shares must add up to exactly 100 (the backend allows no tolerance), so the
  // largest cause area takes the rounding remainder rather than each share being rounded
  // on its own, which can drift (100.00000001) with two or more cause areas
  return {
    totalAmount: breakdown.totalAmount,
    distributionCauseAreas: distributeSharesWithRemainder(causeAreaEntries).map(
      ({ amount, ...rest }) => ({ ...rest, amount: Math.round(amount) }),
    ),
  };
};

export type RegisterDonationOptions = {
  /** Card, MobilePay and Danish bank: go straight to the payment provider's page */
  openExternalPaymentOnRegisterSuccess?: boolean;
};

/**
 * Registers the donation the donor put together. On success the widget moves on to the payment
 * pane (or the payment provider's page), and a one-off bank transfer gets its bank details
 * emailed. A refusal or failure shows the widget's error notification.
 */
export const registerDonation = (store: WidgetStore, options: RegisterDonationOptions = {}) =>
  leading(store, "registerDonation", async () => {
    const { dispatch } = store;
    dispatch(setLoading(true));
    dispatch(clearApiError());
    try {
      const state = store.getState();
      const { donation } = state;
      const { recurring, donor, method, referralCode } = donation;
      const { distributionCauseAreas, totalAmount } = distributionPayload(
        donation,
        causeAreasOf(state),
      );
      const data = {
        distributionCauseAreas,
        donor,
        method: method || PaymentMethod.BANK,
        amount: totalAmount,
        recurring,
        ...(referralCode ? { referralCode } : {}),
      };

      // tRPC, or REST on the Danish site; times out after 20 seconds
      const result = await registerDonationRequest(data);

      if (!result.ok) {
        dispatch(setApiError(result.errorMessage));
        dispatch(setLoading(false));
        return;
      }

      const registered = result.content as RegisterDonationResponse;
      dispatch(setPaymentProviderURL(registered.paymentProviderUrl));
      dispatch({ type: "registered", result: registered });

      if (method === PaymentMethod.BANK && recurring === RecurringDonation.NON_RECURRING) {
        void registerBankPending(store);
      }

      dispatch(setLoading(false));

      if (options.openExternalPaymentOnRegisterSuccess && registered.paymentProviderUrl) {
        window.open(registered.paymentProviderUrl, "_self");
      } else {
        dispatch(nextPane());
      }
    } catch (ex) {
      console.error("Error registering donation:", ex);
      // A timeout's DOMException message isn't for donors: show the generic message instead
      const isTimeout = ex instanceof DOMException && ex.name === "TimeoutError";
      dispatch(
        setApiError(isTimeout ? null : ex instanceof Error ? ex.message : "Something went wrong"),
      );
      dispatch(setLoading(false));
    }
  });

/** Emails the donor the bank details of a one-off bank transfer */
export const registerBankPending = (store: WidgetStore) =>
  leading(store, "registerBankPending", async () => {
    try {
      const { donation, layout } = store.getState();
      const { totalAmount } = breakdownOf(donation, layout.causeAreas ?? []);
      await registerBankPendingRequest(donation.kid!, totalAmount, donation.registrationToken!);
    } catch (ex) {
      console.error(ex);
    }
  });

/** Drafts the monthly Vipps agreement and sends the donor to Vipps to confirm it */
export const draftVippsAgreement = (store: WidgetStore) =>
  leading(store, "draftVippsAgreement", async () => {
    const { dispatch } = store;
    try {
      dispatch(setLoading(true));
      dispatch(clearApiError());
      const { donation, layout } = store.getState();
      const { totalAmount } = breakdownOf(donation, layout.causeAreas ?? []);
      const vippsConfirmationUrl = await draftVippsAgreementRequest({
        KID: donation.kid!,
        amount: totalAmount,
        initialCharge: donation.vippsAgreement.initialCharge,
        monthlyChargeDay: donation.vippsAgreement.monthlyChargeDay,
        registrationToken: donation.registrationToken!,
      });
      // nosemgrep: javascript.browser.security.open-redirect-from-function.js-open-redirect-from-function -- the Vipps confirmation URL comes from our API, not from user input
      window.location.href = vippsConfirmationUrl;
      dispatch(setPaymentProviderURL(vippsConfirmationUrl));
    } catch (ex) {
      console.error("Drafting Vipps agreement failed", ex);
      // The generic error message, rather than a button that silently stops spinning
      dispatch(setApiError(null));
      dispatch(setLoading(false));
    }
  });

/**
 * Drafts the AvtaleGiro agreement, then submits the AvtaleGiro form (RecurringForm.tsx), which
 * takes the donor to Mastercard Payment Services to sign it
 */
export const draftAvtaleGiro = (store: WidgetStore) =>
  leading(store, "draftAvtaleGiro", async () => {
    const { dispatch } = store;
    try {
      dispatch(setLoading(true));
      dispatch(clearApiError());
      const { donation, layout } = store.getState();
      const { totalAmount } = breakdownOf(donation, layout.causeAreas ?? []);
      await draftAvtaleGiroRequest({
        KID: donation.kid!,
        amount: totalAmount,
        dueDay: donation.dueDay,
        registrationToken: donation.registrationToken!,
      });
      const form = document.getElementById("avtalegiro-form") as HTMLFormElement;
      form.submit();
    } catch (ex) {
      console.error("Drafting AvtaleGiro failed", ex);
      dispatch(setApiError(null));
      dispatch(setLoading(false));
    }
  });
