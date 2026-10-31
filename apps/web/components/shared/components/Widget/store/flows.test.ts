import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentMethod, RecurringDonation, ShareType } from "../types/Enums";
import { CauseArea } from "../types/CauseArea";
import { clearApiError, nextPane, setApiError, setLoading, WidgetAction } from "./actions";
import { draftAvtaleGiro, draftVippsAgreement, fetchCauseAreas, registerDonation } from "./flows";
import { createInitialState } from "./reducer";
import { State } from "./state";
import { createWidgetStore } from "./store";
import {
  draftAvtaleGiroRequest,
  draftVippsAgreementRequest,
  registerBankPendingRequest,
  registerDonationRequest,
  widgetTrpc,
} from "./widgetApi";

vi.mock("./widgetApi", () => ({
  draftVippsAgreementRequest: vi.fn(),
  draftAvtaleGiroRequest: vi.fn(),
  registerBankPendingRequest: vi.fn(),
  registerDonationRequest: vi.fn(),
  submitReferralRequest: vi.fn(),
  widgetTrpc: vi.fn(),
}));

const causeAreas = [
  {
    id: 1,
    name: "Global health",
    organizations: [
      { id: 11, name: "A", standardShare: 60 },
      { id: 12, name: "B", standardShare: 40 },
    ],
  },
] as unknown as CauseArea[];

const registered = {
  KID: "12345678",
  registrationToken: "token",
  hasAnsweredReferral: false,
  paymentProviderUrl: "",
};

/** A store with a 500 kr one-off bank donation to cause area 1, recording what it dispatches */
const storeWith = (donation: Partial<State["donation"]> = {}) => {
  const initial = createInitialState();
  const store = createWidgetStore({
    ...initial,
    donation: {
      ...initial.donation,
      selectionType: "single",
      selectedCauseAreaId: 1,
      causeAreaAmounts: { 1: 500 },
      causeAreaDistributionType: { 1: ShareType.STANDARD },
      method: PaymentMethod.BANK,
      kid: "12345678",
      registrationToken: "token",
      operationsConfig: {
        defaultPercentage: 5,
        enabledByDefaultGlobal: false,
        enabledByDefaultSingle: false,
        excludedCauseAreaIds: [],
      },
      ...donation,
    },
    layout: { ...initial.layout, causeAreas },
  });
  const dispatched: WidgetAction[] = [];
  const dispatch = store.dispatch;
  store.dispatch = (action) => {
    dispatched.push(action);
    dispatch(action);
  };
  return { store, dispatched };
};

let open: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  open = vi.fn();
  vi.stubGlobal("window", { open, location: { href: "" } });
  vi.stubGlobal("document", { getElementById: () => ({ submit: vi.fn() }) });
});
afterEach(() => vi.unstubAllGlobals());

describe("registerDonation", () => {
  it("registers, moves on to the payment pane and emails the bank details", async () => {
    vi.mocked(registerDonationRequest).mockResolvedValue({ ok: true, content: registered });
    const { store, dispatched } = storeWith();

    await registerDonation(store);

    expect(vi.mocked(registerDonationRequest).mock.calls[0][0]).toMatchObject({
      amount: 500,
      method: PaymentMethod.BANK,
      recurring: RecurringDonation.NON_RECURRING,
      distributionCauseAreas: [{ id: 1, standardSplit: true, percentageShare: "100", amount: 500 }],
    });
    expect(registerBankPendingRequest).toHaveBeenCalledWith("12345678", 500, "token");
    expect(dispatched.slice(0, 2)).toEqual([setLoading(true), clearApiError()]);
    expect(dispatched.at(-1)).toEqual(nextPane());
    expect(store.getState().layout).toMatchObject({ loading: false, paneNumber: 1 });
    expect(store.getState().donation.kid).toBe("12345678");
  });

  it("ignores a second registration while the first is in flight", async () => {
    let answer!: (value: unknown) => void;
    vi.mocked(registerDonationRequest).mockReturnValue(
      new Promise((resolve) => (answer = resolve)) as never,
    );
    const { store } = storeWith();

    const first = registerDonation(store);
    const second = registerDonation(store);
    answer({ ok: true, content: registered });
    await Promise.all([first, second]);
    expect(registerDonationRequest).toHaveBeenCalledTimes(1);

    // Once it's done, the donor can register again (e.g. after going back)
    vi.mocked(registerDonationRequest).mockResolvedValue({ ok: true, content: registered });
    await registerDonation(store);
    expect(registerDonationRequest).toHaveBeenCalledTimes(2);
  });

  it("opens the payment provider's page for card, MobilePay and Danish bank", async () => {
    vi.mocked(registerDonationRequest).mockResolvedValue({
      ok: true,
      content: { ...registered, paymentProviderUrl: "https://pay.example.org" },
    });
    const { store, dispatched } = storeWith({ method: PaymentMethod.QUICKPAY_CARD });

    await registerDonation(store, { openExternalPaymentOnRegisterSuccess: true });

    expect(open).toHaveBeenCalledWith("https://pay.example.org", "_self");
    expect(dispatched).not.toContainEqual(nextPane());
    expect(registerBankPendingRequest).not.toHaveBeenCalled();
  });

  it("shows the backend's refusal and stays on the donor pane", async () => {
    vi.mocked(registerDonationRequest).mockResolvedValue({ ok: false, errorMessage: "No" });
    const { store, dispatched } = storeWith();

    await registerDonation(store);

    expect(dispatched).toEqual([
      setLoading(true),
      clearApiError(),
      setApiError("No"),
      setLoading(false),
    ]);
    expect(store.inFlight.size).toBe(0);
  });

  it("shows the generic message when the request times out", async () => {
    vi.mocked(registerDonationRequest).mockRejectedValue(
      new DOMException("signal timed out", "TimeoutError"),
    );
    const { store } = storeWith();
    await registerDonation(store);
    expect(store.getState().donation.apiError).toBeNull();
  });

  it("shows a network error's message", async () => {
    vi.mocked(registerDonationRequest).mockRejectedValue(new TypeError("Failed to fetch"));
    const { store } = storeWith();
    await registerDonation(store);
    expect(store.getState().donation.apiError).toBe("Failed to fetch");
  });
});

describe("agreement drafts", () => {
  it("shows the generic API error and stops loading when the Vipps draft fails", async () => {
    vi.mocked(draftVippsAgreementRequest).mockRejectedValue(new Error("HTTP 500"));
    const { store, dispatched } = storeWith();
    await draftVippsAgreement(store);
    expect(dispatched).toEqual([
      setLoading(true),
      clearApiError(),
      setApiError(null),
      setLoading(false),
    ]);
  });

  it("shows the generic API error and stops loading when the AvtaleGiro draft fails", async () => {
    vi.mocked(draftAvtaleGiroRequest).mockRejectedValue(new Error("HTTP 500"));
    const { store, dispatched } = storeWith();
    await draftAvtaleGiro(store);
    expect(dispatched).toEqual([
      setLoading(true),
      clearApiError(),
      setApiError(null),
      setLoading(false),
    ]);
  });

  it("drafts the Vipps agreement for the registered KID and sends the donor to Vipps", async () => {
    vi.mocked(draftVippsAgreementRequest).mockResolvedValue("https://vipps.example.org");
    const { store } = storeWith({
      recurring: RecurringDonation.RECURRING,
      vippsAgreement: { initialCharge: false, monthlyChargeDay: 15 },
    });
    await draftVippsAgreement(store);
    expect(draftVippsAgreementRequest).toHaveBeenCalledWith({
      KID: "12345678",
      amount: 500,
      initialCharge: false,
      monthlyChargeDay: 15,
      registrationToken: "token",
    });
    expect(window.location.href).toBe("https://vipps.example.org");
  });

  it("drafts each agreement once while a draft is in flight", async () => {
    vi.mocked(draftAvtaleGiroRequest).mockResolvedValue(undefined);
    const { store } = storeWith({ dueDay: 0 });
    await Promise.all([draftAvtaleGiro(store), draftAvtaleGiro(store)]);
    expect(draftAvtaleGiroRequest).toHaveBeenCalledTimes(1);
    expect(draftAvtaleGiroRequest).toHaveBeenCalledWith({
      KID: "12345678",
      amount: 500,
      dueDay: 0,
      registrationToken: "token",
    });
  });
});

describe("fetchCauseAreas", () => {
  it("drops an answer that arrives after a newer request's", async () => {
    const answers: ((value: unknown) => void)[] = [];
    vi.mocked(widgetTrpc).mockReturnValue({
      widget: { causeAreas: { query: () => new Promise((resolve) => answers.push(resolve)) } },
    } as never);
    const { store } = storeWith();
    const older = fetchCauseAreas(store);
    const newer = fetchCauseAreas(store);
    const fresh = [{ id: 2, name: "Fresh", organizations: [] }];
    answers[1](fresh);
    answers[0]([{ id: 1, name: "Stale", organizations: [] }]);
    await Promise.all([older, newer]);
    expect(store.getState().layout.causeAreas).toEqual(fresh);
  });
});
