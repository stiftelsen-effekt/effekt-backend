import { describe, expect, it } from "vitest";
import { PaymentMethod, RecurringDonation, ShareType } from "../types/Enums";
import { CauseArea } from "../types/CauseArea";
import {
  nextPane,
  prevPane,
  selectPaymentMethod,
  selectReferral,
  setCauseAreaSelection,
  setOperationsConfig,
  setPrefilledShares,
  setRecurring,
  setReferralCode,
  setVippsAgreement,
} from "./actions";
import { createInitialState, widgetReducer } from "./reducer";
import { State } from "./state";

const causeAreas = [
  { id: 1, name: "Global health", organizations: [] },
  { id: 3, name: "Climate", organizations: [] },
  { id: 4, name: "Operations", organizations: [] },
] as unknown as CauseArea[];

const config = {
  operationsCauseAreaId: 4,
  defaultPercentage: 5,
  enabledByDefaultGlobal: true,
  enabledByDefaultSingle: true,
  excludedCauseAreaIds: [3],
};

const reduce = (...actions: Parameters<typeof widgetReducer>[1][]) =>
  actions.reduce<State>(widgetReducer, createInitialState());

describe("widgetReducer", () => {
  it("sets up the distribution and the operations cut when the cause areas load", () => {
    const state = reduce(setOperationsConfig(config), {
      type: "causeAreasLoaded",
      causeAreas,
    });
    expect(state.layout.causeAreas).toBe(causeAreas);
    expect(state.donation).toMatchObject({
      selectionType: "single",
      selectedCauseAreaId: 1,
      causeAreaDistributionType: {
        1: ShareType.STANDARD,
        3: ShareType.STANDARD,
        4: ShareType.STANDARD,
      },
      // Never on the operations cause area itself, nor on an excluded one
      operationsPercentageModeByCauseArea: { 1: true, 3: false, 4: false },
      operationsPercentageByCauseArea: { 1: 5, 3: 5, 4: 5 },
      globalOperationsEnabled: true,
      globalOperationsPercentage: 5,
    });
  });

  it("keeps a selection made before the cause areas loaded (a prefill)", () => {
    const state = reduce(setCauseAreaSelection("single", 3), {
      type: "causeAreasLoaded",
      causeAreas,
    });
    expect(state.donation.selectedCauseAreaId).toBe(3);
  });

  it("records the registration and stops loading", () => {
    const state = reduce(
      { type: "setLoading", loading: true },
      {
        type: "registered",
        result: {
          KID: "12345678",
          registrationToken: "token",
          hasAnsweredReferral: false,
          paymentProviderUrl: "https://pay.example.org",
          donorID: 7,
        },
      },
    );
    expect(state.layout.loading).toBe(false);
    expect(state.donation).toMatchObject({
      kid: "12345678",
      registrationToken: "token",
      paymentProviderURL: "https://pay.example.org",
      donor: { donorID: 7 },
    });
  });

  it("clears the payment method when the donor switches between one-off and monthly", () => {
    const state = reduce(
      selectPaymentMethod(PaymentMethod.VIPPS),
      setRecurring(RecurringDonation.RECURRING),
    );
    expect(state.donation.method).toBeUndefined();
    expect(state.donation.recurring).toBe(RecurringDonation.RECURRING);
  });

  it("trims the referral code, and clears it when empty", () => {
    expect(reduce(setReferralCode("  CODE ")).donation.referralCode).toBe("CODE");
    expect(reduce(setReferralCode("CODE"), setReferralCode("  ")).donation.referralCode).toBe(
      undefined,
    );
  });

  it("resets the prefilled organization tracking along with new prefilled shares", () => {
    const state = reduce(
      { type: "setShowAllOrganizations", show: true },
      { type: "setHasManuallyEditedPrefilledOrgAmount", edited: true },
      setPrefilledShares({ 11: 100 }),
    );
    expect(state.donation).toMatchObject({
      prefilledShares: { 11: 100 },
      showAllOrganizations: false,
      hasManuallyEditedPrefilledOrgAmount: false,
    });
  });

  it("merges the Vipps agreement settings", () => {
    const state = reduce(setVippsAgreement({ initialCharge: false, monthlyChargeDay: 15 }));
    expect(state.donation.vippsAgreement).toEqual({ initialCharge: false, monthlyChargeDay: 15 });
  });

  it("moves between panes", () => {
    expect(reduce(nextPane(), nextPane(), prevPane()).layout.paneNumber).toBe(1);
  });

  it("adds and removes referral answers", () => {
    const state = reduce(
      selectReferral({ referralID: 1, active: true }),
      selectReferral({ referralID: 2, active: true }),
      selectReferral({ referralID: 1, active: false }),
    );
    expect(state.referrals.selectedReferrals).toEqual([2]);
  });

  it("returns the same state for an action that changes nothing", () => {
    const state = createInitialState();
    expect(widgetReducer(state, { type: "unknown" } as never)).toBe(state);
  });
});
