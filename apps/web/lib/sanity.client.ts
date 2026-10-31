import { createClient, SanityClient } from "@sanity/client";
import { getClientConfig } from "./config";

// Server-only: client bundles get ./sanity.client.browser.ts instead, through the
// "browser" field in package.json, so @sanity/client stays out of the JS that
// ordinary visitors load. The live preview client is created in PreviewProvider.

// During `next build`, pages fetch much the same content (navigation, footer, site settings) over
// and over. Each answer is kept for the rest of that build: in memory, with one request in flight
// per query, and in a directory every static generation worker shares (SANITY_BUILD_CACHE_DIR,
// which next.config.ts creates afresh for each build under .next/cache/sanity-fetch). Nothing is
// ever served from an earlier build, at runtime, or to a preview (draft) client.
const BUILD_CACHE_DIR =
  process.env.NEXT_PHASE === "phase-production-build"
    ? process.env.SANITY_BUILD_CACHE_DIR
    : undefined;

const inProcess: Map<string, Promise<any>> = new Map();

export function getClient(previewToken?: string): SanityClient {
  const config = getClientConfig(previewToken);
  const client = createClient(config);
  if (!BUILD_CACHE_DIR || previewToken) return client;

  const dir = BUILD_CACHE_DIR;
  const originalFetch = client.fetch.bind(client);
  client.fetch = function buildCachedFetch(query: string, params?: any, options?: any) {
    const key = JSON.stringify([
      config.projectId,
      config.dataset,
      config.apiVersion,
      config.perspective,
      query,
      params ?? {},
      options ?? {},
    ]);
    let answer = inProcess.get(key);
    if (!answer) {
      answer = sharedFetch(dir, key, () => originalFetch(query, params, options));
      inProcess.set(key, answer);
      // A failed fetch is not kept: the next caller tries again
      answer.catch(() => inProcess.delete(key));
    }
    return answer;
  } as SanityClient["fetch"];

  return client;
}

/** The answer from the build's shared directory, else fetched and written there */
async function sharedFetch(dir: string, key: string, fetch: () => Promise<any>): Promise<any> {
  const { createHash } = await import("node:crypto");
  const { mkdir, readFile, rename, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  // turbopackIgnore: the file tracer would otherwise take this for any .json file in the app
  // and copy them all into the server functions
  const file = join(
    /* turbopackIgnore: true */ dir,
    createHash("sha256").update(key).digest("hex") + ".json",
  );
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    // Not fetched yet by any worker (or not readable): fetch it here
  }
  const result = await fetch();
  try {
    // Written under a temporary name, then renamed: other workers never read half a file
    const temporary = `${file}.${process.pid}.tmp`;
    await mkdir(dir, { recursive: true });
    await writeFile(temporary, JSON.stringify(result));
    await rename(temporary, file);
  } catch (error) {
    console.warn("Sanity build cache: could not write an answer", error);
  }
  return result;
}
