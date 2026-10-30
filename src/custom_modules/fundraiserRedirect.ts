const config = require("../config");

const FRONTEND_ORIGIN = "https://gieffektivt.no";

/**
 * Revalidates a fundraiser page on the frontend and returns the URL the donor's browser
 * should be redirected to.
 *
 * The frontend endpoint /api/fundraiser/redirect requires REVALIDATE_TOKEN. Previously the
 * donor's browser was redirected to that endpoint with the token in the query string, which
 * exposed the token to every client (browser history, logs, Referer). Instead we call the
 * endpoint server-side, without following its redirect, and send the browser to the
 * Location it returns (the fundraiser page).
 *
 * Never throws. Falls back to `fallbackUrl` if revalidation fails.
 */
export async function getFundraiserRedirectUrl(
  fundraiserId: number | string,
  plausible: string,
  fallbackUrl: string,
): Promise<string> {
  try {
    const url =
      `${FRONTEND_ORIGIN}/api/fundraiser/redirect` +
      `?fundraiserId=${encodeURIComponent(String(fundraiserId))}` +
      `&secret=${encodeURIComponent(config.revalidate_token ?? "")}` +
      `&plausible=${plausible}`;

    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      const target = new URL(location, FRONTEND_ORIGIN);
      // Only ever redirect donors to our own frontend
      if (target.origin === FRONTEND_ORIGIN) {
        return target.toString();
      }
    }

    console.error(
      `Fundraiser revalidation for fundraiser ${fundraiserId} returned status ${response.status}`,
    );
  } catch (ex) {
    console.error("Fundraiser revalidation for fundraiser %s failed", fundraiserId, ex);
  }
  return fallbackUrl;
}
