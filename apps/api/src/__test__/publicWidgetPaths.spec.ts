import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import crypto from "crypto";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import { DAO } from "../custom_modules/DAO";
import * as mail from "../custom_modules/mail";
import {
  createRegistrationToken,
  registrationFor,
  REGISTRATION_TOKEN_TTL_MS,
  verifyRegistrationToken,
} from "../custom_modules/registrationToken";
import { createPublicMutationLimiter } from "../middleware/publicMutationRateLimit";
import { mountTrpc } from "../trpc/express";
import methods from "../enums/methods";

const config = require("../config");
const vipps = require("../custom_modules/vipps");

/** An app like server.ts: JSON bodies with the raw body kept for webhook signatures */
const appWith = (path: string, router: express.Router) => {
  const app = express();
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString();
      },
    }),
  );
  app.use(path, router);
  app.use((err, req, res, _next) => res.status(err.status ?? 500).end());
  return app;
};

describe("public widget paths", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("registration tokens", () => {
    const claims = { kid: "12345678", method: methods.AVTALEGIRO, donorId: 42, amount: 300 };

    it("round-trips its claims until it expires", () => {
      const now = Date.parse("2026-10-30T12:00:00Z");
      const token = createRegistrationToken(claims, now);
      expect(verifyRegistrationToken(token, now)).to.deep.equal({
        ...claims,
        exp: now + REGISTRATION_TOKEN_TTL_MS,
      });
      expect(verifyRegistrationToken(token, now + REGISTRATION_TOKEN_TTL_MS + 1)).to.equal(null);
    });

    it("is only good for its KID and method", () => {
      const token = createRegistrationToken(claims);
      expect(registrationFor(token, "12345678", [methods.AVTALEGIRO])).to.not.equal(null);
      expect(registrationFor(token, "12345679", [methods.AVTALEGIRO])).to.equal(null);
      expect(registrationFor(token, "12345678", [methods.BANK, methods.VIPPS])).to.equal(null);
    });

    it("refuses tokens not signed with the key", () => {
      const token = createRegistrationToken(claims);
      const [version, payload] = token.split(".");
      // nosemgrep: javascript.lang.security.audit.hardcoded-hmac-key.hardcoded-hmac-key -- a wrong key on purpose, to forge a signature the API must refuse
      const forged = crypto.createHmac("sha256", "guess").update(`${version}.${payload}`);
      for (const bad of [
        `${version}.${payload}.${forged.digest("base64url")}`,
        `${version}.${payload}.`,
        `v2.${payload}.${token.split(".")[2]}`,
        token + "x",
        "",
        null,
        { kid: "12345678" },
      ]) {
        expect(verifyRegistrationToken(bad)).to.equal(null);
      }
    });

    it("uses WIDGET_REGISTRATION_TOKEN_SECRET when it is set", () => {
      const token = createRegistrationToken(claims);
      sinon.stub(config, "widget_registration_token_secret").value("another key");
      expect(verifyRegistrationToken(token)).to.equal(null);
      expect(verifyRegistrationToken(createRegistrationToken(claims))).to.not.equal(null);
    });
  });

  describe("GET /avtalegiro/:KID/redirect", () => {
    let app: express.Express;
    let send: sinon.SinonStub;
    let claim: sinon.SinonStub;

    beforeEach(() => {
      app = appWith("/avtalegiro", require("../routes/avtalegiro"));
      sinon
        .stub(DAO.avtalegiroagreements, "getByKID")
        .resolves({ id: 1, KID: "12345678", amount: 30000, paymentDate: 20, notice: true });
      sinon.stub(DAO.fundraisers, "getFundraiserTransactionByKID").resolves(null);
      claim = sinon.stub(DAO.avtalegiroagreements, "claimRegisteredMail");
      claim.onFirstCall().resolves(true);
      claim.resolves(false);
      send = sinon.stub(mail, "sendAvtalegiroRegistered").resolves();
    });

    it("sends the registered email the first time only", async () => {
      for (let i = 0; i < 3; i++) {
        const res = await request(app).get("/avtalegiro/12345678/redirect?status=OK").expect(302);
        expect(res.headers.location).to.match(/^https:\/\/gieffektivt\.no\/opprettet\?plausible=/);
      }
      expect(send.calledOnce).to.equal(true);
      expect(claim.alwaysCalledWith("12345678")).to.equal(true);
    });

    it("sends nothing for a KID without an agreement", async () => {
      (DAO.avtalegiroagreements.getByKID as sinon.SinonStub).resolves(null);
      const res = await request(app).get("/avtalegiro/999/redirect?status=OK").expect(302);
      expect(res.headers.location).to.equal("https://gieffektivt.no/avtale-feilet");
      expect(claim.called).to.equal(false);
      expect(send.called).to.equal(false);
    });
  });

  describe("POST /mail/mailersend/security/sanitynotification", () => {
    const secret = "sanity-test-secret";
    let app: express.Express;
    let send: sinon.SinonStub;
    const body = {
      document: "bank",
      sanityUser: "p-user",
      fields: [
        { name: "kontonr", prev: "1234.56.78903", new: "9876.54.32101" },
        { name: "account_number", prev: null, new: null },
      ],
    };

    const sign = (raw: string, timestamp = Date.now(), key = secret) =>
      `t=${timestamp},v1=${crypto
        .createHmac("sha256", key)
        .update(`${timestamp}.${raw}`)
        .digest("base64url")}`;

    beforeEach(() => {
      sinon.stub(config, "sanity_security_webhook_secret").value(secret);
      app = appWith("/mail", require("../routes/mail"));
      send = sinon.stub(mail, "sendSanitySecurityNotice").resolves(true as any);
    });

    const post = (signature?: string, payload: unknown = body) => {
      const raw = JSON.stringify(payload);
      const req = request(app)
        .post("/mail/mailersend/security/sanitynotification")
        .set("Content-Type", "application/json");
      if (signature !== undefined) req.set("sanity-webhook-signature", signature);
      return req.send(raw);
    };

    it("sends the notice for a signed webhook, with only the changed fields", async () => {
      await post(sign(JSON.stringify(body))).expect(200);
      expect(send.calledOnce).to.equal(true);
      expect(send.firstCall.args[0]).to.deep.equal({
        document: "bank",
        sanityUser: "p-user",
        fields: [{ name: "kontonr", prev: "1234.56.78903", new: "9876.54.32101" }],
      });
    });

    for (const [what, signature] of [
      ["no signature", undefined],
      ["a signature with another key", sign(JSON.stringify(body), Date.now(), "wrong")],
      ["a signature of another body", sign(JSON.stringify({ ...body, document: "x" }))],
      ["an old signature", sign(JSON.stringify(body), Date.now() - 10 * 60 * 1000)],
      ["a malformed signature", "v1=abc"],
    ] as Array<[string, string | undefined]>) {
      it(`refuses ${what}`, async () => {
        await post(signature).expect(401);
        expect(send.called).to.equal(false);
      });
    }

    it("refuses everything when the secret is not configured", async () => {
      sinon.stub(config, "sanity_security_webhook_secret").value(undefined);
      await post(sign(JSON.stringify(body))).expect(401);
      expect(send.called).to.equal(false);
    });
  });

  describe("Vipps REST routes", () => {
    let app: express.Express;

    beforeEach(() => {
      app = appWith("/vipps", require("../routes/vipps"));
    });

    it("need an admin token for the Vipps API passthrough routes", async () => {
      const getAgreements = sinon.stub(vipps, "getAgreements").resolves([]);
      const createCharge = sinon.stub(vipps, "createCharge").resolves({});
      const refundOrder = sinon.stub(vipps, "refundOrder").resolves(true);
      await request(app).get("/vipps/agreement/agr_1").expect(401);
      await request(app)
        .post("/vipps/agreement/charge/create")
        .send({ agreementId: "agr_1", amount: 1 })
        .expect(401);
      await request(app).post("/vipps/refund/order-1").expect(401);
      expect(getAgreements.called || createCharge.called || refundOrder.called).to.equal(false);
    });

    it("no longer take problem reports", async () => {
      const report = sinon.stub(mail, "sendVippsProblemReport").resolves(true);
      await request(app)
        .post("/vipps/agreement/report/problem")
        .send({ email: "a@b.no", donorMessage: "x" })
        .expect(404);
      expect(report.called).to.equal(false);
    });
  });

  describe("public mutation rate limit", () => {
    it("limits the widget's tRPC mutations per IP, with a tRPC error", async () => {
      const app = express();
      mountTrpc(app, { publicMutationLimiter: createPublicMutationLimiter(2) });
      const send = sinon.stub(mail, "sendDonationRegistered").resolves(true);
      const input = { KID: "12345", sum: 100, registrationToken: "x" };

      await request(app).post("/trpc/widget.registerBankPending").send(input).expect(400);
      await request(app).post("/trpc/widget.registerBankPending").send(input).expect(400);
      const res = await request(app)
        .post("/trpc/widget.registerBankPending")
        .send(input)
        .expect(429);
      expect(res.body.error.data).to.deep.equal({ code: "TOO_MANY_REQUESTS", httpStatus: 429 });
      expect(send.called).to.equal(false);
    });

    it("doesn't count the widget's queries", async () => {
      const app = express();
      mountTrpc(app, { publicMutationLimiter: createPublicMutationLimiter(1) });
      sinon.stub(DAO.referrals, "getTypes").resolves([]);
      for (let i = 0; i < 3; i++) {
        await request(app).get("/trpc/widget.referralTypes").expect(200);
      }
    });
  });
});
