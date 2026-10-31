/**
 * Helpers for the website's tRPC requests (lib/trpc, docs/web-trpc.md). httpBatchLink (Min Side)
 * sends `GET /trpc/<path>?batch=1&input=…`, or `GET /trpc/<a>,<b>?batch=1&input=…` for calls made
 * in the same tick, and the response has one entry per path, in order. The donation widget's
 * httpLink never batches: `GET /trpc/<path>?input=…` or `POST /trpc/<path>` with the input as the
 * body, answered with a single `{ result: { data } }` or `{ error }`.
 */

/**
 * URL matchers per procedure: the path alone or anywhere in a batch's path list. Literal regexes
 * (no `new RegExp(path)`); add a procedure here when a test stubs or waits on it.
 */
const TRPC_URLS = {
  "minside.profile": /\/trpc\/(?:[^/?]*,)?minside\.profile(?:,[^/?]*)?(?:\?|$)/,
  "minside.taxUnits": /\/trpc\/(?:[^/?]*,)?minside\.taxUnits(?:,[^/?]*)?(?:\?|$)/,
  "minside.donationsAggregated":
    /\/trpc\/(?:[^/?]*,)?minside\.donationsAggregated(?:,[^/?]*)?(?:\?|$)/,
  "minside.donations": /\/trpc\/(?:[^/?]*,)?minside\.donations(?:,[^/?]*)?(?:\?|$)/,
  "minside.distributions": /\/trpc\/(?:[^/?]*,)?minside\.distributions(?:,[^/?]*)?(?:\?|$)/,
  "minside.vippsAgreements": /\/trpc\/(?:[^/?]*,)?minside\.vippsAgreements(?:,[^/?]*)?(?:\?|$)/,
  "minside.avtaleGiroAgreements":
    /\/trpc\/(?:[^/?]*,)?minside\.avtaleGiroAgreements(?:,[^/?]*)?(?:\?|$)/,
  "minside.taxReports": /\/trpc\/(?:[^/?]*,)?minside\.taxReports(?:,[^/?]*)?(?:\?|$)/,
  // The donation widget (httpLink, never batched)
  "widget.causeAreas": /\/trpc\/widget\.causeAreas(?:\?|$)/,
  "widget.referralTypes": /\/trpc\/widget\.referralTypes(?:\?|$)/,
  "widget.registerDonation": /\/trpc\/widget\.registerDonation(?:\?|$)/,
  "widget.registerBankPending": /\/trpc\/widget\.registerBankPending(?:\?|$)/,
  "widget.submitReferral": /\/trpc\/widget\.submitReferral(?:\?|$)/,
  "widget.draftVippsAgreement": /\/trpc\/widget\.draftVippsAgreement(?:\?|$)/,
  "widget.draftAvtaleGiro": /\/trpc\/widget\.draftAvtaleGiro(?:\?|$)/,
  // Public site reads (httpLink, never batched)
  "site.resultsHeadline": /\/trpc\/site\.resultsHeadline(?:\?|$)/,
  "site.fundraiser": /\/trpc\/site\.fundraiser(?:\?|$)/,
  "site.ltvEstimate": /\/trpc\/site\.ltvEstimate(?:\?|$)/,
  "site.organizations": /\/trpc\/site\.organizations(?:\?|$)/,
  // Mutations (POST /trpc/<path>?batch=1, the input in the body as {"0": input})
  "minside.updateProfile": /\/trpc\/(?:[^/?]*,)?minside\.updateProfile(?:,[^/?]*)?(?:\?|$)/,
  "minside.createTaxUnit": /\/trpc\/(?:[^/?]*,)?minside\.createTaxUnit(?:,[^/?]*)?(?:\?|$)/,
  "minside.updateTaxUnit": /\/trpc\/(?:[^/?]*,)?minside\.updateTaxUnit(?:,[^/?]*)?(?:\?|$)/,
  "minside.deleteTaxUnit": /\/trpc\/(?:[^/?]*,)?minside\.deleteTaxUnit(?:,[^/?]*)?(?:\?|$)/,
  "minside.cancelVippsAgreement":
    /\/trpc\/(?:[^/?]*,)?minside\.cancelVippsAgreement(?:,[^/?]*)?(?:\?|$)/,
  "minside.updateVippsAgreementPrice":
    /\/trpc\/(?:[^/?]*,)?minside\.updateVippsAgreementPrice(?:,[^/?]*)?(?:\?|$)/,
  "minside.updateVippsAgreementChargeDay":
    /\/trpc\/(?:[^/?]*,)?minside\.updateVippsAgreementChargeDay(?:,[^/?]*)?(?:\?|$)/,
  "minside.updateVippsAgreementDistribution":
    /\/trpc\/(?:[^/?]*,)?minside\.updateVippsAgreementDistribution(?:,[^/?]*)?(?:\?|$)/,
  "minside.updateAvtaleGiroAmount":
    /\/trpc\/(?:[^/?]*,)?minside\.updateAvtaleGiroAmount(?:,[^/?]*)?(?:\?|$)/,
  "minside.updateAvtaleGiroPaymentDate":
    /\/trpc\/(?:[^/?]*,)?minside\.updateAvtaleGiroPaymentDate(?:,[^/?]*)?(?:\?|$)/,
  "minside.updateAvtaleGiroDistribution":
    /\/trpc\/(?:[^/?]*,)?minside\.updateAvtaleGiroDistribution(?:,[^/?]*)?(?:\?|$)/,
  "minside.cancelAvtaleGiroAgreement":
    /\/trpc\/(?:[^/?]*,)?minside\.cancelAvtaleGiroAgreement(?:,[^/?]*)?(?:\?|$)/,
};

/** Matches a tRPC request URL that includes `path`, alone or batched with other procedures */
export const trpcUrl = (path) => {
  if (!Object.prototype.hasOwnProperty.call(TRPC_URLS, path)) {
    throw new Error(`No URL matcher for ${path}: add it to TRPC_URLS in cypress/support/trpc.js`);
  }
  return TRPC_URLS[path];
};

/** Whether a tRPC request is a batch (httpBatchLink) rather than a single call (httpLink) */
export const isTrpcBatch = (url) => new URL(url).searchParams.get("batch") === "1";

/** The procedure paths of a tRPC request URL, in batch order */
export const trpcPaths = (url) =>
  decodeURIComponent(new URL(url).pathname.replace(/^.*\/trpc\//, "")).split(",");

/** The input of `path` in an intercepted tRPC mutation (POST) request */
export const trpcInput = (interception, path) => {
  const index = trpcPaths(interception.request.url).indexOf(path);
  expect(index, `${path} in ${interception.request.url}`).to.be.at.least(0);
  const body = interception.request.body;
  const parsed = typeof body === "string" ? JSON.parse(body) : body;
  return isTrpcBatch(interception.request.url) ? parsed[index] : parsed;
};

/** The error `path` returned in an intercepted tRPC response */
export const trpcError = (interception, path) => {
  const index = trpcPaths(interception.request.url).indexOf(path);
  expect(index, `${path} in ${interception.request.url}`).to.be.at.least(0);
  const entry = isTrpcBatch(interception.request.url)
    ? interception.response.body[index]
    : interception.response.body;
  expect(entry, `${path} response`).to.have.property("error");
  return entry.error;
};

/** The data `path` returned in an intercepted tRPC response, failing if it returned an error */
export const trpcData = (interception, path) => {
  const index = trpcPaths(interception.request.url).indexOf(path);
  expect(index, `${path} in ${interception.request.url}`).to.be.at.least(0);
  const entry = isTrpcBatch(interception.request.url)
    ? interception.response.body[index]
    : interception.response.body;
  expect(entry, `${path} response`).to.have.property("result");
  return entry.result.data;
};
