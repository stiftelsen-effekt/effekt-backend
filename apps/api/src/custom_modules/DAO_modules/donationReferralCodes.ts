import { DAO } from "../DAO";
import { normalizeReferralCode } from "../referralCode";

export type DonationReferralCode = {
  ID: number;
  KID: string | null;
  Referral_code: string;
  Timestamp: Date;
};

async function add(kid: string, referralCode: string): Promise<void> {
  const normalized = normalizeReferralCode(referralCode);
  if (!normalized) return;

  await DAO.execute(
    `
    INSERT INTO Donation_referral_codes (KID, Referral_code)
    VALUES (?, ?)
    `,
    [kid, normalized],
  );
}

export const donationReferralCodes = {
  add,
};
