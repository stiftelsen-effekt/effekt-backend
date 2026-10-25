import { expect } from "chai";
import crypto from "crypto";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import { DAO } from "../custom_modules/DAO";
import * as mail from "../custom_modules/mail";

const config = require("../config");

function buildServer(mountPath: string, routerPath: string) {
  const app = express();
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString();
      },
    }),
  );
  delete require.cache[require.resolve(routerPath)];
  const mod = require(routerPath);
  app.use(mountPath, mod.default || mod);
  return app;
}

describe("webhook authentication", () => {
  afterEach(() => sinon.restore());

  describe("POST /logging/auth0", () => {
    let sendStub: sinon.SinonStub;
    let app: express.Express;
    const body = {
      logs: [{ data: { type: "fcpr", details: { body: { email: "victim@example.test" } } } }],
    };

    beforeEach(() => {
      sendStub = sinon.stub(mail, "sendPasswordResetNoUserEmail").resolves();
      app = buildServer("/logging", "../routes/logging");
    });

    it("rejects requests when the token is not configured", async () => {
      sinon.stub(config, "auth0_log_stream_token").value(undefined);
      await request(app)
        .post("/logging/auth0")
        .set("Authorization", "anything")
        .send(body)
        .expect(401);
      expect(sendStub.called).to.be.false;
    });

    it("rejects requests without the correct token", async () => {
      sinon.stub(config, "auth0_log_stream_token").value("s3cret");
      await request(app).post("/logging/auth0").send(body).expect(401);
      await request(app)
        .post("/logging/auth0")
        .set("Authorization", "Bearer wrong")
        .send(body)
        .expect(401);
      expect(sendStub.called).to.be.false;
    });

    it("accepts requests with the token, raw or as Bearer", async () => {
      sinon.stub(config, "auth0_log_stream_token").value("s3cret");
      await request(app)
        .post("/logging/auth0")
        .set("Authorization", "s3cret")
        .send(body)
        .expect(200);
      await request(app)
        .post("/logging/auth0")
        .set("Authorization", "Bearer s3cret")
        .send(body)
        .expect(200);
      expect(sendStub.callCount).to.equal(2);
      expect(sendStub.firstCall.args[0]).to.equal("victim@example.test");
    });
  });

  describe("POST /donors/auth0/register", () => {
    let lookupStub: sinon.SinonStub;
    let addStub: sinon.SinonStub;
    let app: express.Express;
    const body = { email: "new@example.test" };

    beforeEach(() => {
      lookupStub = sinon.stub(DAO.donors, "getIDbyEmail").resolves(42);
      addStub = sinon.stub(DAO.donors, "add").resolves(43);
      app = buildServer("/donors", "../routes/donors");
    });

    it("allows requests when the token is not configured (Swedish API)", async () => {
      sinon.stub(config, "auth0_register_token").value(undefined);
      await request(app).post("/donors/auth0/register").send(body).expect(200);
      expect(lookupStub.calledOnce).to.be.true;
    });

    it("rejects requests without the correct token", async () => {
      sinon.stub(config, "auth0_register_token").value("s3cret");
      await request(app).post("/donors/auth0/register").send(body).expect(401);
      await request(app)
        .post("/donors/auth0/register")
        .set("Authorization", "Bearer wrong")
        .send(body)
        .expect(401);
      expect(lookupStub.called).to.be.false;
      expect(addStub.called).to.be.false;
    });

    it("returns the donor ID with the correct token", async () => {
      sinon.stub(config, "auth0_register_token").value("s3cret");
      const res = await request(app)
        .post("/donors/auth0/register")
        .set("Authorization", "Bearer s3cret")
        .send(body)
        .expect(200);
      expect(res.body.content).to.equal(42);
      expect(addStub.called).to.be.false;
    });
  });

  describe("POST /mail/mailersend/survey/response", () => {
    let saveStub: sinon.SinonStub;
    let app: express.Express;
    const payload = JSON.stringify({ data: { recipient: "x@example.test" } });

    beforeEach(() => {
      saveStub = sinon.stub(DAO.mail, "saveMailerSendSurveyResponse").resolves();
      sinon.stub(DAO.donors, "getIDbyEmail").resolves(1);
      app = buildServer("/mail", "../routes/mail");
    });

    const sign = (secret: string, raw: string) =>
      crypto.createHmac("sha256", secret).update(raw).digest("hex");

    it("rejects unsigned requests", async () => {
      sinon.stub(config, "mailersend_survey_webhook_secret").value("whsec");
      await request(app)
        .post("/mail/mailersend/survey/response")
        .set("Content-Type", "application/json")
        .send(payload)
        .expect(401);
      expect(saveStub.called).to.be.false;
    });

    it("rejects requests with a wrong signature", async () => {
      sinon.stub(config, "mailersend_survey_webhook_secret").value("whsec");
      await request(app)
        .post("/mail/mailersend/survey/response")
        .set("Content-Type", "application/json")
        .set("Signature", sign("other", payload))
        .send(payload)
        .expect(401);
    });

    it("rejects all requests when the secret is not configured", async () => {
      sinon.stub(config, "mailersend_survey_webhook_secret").value(undefined);
      await request(app)
        .post("/mail/mailersend/survey/response")
        .set("Content-Type", "application/json")
        .set("Signature", sign("", payload))
        .send(payload)
        .expect(401);
    });

    it("accepts correctly signed requests", async () => {
      sinon.stub(config, "mailersend_survey_webhook_secret").value("whsec");
      await request(app)
        .post("/mail/mailersend/survey/response")
        .set("Content-Type", "application/json")
        .set("Signature", sign("whsec", payload))
        .send(payload)
        .expect(200);
    });
  });
});
