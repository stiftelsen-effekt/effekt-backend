/**
 * Helpers for the website's tRPC requests (lib/trpc, docs/web-trpc.md). httpBatchLink sends
 * `GET /trpc/<path>?batch=1&input=…`, or `GET /trpc/<a>,<b>?batch=1&input=…` for calls made in the
 * same tick, and the response has one entry per path, in order.
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
  "minside.autoGiroAgreements":
    /\/trpc\/(?:[^/?]*,)?minside\.autoGiroAgreements(?:,[^/?]*)?(?:\?|$)/,
  "minside.taxReports": /\/trpc\/(?:[^/?]*,)?minside\.taxReports(?:,[^/?]*)?(?:\?|$)/,
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

/** The procedure paths of a tRPC request URL, in batch order */
export const trpcPaths = (url) =>
  decodeURIComponent(new URL(url).pathname.replace(/^.*\/trpc\//, "")).split(",");

/** The input of `path` in an intercepted tRPC mutation (POST) request */
export const trpcInput = (interception, path) => {
  const index = trpcPaths(interception.request.url).indexOf(path);
  expect(index, `${path} in ${interception.request.url}`).to.be.at.least(0);
  const body = interception.request.body;
  return (typeof body === "string" ? JSON.parse(body) : body)[index];
};

/** The error `path` returned in an intercepted tRPC response */
export const trpcError = (interception, path) => {
  const index = trpcPaths(interception.request.url).indexOf(path);
  expect(index, `${path} in ${interception.request.url}`).to.be.at.least(0);
  const entry = interception.response.body[index];
  expect(entry, `${path} response`).to.have.property("error");
  return entry.error;
};

/** The data `path` returned in an intercepted tRPC response, failing if it returned an error */
export const trpcData = (interception, path) => {
  const index = trpcPaths(interception.request.url).indexOf(path);
  expect(index, `${path} in ${interception.request.url}`).to.be.at.least(0);
  const entry = interception.response.body[index];
  expect(entry, `${path} response`).to.have.property("result");
  return entry.result.data;
};
