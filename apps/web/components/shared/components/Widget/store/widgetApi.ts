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
 * different shape and has no bank-pending or referral route. See docs/web-trpc.md.
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

export const widgetTrpc = (): TrpcClient => (client ??= createPublicTrpcClient({ flavor }));

/** Only for tests */
export const resetWidgetApi = () => {
  flavor = "trpc";
  client = null;
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
    const result: IServerResponse<RegisterDonationResponse> = await request.json();
    if (result.status !== 200) {
      // Check if result.content is an object with message property
      let errorMessage = null;
      if (typeof (result as any).message === "string") {
        errorMessage = (result as any).message;
      } else if (typeof result.content === "string") {
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
export const registerBankPendingRequest = async (KID: string, sum: number) => {
  if (flavor === "rest") {
    const request = await fetch(`${API_URL}/donations/bank/pending`, {
      method: "POST",
      headers: {
        Accept: "application/x-www-form-urlencoded",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data={"KID":"${KID}", "sum":${sum}}`,
    });
    const result: IServerResponse<never> = await request.json();
    if (result.status !== 200) throw new Error(result.content as string);
    return;
  }
  await widgetTrpc().widget.registerBankPending.mutate({ KID, sum });
};

export type ReferralAnswer = {
  referralID: number;
  donorID: number;
  active: boolean;
  comment?: string;
  session: string;
};

/** Records or removes the donor's "how did you hear about us" answer. Throws on failure. */
export const submitReferralRequest = async (data: ReferralAnswer) => {
  if (flavor === "rest") {
    const request = await fetch(`${API_URL}/referrals/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    const result: IServerResponse<boolean> = await request.json();
    if (result.status !== 200) throw new Error(result.content as string);
    return;
  }
  await widgetTrpc().widget.submitReferral.mutate(data);
};
