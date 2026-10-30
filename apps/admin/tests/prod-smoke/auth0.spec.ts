import { expect, test, type Page } from "@playwright/test";
import { smokeAuth } from "../../playwright.prod-smoke.config";

/**
 * The production build with Auth0, signed out. The first production load crashed every page
 * ("reading 'isAuthenticated'") while Auth0 restored the session; nothing else runs this mode.
 */

type Watch = { errors: string[]; authRequests: string[] };

async function watch(page: Page, { tokenExchange }: { tokenExchange?: "fail" } = {}) {
  const seen: Watch = { errors: [], authRequests: [] };
  page.on("pageerror", (error) => seen.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") seen.errors.push(message.text());
  });
  // Nothing may reach the fake tenant or API unstubbed.
  await page.route(`https://${smokeAuth.domain}/**`, async (route) => {
    const url = new URL(route.request().url());
    seen.authRequests.push(`${route.request().method()} ${url.pathname}`);
    if (tokenExchange === "fail" && url.pathname === "/oauth/token") {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid authorization code",
        }),
      });
      return;
    }
    await route.abort();
  });
  await page.route("https://api.smoke.test/**", (route) => route.abort());
  return seen;
}

async function expectSignIn(page: Page, seen: Watch) {
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to sign in" })).toBeEnabled();
  expect(seen.errors).toEqual([]);
}

test("the home page reaches sign-in", async ({ page }) => {
  const seen = await watch(page);
  await page.goto("/");
  await expectSignIn(page, seen);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a deep link reaches sign-in and keeps where it was going", async ({ page }) => {
  const seen = await watch(page);
  await page.goto("/donors/12");
  await expectSignIn(page, seen);
  expect(new URL(page.url()).searchParams.get("redirect")).toBe("/donors/12");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a failed callback shows sign-in with the error, not a crash", async ({ page, baseURL }) => {
  const seen = await watch(page, { tokenExchange: "fail" });
  // The transaction auth0-spa-js stored before redirecting to the tenant.
  await page.addInitScript(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: `a0.spajs.txs.${smokeAuth.clientId}`,
    value: {
      state: "y",
      nonce: "n",
      code_verifier: "v",
      redirect_uri: baseURL,
      audience: smokeAuth.audience,
      scope: "openid profile email offline_access",
      appState: { returnTo: "/donors/12" },
    },
  });
  await page.goto("/?code=x&state=y");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Sign-in failed");
  expect(seen.authRequests).toContain("POST /oauth/token");
  // The browser logs the stubbed 403 itself; anything else is ours.
  expect(seen.errors.filter((e) => !/status of 403/.test(e))).toEqual([]);
});
