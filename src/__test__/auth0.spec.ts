import { expect } from "chai";
import sinon from "sinon";
import {
  isUserRegisteredInAuth0,
  repointAuth0DonorIdOnMerge,
  resetAuth0TokenCache,
} from "../custom_modules/auth0";

describe("auth0 Management API helpers", function () {
  const sandbox = sinon.createSandbox();
  let fetchStub: sinon.SinonStub;

  const loserId = 100;
  const winnerId = 200;
  const loserEmail = "loser@overlookhotel.com";

  function jsonResponse(status: number, body: unknown, statusText = "OK") {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
  }

  function stubAuth0Calls(options: {
    users?: unknown[];
    usersStatus?: number;
    patchStatuses?: Record<string, number>;
  }) {
    fetchStub.callsFake(async (url: string, init?: RequestInit) => {
      const href = String(url);

      if (href.endsWith("/oauth/token")) {
        return jsonResponse(200, { access_token: "token", token_type: "Bearer", expires_in: 3600 });
      }

      if (href.includes("/users-by-email")) {
        return jsonResponse(options.usersStatus ?? 200, options.users ?? []);
      }

      const patchMatch = href.match(/\/api\/v2\/users\/(.+)$/);
      if (init?.method === "PATCH" && patchMatch) {
        const userId = decodeURIComponent(patchMatch[1]);
        const status = options.patchStatuses?.[userId] ?? 200;
        return jsonResponse(status, {}, status === 200 ? "OK" : "Error");
      }

      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${href}`);
    });
  }

  beforeEach(function () {
    process.env.AUTH0_CLIENT_ID = "test-client";
    process.env.AUTH0_CLIENT_SECRET = "test-secret";
    resetAuth0TokenCache();
    fetchStub = sandbox.stub(globalThis, "fetch");
    sandbox.stub(console, "error");
    sandbox.stub(console, "warn");
    sandbox.stub(console, "log");
  });

  afterEach(function () {
    sandbox.restore();
    resetAuth0TokenCache();
  });

  describe("isUserRegisteredInAuth0", function () {
    it("returns true when Auth0 has a user for the email", async function () {
      stubAuth0Calls({
        users: [{ user_id: "auth0|1", email: loserEmail, email_verified: true }],
      });

      expect(await isUserRegisteredInAuth0(loserEmail)).to.equal(true);
    });

    it("returns false when the lookup fails", async function () {
      stubAuth0Calls({ usersStatus: 500 });

      expect(await isUserRegisteredInAuth0(loserEmail)).to.equal(false);
    });
  });

  describe("repointAuth0DonorIdOnMerge", function () {
    it("does nothing when no Auth0 user exists for the loser email", async function () {
      stubAuth0Calls({ users: [] });

      const result = await repointAuth0DonorIdOnMerge(loserId, winnerId, loserEmail);

      expect(result).to.deep.equal({ updated: [], skipped: [] });
      expect(
        fetchStub.getCalls().some((call) => String(call.args[1]?.method) === "PATCH"),
      ).to.equal(false);
    });

    it("PATCHes users whose metadata still has the loser donor id", async function () {
      stubAuth0Calls({
        users: [
          {
            user_id: "auth0|abc",
            email: loserEmail,
            email_verified: true,
            user_metadata: { "gieffektivt-user-id": loserId },
          },
        ],
      });

      const result = await repointAuth0DonorIdOnMerge(loserId, winnerId, loserEmail);

      expect(result.updated).to.deep.equal(["auth0|abc"]);
      expect(result.skipped).to.deep.equal([]);

      const patchCall = fetchStub.getCalls().find((call) => call.args[1]?.method === "PATCH");
      expect(patchCall).to.not.equal(undefined);
      expect(String(patchCall.args[0])).to.equal(
        "https://gieffektivt.eu.auth0.com/api/v2/users/auth0%7Cabc",
      );
      expect(JSON.parse(String(patchCall.args[1].body))).to.deep.equal({
        user_metadata: { "gieffektivt-user-id": winnerId },
      });
    });

    it("treats a string metadata donor id as a match", async function () {
      stubAuth0Calls({
        users: [
          {
            user_id: "auth0|string-id",
            email: loserEmail,
            email_verified: true,
            user_metadata: { "gieffektivt-user-id": String(loserId) },
          },
        ],
      });

      const result = await repointAuth0DonorIdOnMerge(loserId, winnerId, loserEmail);

      expect(result.updated).to.deep.equal(["auth0|string-id"]);
    });

    it("skips users that do not have the loser donor id", async function () {
      stubAuth0Calls({
        users: [
          {
            user_id: "google-oauth2|other",
            email: loserEmail,
            email_verified: true,
            user_metadata: { "gieffektivt-user-id": 999 },
          },
          {
            user_id: "auth0|no-meta",
            email: loserEmail,
            email_verified: true,
          },
        ],
      });

      const result = await repointAuth0DonorIdOnMerge(loserId, winnerId, loserEmail);

      expect(result.updated).to.deep.equal([]);
      expect(result.skipped).to.deep.equal(["google-oauth2|other", "auth0|no-meta"]);
      expect(
        fetchStub.getCalls().some((call) => String(call.args[1]?.method) === "PATCH"),
      ).to.equal(false);
    });

    it("updates only the matching identity when several Auth0 users share an email", async function () {
      stubAuth0Calls({
        users: [
          {
            user_id: "auth0|password",
            email: loserEmail,
            email_verified: true,
            user_metadata: { "gieffektivt-user-id": loserId },
          },
          {
            user_id: "google-oauth2|winner-already",
            email: loserEmail,
            email_verified: true,
            user_metadata: { "gieffektivt-user-id": winnerId },
          },
        ],
      });

      const result = await repointAuth0DonorIdOnMerge(loserId, winnerId, loserEmail);

      expect(result.updated).to.deep.equal(["auth0|password"]);
      expect(result.skipped).to.deep.equal(["google-oauth2|winner-already"]);
    });

    it("does not throw when the Management API lookup fails", async function () {
      stubAuth0Calls({ usersStatus: 503 });

      const result = await repointAuth0DonorIdOnMerge(loserId, winnerId, loserEmail);

      expect(result).to.deep.equal({ updated: [], skipped: [] });
    });

    it("continues when a PATCH fails", async function () {
      stubAuth0Calls({
        users: [
          {
            user_id: "auth0|fail",
            email: loserEmail,
            email_verified: true,
            user_metadata: { "gieffektivt-user-id": loserId },
          },
          {
            user_id: "auth0|ok",
            email: loserEmail,
            email_verified: true,
            user_metadata: { "gieffektivt-user-id": loserId },
          },
        ],
        patchStatuses: { "auth0|fail": 403, "auth0|ok": 200 },
      });

      const result = await repointAuth0DonorIdOnMerge(loserId, winnerId, loserEmail);

      expect(result.updated).to.deep.equal(["auth0|ok"]);
    });

    it("skips the lookup when the loser has no email", async function () {
      const result = await repointAuth0DonorIdOnMerge(loserId, winnerId, "");

      expect(result).to.deep.equal({ updated: [], skipped: [] });
      expect(fetchStub.called).to.equal(false);
    });
  });
});
