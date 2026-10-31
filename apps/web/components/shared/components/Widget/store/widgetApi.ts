import { TRPCClientError } from "@trpc/client";
import {
  apiFlavorFor,
  createPublicTrpcClient,
  type ApiFlavor,
  type TrpcClient,
} from "../../../../../lib/trpc/client";
import { API_URL } from "../config/api";
import type { IServerResponse } from "../types/Temp";
import type { RegisterDonationResponse } from "./donation/actions";

/**
 * The donation widget's calls to the backend. On every site but the Danish one they go to the
 * backend's public tRPC procedures (widget.*). The Danish backend (giveffektivt/donation-platform)
 * only speaks REST: the two reads go through the REST link (lib/trpc/restLink.ts), and the writes
 * keep the widget's original REST requests, since the Danish register route takes and answers a
 * different shape and has no bank-pending route. It has no route for referral answers either, so the
 * widget doesn't ask for them there (widgetAsksForReferrals). See docs/web-trpc.md.
 *
 * Which backend is set from the widget's site locale when the widget mounts (Widget.tsx), like
 * Min Side's apiFlavorFor. The store is created before that, once per page load.
 */
let flavor: ApiFlavor = "trpc";
let client: TrpcClient | null = null;

export const setWidgetApiLocale = (locale: Parameters<typeof apiFlavorFor>[0]) => {
  const next = apiFlavorFor(locale);
  if (next !== flavor) {
    flavor = next;
    client = null;
  }
};

export const widgetApiFlavor = () => flavor;

/**
 * Whether the backend records "how did you hear about us" answers. The Danish backend lists the
 * referral types but has no route to submit an answer, so the widget doesn't ask there.
 */
export const widgetAsksForReferrals = () => flavor !== "rest";

export const widgetTrpc = (): TrpcClient => (client ??= createPublicTrpcClient({ flavor }));

/** Only for tests */
export const resetWidgetApi = () => {
  flavor = "trpc";
  client = null;
};

/**
 * The body of a REST response, or null when it isn't JSON - a gateway or platform error page, or
 * an empty body - so the donor gets the generic error message rather than a JSON parse error.
 */
const restJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

/** The server answered with an error (as opposed to a network failure or timeout) */
const serverError = (err: unknown): err is TRPCClientError<any> =>
  err instanceof TRPCClientError && err.data?.httpStatus !== undefined;

/** A network failure or timeout, as the REST code saw it: the underlying fetch error */
const transportError = (err: unknown) =>
  err instanceof TRPCClientError && err.cause instanceof Error ? err.cause : err;

export type RegisterDonationResult =
  { ok: true; content: RegisterDonationResponse } | { ok: false; errorMessage: string | null };

/**
 * Registers the donation. Resolves `ok: false` with the message to show when the backend refuses
 * it; throws when the request fails (network, the 20 second timeout) as fetch did.
 */
export const registerDonationRequest = async (data: object): Promise<RegisterDonationResult> => {
  // A signal timeout ensures a slow/hanging connection fails (and resets
  // the payment button's loading state) instead of leaving the donor
  // staring at a spinner indefinitely
  const signal = AbortSignal.timeout(20000);

  if (flavor === "rest") {
    const request = await fetch(`${API_URL}/donations/register`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      signal,
    });
    const result = await restJson<IServerResponse<RegisterDonationResponse>>(request);
    if (!request.ok || result?.status !== 200) {
      // Check if result.content is an object with message property
      let errorMessage = null;
      if (typeof (result as any)?.message === "string") {
        errorMessage = (result as any).message;
      } else if (typeof result?.content === "string") {
        errorMessage = result.content;
      }
      return { ok: false, errorMessage };
    }
    return { ok: true, content: result.content as RegisterDonationResponse };
  }

  try {
    const content = await widgetTrpc().widget.registerDonation.mutate(data as any, { signal });
    return { ok: true, content: content as RegisterDonationResponse };
  } catch (err) {
    if (serverError(err)) return { ok: false, errorMessage: err.message || null };
    throw transportError(err);
  }
};

/** Emails the donor the bank details for a one-off bank transfer. Throws on failure. */
export const registerBankPendingRequest = async (
  KID: string,
  sum: number,
  registrationToken: string,
) => {
  if (flavor === "rest") {
    const request = await fetch(`${API_URL}/donations/bank/pending`, {
      method: "POST",
      headers: {
        Accept: "application/x-www-form-urlencoded",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data={"KID":"${KID}", "sum":${sum}}`,
    });
    const result = await restJson<IServerResponse<never>>(request);
    if (!request.ok || result?.status !== 200) {
      throw new Error((result?.content as string) ?? `HTTP ${request.status}`);
    }
    return;
  }
  await widgetTrpc().widget.registerBankPending.mutate({ KID, sum, registrationToken });
};

export type ReferralAnswer = {
  referralID: number;
  /** From registerDonation: the answer is stored for that registration's donor */
  registrationToken?: string;
  active: boolean;
  comment?: string;
  session: string;
};

/**
 * Records or removes the donor's "how did you hear about us" answer. Throws on failure, and on the
 * Danish site, whose backend has no route for it (see widgetAsksForReferrals).
 */
export const submitReferralRequest = async ({ registrationToken, ...answer }: ReferralAnswer) => {
  if (!widgetAsksForReferrals()) {
    throw new Error("Referral answers are not recorded on this site");
  }
  await widgetTrpc().widget.submitReferral.mutate({
    ...answer,
    registrationToken: registrationToken ?? "",
  });
};

/*
 * The calls below only exist on our backend: Vipps, AvtaleGiro, Swish and AutoGiro are Norwegian
 * and Swedish payment methods. On the Danish site the REST link leaves them unmapped, so they fail
 * with "not available on this site" without a request (before, they got a 404 from the Danish
 * backend).
 */

/**
 * Drafts a monthly Vipps agreement for the registered KID and returns the Vipps page where the
 * donor confirms it. Throws on failure.
 */
export const draftVippsAgreementRequest = async (input: {
  KID: string;
  amount: number;
  initialCharge: boolean;
  monthlyChargeDay: number;
  registrationToken: string;
}) => {
  const { vippsConfirmationUrl } = await widgetTrpc().widget.draftVippsAgreement.mutate(input);
  return vippsConfirmationUrl;
};

/**
 * Drafts an AvtaleGiro agreement for the registered KID (amount in NOK, dueDay 0 = last day of the
 * month), before the donor signs it at Mastercard Payment Services. Throws on failure.
 */
export const draftAvtaleGiroRequest = async (input: {
  KID: string;
  amount: number;
  dueDay?: number;
  registrationToken: string;
}) => {
  await widgetTrpc().widget.draftAvtaleGiro.mutate(input);
};

/** The status of a Swish payment (polled while the donor pays) */
export const swishOrderStatusRequest = (orderId: string) =>
  widgetTrpc().widget.swishOrderStatus.query({ orderId });

/** Sets the payment date (0–28) of the AutoGiro agreement drafted for the KID */
export const setAutoGiroDraftPaymentDateRequest = (
  KID: string,
  paymentDate: number,
  registrationToken: string,
) =>
  widgetTrpc().widget.setAutoGiroDraftPaymentDate.mutate({ KID, paymentDate, registrationToken });
