import { describe, it, afterEach } from "vitest";
import { expect } from "chai";
import sinon from "sinon";
import mailchimp from "@mailchimp/mailchimp_marketing";
import {
  addMembersInBatches,
  getMemberStatuses,
  MAILCHIMP_BATCH_SIZE,
  planNewsletterSync,
} from "../custom_modules/mailchimpNewsletterSync";

describe("mailchimpNewsletterSync", function () {
  afterEach(function () {
    sinon.restore();
  });

  describe("planNewsletterSync", function () {
    const statuses = new Map([
      ["subscribed@example.org", "subscribed"],
      ["unsubscribed@example.org", "unsubscribed"],
      ["pending@example.org", "pending"],
      ["cleaned@example.org", "cleaned"],
    ]);

    it("follows the existing sync rules", function () {
      const plan = planNewsletterSync(
        [
          { id: 1, email: "subscribed@example.org", newsletter: false },
          { id: 2, email: "subscribed@example.org", newsletter: true },
          { id: 3, email: "unsubscribed@example.org", newsletter: true },
          { id: 4, email: "unsubscribed@example.org", newsletter: false },
          { id: 5, email: "pending@example.org", newsletter: true },
          { id: 6, email: "cleaned@example.org", newsletter: false },
          { id: 7, email: "missing@example.org", newsletter: true },
          { id: 8, email: "other@example.org", newsletter: false },
        ],
        statuses,
      );

      expect(plan.donorIDsToSubscribe).to.deep.equal([1]);
      expect(plan.donorIDsToUnsubscribe).to.deep.equal([3]);
      expect(plan.emailsToAdd).to.deep.equal(["missing@example.org"]);
    });

    it("normalizes emails, adds each address once and skips empty ones", function () {
      const plan = planNewsletterSync(
        [
          { id: 1, email: " Missing@Example.org ", newsletter: true },
          { id: 2, email: "missing@example.org", newsletter: true },
          { id: 3, email: "SUBSCRIBED@example.org", newsletter: false },
          { id: 4, email: "  ", newsletter: true },
          { id: 5, email: null as any, newsletter: true },
        ],
        statuses,
      );

      expect(plan.emailsToAdd).to.deep.equal(["missing@example.org"]);
      expect(plan.donorIDsToSubscribe).to.deep.equal([3]);
    });
  });

  describe("getMemberStatuses", function () {
    it("pages through the list", async function () {
      const page = (n: number, prefix: string) =>
        Array.from({ length: n }, (_, i) => ({
          email_address: `${prefix}${i}@example.org`,
          status: "subscribed",
        }));
      const stub = sinon.stub(mailchimp.lists, "getListMembersInfo");
      stub.onFirstCall().resolves({ members: page(1000, "a") } as any);
      stub.onSecondCall().resolves({ members: page(3, "b") } as any);

      const statuses = await getMemberStatuses();

      expect(statuses.size).to.equal(1003);
      expect(stub.secondCall.args[1]).to.include({ offset: 1000 });
    });
  });

  describe("addMembersInBatches", function () {
    it("sends at most one batch per 500 emails and counts the outcome", async function () {
      const emails = Array.from(
        { length: MAILCHIMP_BATCH_SIZE + 2 },
        (_, i) => `donor${i}@example.org`,
      );
      const stub = sinon.stub(mailchimp.lists, "batchListMembers");
      stub.onFirstCall().resolves({
        total_created: MAILCHIMP_BATCH_SIZE - 2,
        errors: [
          {
            email_address: "donor0@example.org",
            error: "donor0@example.org looks fake or invalid",
          },
          {
            email_address: "donor1@example.org",
            error: "donor1@example.org is already a list member",
            error_code: "ERROR_CONTACT_EXISTS",
          },
        ],
      } as any);
      stub.onSecondCall().rejects(Object.assign(new Error("Too many requests"), { status: 429 }));

      const result = await addMembersInBatches(emails);

      expect(stub.callCount).to.equal(2);
      expect(stub.firstCall.args[1].members).to.have.length(MAILCHIMP_BATCH_SIZE);
      expect(stub.firstCall.args[1].update_existing).to.equal(false);
      expect(result).to.deep.include({ added: MAILCHIMP_BATCH_SIZE - 2, rejectedAsInvalid: 1 });
      expect(result.failed).to.equal(1 + 2);
      expect(result.failures).to.deep.equal([
        { code: "ERROR_CONTACT_EXISTS", message: "<email> is already a list member" },
        { code: "429", message: "Too many requests" },
      ]);
    });

    it("does nothing without emails", async function () {
      const stub = sinon.stub(mailchimp.lists, "batchListMembers");
      expect(await addMembersInBatches([])).to.deep.include({ added: 0, failed: 0 });
      expect(stub.called).to.be.false;
    });
  });
});
