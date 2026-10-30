/**
 * Helpers for the website's tRPC requests (lib/trpc, docs/web-trpc.md). httpBatchLink sends
 * `GET /trpc/<path>?batch=1&input=…`, or `GET /trpc/<a>,<b>?batch=1&input=…` for calls made in the
 * same tick, and the response has one entry per path, in order.
 */

/** Matches a tRPC request URL that includes `path`, alone or batched with other procedures */
export const trpcUrl = (path) => {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`/trpc/(?:[^/?]*,)?${escaped}(?:,[^/?]*)?(?:\\?|$)`);
};

/** The procedure paths of a tRPC request URL, in batch order */
export const trpcPaths = (url) =>
  decodeURIComponent(new URL(url).pathname.replace(/^.*\/trpc\//, "")).split(",");

/** The data `path` returned in an intercepted tRPC response, failing if it returned an error */
export const trpcData = (interception, path) => {
  const index = trpcPaths(interception.request.url).indexOf(path);
  expect(index, `${path} in ${interception.request.url}`).to.be.at.least(0);
  const entry = interception.response.body[index];
  expect(entry, `${path} response`).to.have.property("result");
  return entry.result.data;
};
