import { runSaga, type Saga } from "redux-saga";
import { takeLatest, takeLeading } from "redux-saga/effects";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCauseAreasAction, setLoading } from "../layout/actions";
import { watchAll } from "../root.saga";
import {
  clearApiError,
  draftAgreementAction,
  draftAvtaleGiroAction,
  registerBankPendingAction,
  registerDonationAction,
  setApiError,
} from "./actions";
import { draftAvtaleGiro, draftVippsAgreement } from "./saga";
import { draftAvtaleGiroRequest, draftVippsAgreementRequest } from "../widgetApi";

vi.mock("../widgetApi", () => ({
  draftVippsAgreementRequest: vi.fn(),
  draftAvtaleGiroRequest: vi.fn(),
  registerBankPendingRequest: vi.fn(),
  registerDonationRequest: vi.fn(),
}));

const state = {
  donation: {
    kid: "12345678",
    registrationToken: "token",
    causeAreaAmounts: { 1: 500 },
    orgAmounts: {},
    causeAreaDistributionType: {},
    selectionType: "single",
    selectedCauseAreaId: 1,
    operationsConfig: { excludedCauseAreaIds: [], operationsCauseAreaId: undefined },
    vippsAgreement: { initialCharge: true, monthlyChargeDay: 0 },
    dueDay: 1,
  },
  layout: { causeAreas: [] },
};

const run = async (saga: Saga) => {
  const dispatched: unknown[] = [];
  await runSaga({ dispatch: (a) => dispatched.push(a), getState: () => state }, saga).toPromise();
  return dispatched;
};

describe("agreement draft sagas", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows the generic API error and stops loading when the Vipps draft fails", async () => {
    vi.mocked(draftVippsAgreementRequest).mockRejectedValueOnce(new Error("HTTP 500"));
    const dispatched = await run(draftVippsAgreement);
    expect(dispatched).toEqual([
      setLoading(true),
      clearApiError(),
      setApiError(null),
      setLoading(false),
    ]);
  });

  it("shows the generic API error and stops loading when the AvtaleGiro draft fails", async () => {
    vi.mocked(draftAvtaleGiroRequest).mockRejectedValueOnce(new Error("HTTP 500"));
    const dispatched = await run(draftAvtaleGiro);
    expect(dispatched).toEqual([
      setLoading(true),
      clearApiError(),
      setApiError(null),
      setLoading(false),
    ]);
  });
});

type ForkEffect = { payload: { fn: unknown; args: unknown[] } };

describe("watchAll", () => {
  it("ignores repeat registrations and drafts while one is in flight", () => {
    const forks = (watchAll().next().value as { payload: ForkEffect[] }).payload;
    const helperFor = (type: string) => forks.find((f) => f.payload.args[0] === type)?.payload.fn;
    const leadingHelper = (takeLeading("x", () => {}) as unknown as ForkEffect).payload.fn;
    const latestHelper = (takeLatest("x", () => {}) as unknown as ForkEffect).payload.fn;

    for (const action of [
      registerDonationAction,
      registerBankPendingAction,
      draftAgreementAction,
      draftAvtaleGiroAction,
    ]) {
      expect(helperFor(action.started.type)).toBe(leadingHelper);
    }
    expect(helperFor(fetchCauseAreasAction.started.type)).toBe(latestHelper);
  });
});
