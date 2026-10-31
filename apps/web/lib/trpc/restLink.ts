import { TRPCClientError, type TRPCLink } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { TRPC_ERROR_CODES_BY_KEY, type TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";
import {
  changedTaxUnitOutput,
  distributionsOutput,
  donationsAggregatedOutput,
  donationsOutput,
  donorProfileOutput,
  taxUnitsOutput,
} from "@effekt/api/minside";
import { widgetCauseAreasOutput, widgetReferralTypesOutput } from "@effekt/api/widget";
import {
  siteDailyDonationsOutput,
  siteFundraiserOutput,
  siteMonthlyOutputsOutput,
  siteOrganizationsOutput,
  siteReferralSumsOutput,
  siteResultsHeadlineOutput,
} from "@effekt/api/site";

/**
 * A tRPC link for the Danish site, whose backend (giveffektivt/donation-platform) implements the
 * REST contract only. It answers each mapped procedure with the matching REST call and validates
 * the response with the same output schema the tRPC procedure uses, so callers get the same shape
 * on every site. Unmapped procedures fail with a clear "not available on this site" error.
 * See docs/web-trpc.md.
 */

type RestRoute = {
  /** GET answers a query; any other method a mutation */
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path below NEXT_PUBLIC_EFFEKT_API, from the procedure input */
  path: (input: any) => string;
  /** The JSON request body, from the procedure input (mutations only) */
  body?: (input: any) => unknown;
  /** The procedure's output schema; parses the REST response's `content` */
  output: { parse: (data: unknown) => unknown };
};

/**
 * Procedure path → REST route. Keep in sync with apps/api/src/trpc/routers/minside.ts and
 * widget.ts. Of the mutations, the Danish backend only has the tax unit create and update routes;
 * saving the profile, deleting a tax unit and the Vipps/AvtaleGiro agreement changes are unmapped
 * (the Danish site edits its agreements through its own REST routes, see DKAgreementDetails). Of
 * the widget procedures, it only has the two public reads; the Danish widget registers donations
 * through its own REST code path (see Widget/store/widgetApi.ts), and has none of the Vipps or
 * AvtaleGiro widget routes. Of the site procedures, it has the results routes and
 * GET /fundraisers/:id (with UUID ids), but no LTV estimate.
 */
export const restRoutes: Record<string, RestRoute> = {
  "minside.profile": {
    method: "GET",
    path: (input: { donorId: number }) => `/donors/${input.donorId}/`,
    output: donorProfileOutput,
  },
  "minside.taxUnits": {
    method: "GET",
    path: (input: { donorId: number; locale?: string }) =>
      `/donors/${input.donorId}/taxunits/` +
      (input.locale ? `?locale=${encodeURIComponent(input.locale)}` : ""),
    output: taxUnitsOutput,
  },
  "minside.donationsAggregated": {
    method: "GET",
    path: (input: { donorId: number }) => `/donors/${input.donorId}/donations/aggregated`,
    output: donationsAggregatedOutput,
  },
  "minside.donations": {
    method: "GET",
    path: (input: { donorId: number }) => `/donors/${input.donorId}/donations/`,
    output: donationsOutput,
  },
  "minside.distributions": {
    method: "GET",
    path: (input: { donorId: number; kids?: string[] }) =>
      `/donors/${input.donorId}/distributions/` +
      (input.kids ? `?kids=${encodeURIComponent(input.kids.join(","))}` : ""),
    output: distributionsOutput,
  },
  "minside.createTaxUnit": {
    method: "POST",
    path: (input: { donorId: number }) => `/donors/${input.donorId}/taxunits`,
    body: (input: { name: string; ssn: string }) => ({ name: input.name, ssn: input.ssn }),
    output: changedTaxUnitOutput,
  },
  "minside.updateTaxUnit": {
    method: "PUT",
    path: (input: { donorId: number; taxUnitId: number }) =>
      `/donors/${input.donorId}/taxunits/${input.taxUnitId}`,
    body: (input: { name: string; ssn: string }) => ({
      taxUnit: { name: input.name, ssn: input.ssn },
    }),
    output: changedTaxUnitOutput,
  },
  "widget.causeAreas": {
    method: "GET",
    path: () => "/causeareas/all/",
    output: widgetCauseAreasOutput,
  },
  "widget.referralTypes": {
    method: "GET",
    path: () => "/referrals/types",
    output: widgetReferralTypesOutput,
  },
  "site.resultsHeadline": {
    method: "GET",
    path: () => "/results/headline",
    output: siteResultsHeadlineOutput,
  },
  "site.dailyDonations": {
    method: "GET",
    path: () => "/results/donations/daily",
    output: siteDailyDonationsOutput,
  },
  "site.referralSums": {
    method: "GET",
    path: () => "/results/referrals/sums",
    output: siteReferralSumsOutput,
  },
  "site.monthlyOutputs": {
    method: "GET",
    path: () => "/results/donations/monthly/outputs",
    output: siteMonthlyOutputsOutput,
  },
  "site.organizations": {
    method: "GET",
    path: () => "/organizations/all/",
    output: siteOrganizationsOutput,
  },
  "site.fundraiser": {
    method: "GET",
    path: (input: { id: string | number }) =>
      `/fundraisers/${encodeURIComponent(String(input.id))}`,
    output: siteFundraiserOutput,
  },
};

const codeForStatus = (status: number): TRPC_ERROR_CODE_KEY => {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    default:
      return "INTERNAL_SERVER_ERROR";
  }
};

/** An error shaped like a tRPC server error, so callers can read `err.data.httpStatus` either way */
const restError = (path: string, code: TRPC_ERROR_CODE_KEY, httpStatus: number, message: string) =>
  TRPCClientError.from<AnyRouter>({
    error: {
      code: TRPC_ERROR_CODES_BY_KEY[code],
      message,
      data: { code, httpStatus, path },
    },
  });

export type RestLinkOptions = {
  /** The REST API base URL (NEXT_PUBLIC_EFFEKT_API) */
  url: string;
  /** Returns the Auth0 access token sent as the bearer token; leave out for public calls */
  getToken?: () => Promise<string>;
  routes?: Record<string, RestRoute>;
  fetch?: typeof fetch;
};

export const restLink =
  <TRouter extends AnyRouter>({
    url,
    getToken,
    routes = restRoutes,
    fetch: fetchImpl,
  }: RestLinkOptions): TRPCLink<TRouter> =>
  () =>
  ({ op }) =>
    observable((observer) => {
      const route = Object.prototype.hasOwnProperty.call(routes, op.path)
        ? routes[op.path]
        : undefined;

      const run = async () => {
        const opType = route?.method === "GET" ? "query" : "mutation";
        if (!route || op.type !== opType) {
          throw restError(
            op.path,
            "NOT_IMPLEMENTED",
            501,
            `${op.path} is not available on this site`,
          );
        }
        const headers: Record<string, string> = getToken
          ? { Authorization: `Bearer ${await getToken()}` }
          : {};
        const init: RequestInit = { method: route.method, headers, signal: op.signal ?? undefined };
        if (route.body) {
          headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(route.body(op.input));
        }
        const response = await (fetchImpl ?? fetch)(url + route.path(op.input), init);
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof body?.content === "string"
              ? body.content
              : typeof body?.message === "string"
                ? body.message
                : `Request failed with status ${response.status}`;
          throw restError(op.path, codeForStatus(response.status), response.status, message);
        }
        try {
          return route.output.parse(body?.content);
        } catch (cause) {
          // An answer the schema rejects is the backend's fault, like a 5xx, so it gets an HTTP
          // status too (502): callers that treat an HTTP error as "no data" handle it the same way
          console.error("%s: unexpected response from the REST API", op.path, cause);
          throw restError(
            op.path,
            "INTERNAL_SERVER_ERROR",
            502,
            `${op.path}: unexpected response from the REST API`,
          );
        }
      };

      run().then(
        (data) => {
          observer.next({ result: { type: "data", data } });
          observer.complete();
        },
        (err) => observer.error(TRPCClientError.from<AnyRouter>(err)),
      );
    });
