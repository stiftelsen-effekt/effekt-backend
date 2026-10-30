import { expect } from "chai";
import sinon from "sinon";
import * as mail from "../custom_modules/mail";

/**
 * The two Vipps alerts go to staff rather than donors, so they are sent as
 * plain text and HTML with no MailerSend template behind them.
 *
 * The delivery itself is not covered here: the MailerSend client is
 * constructed inside the send, so exercising the happy path would mean a real
 * HTTP call. What is covered is the formatting, and the refusal to claim
 * success when the alert cannot be addressed.
 */
describe("internal alerts", function () {
  describe("formatInternalAlert", function () {
    it("renders every field in both text and html", function () {
      const { text, html } = mail.formatInternalAlert("Noe feilet", [
        ["Tidspunkt", "1. januar 2026"],
        ["Feiltype", "DRAFT"],
      ]);

      expect(text).to.contain("Noe feilet");
      expect(text).to.contain("Tidspunkt: 1. januar 2026");
      expect(text).to.contain("Feiltype: DRAFT");

      expect(html).to.contain("<strong>Noe feilet</strong>");
      expect(html).to.contain("Tidspunkt:");
      expect(html).to.contain("DRAFT");
    });

    it("escapes html so a donor message cannot inject markup", function () {
      const { html } = mail.formatInternalAlert("Rapport", [
        ["Melding", '<script>alert("x")</script> & "quoted"'],
      ]);

      expect(html).to.not.contain("<script>");
      expect(html).to.contain("&lt;script&gt;");
      expect(html).to.contain("&amp;");
      expect(html).to.contain("&quot;");
    });

    it("keeps the plain text unescaped", function () {
      const { text } = mail.formatInternalAlert("Rapport", [["Melding", "a & b"]]);

      expect(text).to.contain("a & b");
    });
  });

  /**
   * MAILERSEND_API_KEY is unset in the test environment, which is the branch
   * these assert - and which also keeps them off the network. Returning false
   * here is the whole point: the previous implementation returned true while
   * sending nothing.
   */
  describe("when MailerSend is not configured", function () {
    const sandbox = sinon.createSandbox();
    let errorStub: sinon.SinonStub;

    beforeEach(function () {
      errorStub = sandbox.stub(console, "error");
    });

    afterEach(function () {
      sandbox.restore();
    });

    it("sendVippsProblemReport reports failure and names the missing configuration", async function () {
      const result = await mail.sendVippsProblemReport("url", "a@b.no", "melding", null);

      expect(result).to.equal(false);
      expect(errorStub.calledOnce).to.be.true;
      expect(errorStub.firstCall.args[0]).to.contain("sendVippsProblemReport");
      expect(errorStub.firstCall.args[0]).to.contain("MAILERSEND_API_KEY");
    });

    it("sendVippsErrorWarning reports failure and names the missing configuration", async function () {
      const result = await mail.sendVippsErrorWarning("DRAFT", "boom", { kid: "1" });

      expect(result).to.equal(false);
      expect(errorStub.calledOnce).to.be.true;
      expect(errorStub.firstCall.args[0]).to.contain("sendVippsErrorWarning");
      expect(errorStub.firstCall.args[0]).to.contain("MAILERSEND_API_KEY");
    });
  });
});
