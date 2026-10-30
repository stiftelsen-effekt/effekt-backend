import { DAO, SqlResult } from "../DAO";
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

async function getByKID(kid: string): Promise<DonationReferralCode[]> {
  const [rows] = await DAO.query<DonationReferralCode[]>(
    `
    SELECT *
    FROM Donation_referral_codes
    WHERE KID = ?
    ORDER BY Timestamp DESC
    `,
    [kid],
  );

  return rows.map(mapReferralCode);
}

const mapReferralCode = (row: SqlResult<DonationReferralCode>): DonationReferralCode => ({
  ID: row.ID,
  KID: row.KID,
  Referral_code: row.Referral_code,
  Timestamp: new Date(row.Timestamp),
});

export const donationReferralCodes = {
  add,
  getByKID,
};
