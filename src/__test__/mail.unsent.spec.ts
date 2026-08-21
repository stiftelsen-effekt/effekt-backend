import { expect } from "chai";
import sinon from "sinon";
import * as mail from "../custom_modules/mail";

/**
 * These four emails lost their mailgun implementation and never gained a
 * MailerSend template. They used to return true, so all 17 call sites believed
 * the mail had gone out. These tests pin the opposite: they must report failure
 * and say so in the log, until someone rebuilds them.
 *
 * When one is rebuilt, its case here should fail - that is the point. Move it
 * out of this list and test the real send instead.
 */
describe("emails with no MailerSend template", function () {
  const sandbox = sinon.createSandbox();
  let errorStub: sinon.SinonStub;

  beforeEach(function () {
    errorStub = sandbox.stub(console, "error");
  });

  afterEach(function () {
    sandbox.restore();
  });

  const cases: Array<[string, () => Promise<unknown>]> = [
    ["sendFacebookTaxConfirmation", () => mail.sendFacebookTaxConfirmation("a@b.no", "A B", "1")],
    ["sendVippsAgreementChange", () => mail.sendVippsAgreementChange("code", "STOPPED")],
    ["sendAvtaleGiroChange", () => mail.sendAvtaleGiroChange("123", "AMOUNT", "500")],
    ["sendAvtalegiroRegistered", () => mail.sendAvtalegiroRegistered(null)],
  ];

  cases.forEach(([name, invoke]) => {
    it(`${name} reports failure rather than claiming success`, async function () {
      const result = await invoke();

      expect(result, "must not report success while sending nothing").to.equal(false);
    });

    it(`${name} logs an error naming itself`, async function () {
      await invoke();

      expect(errorStub.calledOnce).to.be.true;
      const message = errorStub.firstCall.args[0];
      expect(message).to.contain("[unsent-email]");
      expect(message).to.contain(name);
    });
  });
});
