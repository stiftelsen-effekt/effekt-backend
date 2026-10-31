import mailchimp from "@mailchimp/mailchimp_marketing";

export const NEWSLETTER_LIST_ID = "4c98331f9d";

// Mailchimp accepts at most 500 members per batch subscribe call
export const MAILCHIMP_BATCH_SIZE = 500;
const MEMBERS_PAGE_SIZE = 1000;

export type NewsletterDonor = { id: number; email: string; newsletter: boolean };

export type NewsletterSyncPlan = {
  // Emails with newsletter set in the database that are not in the Mailchimp list
  emailsToAdd: string[];
  // Donors that subscribed in Mailchimp after opting out in the database
  donorIDsToSubscribe: number[];
  // Donors that unsubscribed in Mailchimp
  donorIDsToUnsubscribe: number[];
};

export const normalizeEmail = (email: string) => email.toLowerCase().trim();

/**
 * Fetches the status of every member of the newsletter list, keyed by normalized email
 */
export async function getMemberStatuses(): Promise<Map<string, string>> {
  const statuses = new Map<string, string>();
  let offset = 0;
  while (true) {
    const result = await mailchimp.lists.getListMembersInfo(NEWSLETTER_LIST_ID, {
      fields: ["members.email_address", "members.status"],
      count: MEMBERS_PAGE_SIZE,
      offset,
    });
    for (const member of result.members) {
      statuses.set(normalizeEmail(member.email_address), member.status);
    }
    if (result.members.length < MEMBERS_PAGE_SIZE) break;
    offset += MEMBERS_PAGE_SIZE;
  }
  return statuses;
}

/**
 * Works out what has to change on each side. The rules are the same as before:
 * - newsletter in the database, unsubscribed in Mailchimp: turn it off in the database
 * - newsletter in the database, not in Mailchimp: add to Mailchimp
 * - no newsletter in the database, subscribed in Mailchimp: turn it on in the database
 * Pending and cleaned members are left alone.
 */
export function planNewsletterSync(
  donors: NewsletterDonor[],
  memberStatuses: Map<string, string>,
): NewsletterSyncPlan {
  const emailsToAdd = new Set<string>();
  const donorIDsToSubscribe: number[] = [];
  const donorIDsToUnsubscribe: number[] = [];

  for (const donor of donors) {
    if (!donor.email) continue;
    const email = normalizeEmail(donor.email);
    if (email === "") continue;
    const status = memberStatuses.get(email);

    if (donor.newsletter) {
      if (status === undefined) emailsToAdd.add(email);
      else if (status === "unsubscribed") donorIDsToUnsubscribe.push(donor.id);
    } else if (status === "subscribed") {
      donorIDsToSubscribe.push(donor.id);
    }
  }

  return {
    emailsToAdd: [...emailsToAdd],
    donorIDsToSubscribe,
    donorIDsToUnsubscribe,
  };
}

export type AddMembersResult = {
  added: number;
  // Addresses Mailchimp refuses as fake or invalid. Expected, so not counted as failures
  rejectedAsInvalid: number;
  failed: number;
  // Error codes and messages only, so the sync log holds no email addresses
  failures: { code?: string; message: string }[];
};

/**
 * Subscribes the emails with Mailchimp's batch endpoint, 500 at a time, instead of one
 * request per email (which took longer than the scheduler allows when many were missing)
 */
export async function addMembersInBatches(emails: string[]): Promise<AddMembersResult> {
  const result: AddMembersResult = { added: 0, rejectedAsInvalid: 0, failed: 0, failures: [] };

  for (let i = 0; i < emails.length; i += MAILCHIMP_BATCH_SIZE) {
    const chunk = emails.slice(i, i + MAILCHIMP_BATCH_SIZE);
    try {
      const response = await mailchimp.lists.batchListMembers(NEWSLETTER_LIST_ID, {
        members: chunk.map((email) => ({ email_address: email, status: "subscribed" })),
        update_existing: false,
      });
      result.added += response.total_created ?? response.new_members?.length ?? 0;
      for (const error of response.errors ?? []) {
        const message = String(error.error ?? "");
        if (/looks fake or invalid/i.test(message)) {
          result.rejectedAsInvalid++;
        } else {
          result.failed++;
          result.failures.push({ code: error.error_code, message: stripEmails(message) });
        }
      }
    } catch (ex) {
      result.failed += chunk.length;
      result.failures.push({
        code: ex?.status ? String(ex.status) : undefined,
        message: stripEmails(ex instanceof Error ? ex.message : String(ex)),
      });
    }
  }

  return result;
}

const stripEmails = (text: string) => text.replace(/[^\s@]+@[^\s@]+/g, "<email>");
