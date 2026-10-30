import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerBankPendingRequest,
  registerDonationRequest,
  resetWidgetApi,
  setWidgetApiLocale,
  submitReferralRequest,
  widgetApiFlavor,
  widgetTrpc,
} from "./widgetApi";

const API = process.env.NEXT_PUBLIC_EFFEKT_API || "http://localhost:5050";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A tRPC (non-batched httpLink) answer */
const trpcData = (data: unknown) => json(200, { result: { data } });
const trpcError = (httpStatus: number, code: string, message: string) =>
  json(httpStatus, { error: { message, code: -32600, data: { code, httpStatus } } });

const registered = {
  KID: "12345678",
  donorID: 42,
  hasAnsweredReferral: false,
  paymentProviderUrl: "",
  swishOrderID: null,
  swishPaymentRequestToken: null,
};

const donation = {
  distributionCauseAreas: [
    {
      id: 1,
      name: "Global health",
      standardSplit: true,
      amount: 500,
      percentageShare: "100",
      organizations: [],
    },
  ],
  donor: { email: "donor@example.org", name: "Donor", newsletter: false, ssn: "" },
  method: 2,
  amount: 500,
  recurring: 0,
};

let fetchMock: ReturnType<typeof vi.fn>;
const call = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string | URL | Request, RequestInit | undefined];
  return { url: String(url), init: init ?? {} };
};
const headersOf = (init: RequestInit) => new Headers(init.headers as HeadersInit);

beforeEach(() => {
  resetWidgetApi();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("widget API on our backend (tRPC)", () => {
  it("is the default, and the flavor for every site but the Danish one", () => {
    expect(widgetApiFlavor()).toBe("trpc");
    for (const locale of ["no", "sv", "en", "et"] as const) {
      setWidgetApiLocale(locale);
      expect(widgetApiFlavor()).toBe("trpc");
    }
  });

  it("reads the cause areas from widget.causeAreas without a token or batching", async () => {
    fetchMock.mockResolvedValueOnce(trpcData([]));
    expect(await widgetTrpc().widget.causeAreas.query()).toEqual([]);
    const { url, init } = call();
    expect(url).toBe(`${API}/trpc/widget.causeAreas`);
    expect(headersOf(init).has("authorization")).toBe(false);
  });

  it("registers the donation with one widget.registerDonation POST", async () => {
    fetchMock.mockResolvedValueOnce(trpcData(registered));
    expect(await registerDonationRequest(donation)).toEqual({ ok: true, content: registered });
    const { url, init } = call();
    expect(url).toBe(`${API}/trpc/widget.registerDonation`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(donation);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the backend's message when it refuses the donation", async () => {
    fetchMock.mockResolvedValueOnce(
      trpcError(400, "BAD_REQUEST", "Recurring donations not supported with Swish"),
    );
    expect(await registerDonationRequest(donation)).toEqual({
      ok: false,
      errorMessage: "Recurring donations not supported with Swish",
    });
  });

  it("throws the fetch error itself on a timeout, as the REST code did", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("signal timed out", "TimeoutError"));
    const err = await registerDonationRequest(donation).catch((e) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect(err.name).toBe("TimeoutError");
  });

  it("throws network errors", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = await registerDonationRequest(donation).catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toBe("Failed to fetch");
  });

  it("sends the bank pending email through widget.registerBankPending", async () => {
    fetchMock.mockResolvedValueOnce(trpcData(true));
    await registerBankPendingRequest("12345678", 500);
    const { url, init } = call();
    expect(url).toBe(`${API}/trpc/widget.registerBankPending`);
    expect(JSON.parse(init.body as string)).toEqual({ KID: "12345678", sum: 500 });
  });

  it("submits referral answers through widget.submitReferral and throws on errors", async () => {
    const answer = { referralID: 1, donorID: 42, active: true, session: "1730000000000" };
    fetchMock.mockResolvedValueOnce(trpcData(true));
    await submitReferralRequest(answer);
    expect(call().url).toBe(`${API}/trpc/widget.submitReferral`);
    expect(JSON.parse(call().init.body as string)).toEqual(answer);

    fetchMock.mockResolvedValueOnce(trpcError(400, "BAD_REQUEST", "Invalid input"));
    await expect(submitReferralRequest(answer)).rejects.toThrow();
  });
});

describe("widget API on the Danish site (REST)", () => {
  beforeEach(() => setWidgetApiLocale("dk"));

  it("reads the cause areas and referral types from the Danish REST routes", async () => {
    expect(widgetApiFlavor()).toBe("rest");
    fetchMock.mockResolvedValueOnce(json(200, { status: 200, content: [] }));
    fetchMock.mockResolvedValueOnce(
      json(200, { status: 200, content: [{ id: 1, name: "Bekendt", ordering: 1 }] }),
    );
    expect(await widgetTrpc().widget.causeAreas.query()).toEqual([]);
    expect(await widgetTrpc().widget.referralTypes.query()).toEqual([
      { id: 1, name: "Bekendt", ordering: 1 },
    ]);
    expect(call(0).url).toBe(`${API}/causeareas/all/`);
    expect(call(0).init.method).toBe("GET");
    expect(headersOf(call(0).init).has("authorization")).toBe(false);
    expect(call(1).url).toBe(`${API}/referrals/types`);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/trpc"))).toBe(false);
  });

  it("registers the donation with the same REST request as before", async () => {
    const dkRegistered = {
      donorID: "6c4a8d9e-0000-4000-8000-000000000001",
      hasAnsweredReferral: false,
      paymentProviderUrl: "https://payment.quickpay.net/x",
    };
    fetchMock.mockResolvedValueOnce(json(200, { status: 200, content: dkRegistered }));
    expect(await registerDonationRequest(donation)).toEqual({ ok: true, content: dkRegistered });
    const { url, init } = call();
    expect(url).toBe(`${API}/donations/register`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe(JSON.stringify(donation));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("shows no message for the Danish backend's empty 500", async () => {
    fetchMock.mockResolvedValueOnce(json(500, {}));
    expect(await registerDonationRequest(donation)).toEqual({ ok: false, errorMessage: null });
  });

  it("keeps the REST bank pending and referral requests", async () => {
    fetchMock.mockImplementation(async () => json(200, { status: 200, content: "OK" }));
    await registerBankPendingRequest("12345678", 500);
    expect(call(0).url).toBe(`${API}/donations/bank/pending`);
    expect(call(0).init.body).toBe('data={"KID":"12345678", "sum":500}');

    const answer = { referralID: 1, donorID: 42, active: true, session: "s" };
    await submitReferralRequest(answer);
    expect(call(1).url).toBe(`${API}/referrals/`);
    expect(call(1).init.body).toBe(JSON.stringify(answer));
  });
});
