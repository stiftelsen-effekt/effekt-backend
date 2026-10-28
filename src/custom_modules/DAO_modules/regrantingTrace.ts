import { DAO } from "../DAO";
import type { AdjustmentType, IsoDate, PaidBy, RoundKind, RoundStatus } from "../regranting/types";

/**
 * Read-only queries that make regranting numbers traceable (docs/regranting.md, "Tracing the
 * numbers"): the individual ledger entries behind a balance, allocations per month and per day,
 * the donations a round passes on individually, and the monthly reconciliation of allocations
 * against the donations.
 *
 * Amounts that are sums of allocations come back **unrounded** (exact DECIMAL strings from MySQL),
 * so callers can add them up and round once; ledger rows (adjustments, lines) have two decimals.
 * Allocations follow the balance query exactly: payments 15 and 16 excluded, counted by the UTC
 * day of timestamp_confirmed.
 */

const isoDate = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d')`;
const monthOf = (column: string) => `DATE_FORMAT(${column}, '%Y-%m')`;

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [result] = await DAO.query(sql, params);
  return result as T[];
}

/** Excluded from allocations: Influenced (15) and AMF direkte (16) never pass through our accounts */
export const EXCLUDED_PAYMENT_IDS = [15, 16] as const;

//region Ledger entries

export type LedgerEntryRow = {
  kind: "adjustment" | "fund_grant_in" | "fund_grant_out" | "transfer";
  /** The position the entry belongs to (for fund_grant_out: the fund) */
  organizationId: number;
  projectId: number | null;
  /** As stored: adjustments signed; fund grant and transfer lines positive */
  amount: string;
  /** effective_at (adjustments), the round's cutoff (fund grants), paid_at (transfers; null if unpaid) */
  date: IsoDate | null;
  roundId: number | null;
  roundName: string | null;
  roundKind: RoundKind | null;
  roundStatus: RoundStatus | null;
  roundCutoff: IsoDate | null;
  transferId: number | null;
  transferLineId: number | null;
  payeeId: number | null;
  payeeName: string | null;
  bankRef: string | null;
  paidBy: PaidBy | null;
  fundGrantId: number | null;
  fundGrantLineId: number | null;
  /** fund_grant_in: the fund; fund_grant_out: the recipient */
  counterpartOrganizationId: number | null;
  /** fund_grant_out: the recipient's project */
  counterpartProjectId: number | null;
  rationale: string | null;
  adjustmentId: number | null;
  adjustmentType: AdjustmentType | null;
  reason: string | null;
  linkedTransferId: number | null;
  linkedDonationId: number | null;
  documentRef: string | null;
  pairedAdjustmentId: number | null;
};

/**
 * Every ledger entry of the recipients, of any date: adjustments (unattached, or attached to an
 * approved/paid round), fund grant lines in and out and transfer lines of approved and paid rounds.
 * `includeRoundId` also returns that round's entries whatever its status (the round being looked
 * at). Fronted adjustments are included (callers keep them out of sums: they are records).
 */
async function getLedgerEntries(
  organizationIds: number[],
  options: { includeRoundId?: number } = {},
): Promise<LedgerEntryRow[]> {
  if (organizationIds.length === 0) return [];
  const include = options.includeRoundId ?? 0;
  const roundCols = `r.ID AS roundId, r.name AS roundName, r.kind AS roundKind, r.status AS roundStatus,
    ${isoDate("r.cutoff")} AS roundCutoff`;
  const sql = `
    SELECT 'adjustment' AS kind, a.Organization_ID AS organizationId, a.Project_ID AS projectId, a.amount,
           ${isoDate("a.effective_at")} AS date,
           ${roundCols.replace(/r\./g, "ar.")},
           NULL AS transferId, NULL AS transferLineId, NULL AS payeeId, NULL AS payeeName, NULL AS bankRef,
           NULL AS paidBy, NULL AS fundGrantId, NULL AS fundGrantLineId, NULL AS counterpartOrganizationId,
           NULL AS counterpartProjectId, NULL AS rationale, a.ID AS adjustmentId, a.type AS adjustmentType,
           a.reason, a.linked_transfer_ID AS linkedTransferId, a.linked_donation_ID AS linkedDonationId,
           a.document_ref AS documentRef, a.Paired_adjustment_ID AS pairedAdjustmentId
    FROM Regrant_adjustments a
    LEFT JOIN Regrant_rounds ar ON ar.ID = a.Round_ID
    WHERE a.Organization_ID IN (?)
      AND (a.Round_ID IS NULL OR ar.status IN ('approved', 'paid') OR ar.ID = ?)

    UNION ALL
    SELECT 'fund_grant_in', l.Organization_ID, l.Project_ID, l.amount, ${isoDate("r.cutoff")},
           ${roundCols}, NULL, NULL, NULL, NULL, NULL, NULL, g.ID, l.ID, g.Fund_ID, NULL, g.rationale,
           NULL, NULL, NULL, NULL, NULL, NULL, NULL
    FROM Fund_grant_lines l JOIN Fund_grants g ON g.ID = l.Fund_grant_ID JOIN Regrant_rounds r ON r.ID = g.Round_ID
    WHERE l.Organization_ID IN (?) AND (r.status IN ('approved', 'paid') OR r.ID = ?)

    UNION ALL
    SELECT 'fund_grant_out', g.Fund_ID, NULL, l.amount, ${isoDate("r.cutoff")},
           ${roundCols}, NULL, NULL, NULL, NULL, NULL, NULL, g.ID, l.ID, l.Organization_ID, l.Project_ID,
           g.rationale, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    FROM Fund_grant_lines l JOIN Fund_grants g ON g.ID = l.Fund_grant_ID JOIN Regrant_rounds r ON r.ID = g.Round_ID
    WHERE g.Fund_ID IN (?) AND (r.status IN ('approved', 'paid') OR r.ID = ?)

    UNION ALL
    SELECT 'transfer', tl.Organization_ID, tl.Project_ID, tl.amount_nok, ${isoDate("t.paid_at")},
           ${roundCols}, t.ID, tl.ID, p.ID, p.name, t.bank_ref, t.paid_by, NULL, NULL, NULL, NULL, NULL,
           NULL, NULL, NULL, NULL, NULL, NULL, NULL
    FROM Regrant_transfer_lines tl JOIN Regrant_transfers t ON t.ID = tl.Transfer_ID
    JOIN Regrant_rounds r ON r.ID = t.Round_ID JOIN Payees p ON p.ID = t.Payee_ID
    WHERE tl.Organization_ID IN (?) AND (r.status IN ('approved', 'paid') OR r.ID = ?)

    ORDER BY date, kind, roundId, adjustmentId, fundGrantLineId, transferLineId`;
  return rows<LedgerEntryRow>(sql, [
    organizationIds,
    include,
    organizationIds,
    include,
    organizationIds,
    include,
    organizationIds,
    include,
  ]);
}

//endregion

//region Allocations

/** Allocations to one recipient per UTC month up to a day: exact amount, donations, their whole sums */
export type AllocationMonthRow = {
  /** "2026-08" */
  month: string;
  /** Exact (unrounded) sum of the recipient's share */
  amount: string;
  donationCount: number;
  /** Sum of the whole donations (not just the recipient's share) */
  donationsSum: string;
};

/**
 * Same expression and filters as the balance query's allocations (getBalances), grouped by the
 * UTC month of timestamp_confirmed, so the months add up to its total exactly.
 */
async function getAllocationMonths(
  organizationId: number,
  at: IsoDate,
): Promise<AllocationMonthRow[]> {
  const [amounts, counts] = await Promise.all([
    rows<{ month: string; amount: string }>(
      `SELECT k.month, SUM(k.amount * dca.Percentage_share / 100 * dcao.Percentage_share / 100) AS amount
       FROM (
         SELECT d.KID_fordeling, DATE_FORMAT(d.timestamp_confirmed, '%Y-%m') AS month, SUM(d.sum_confirmed) AS amount
         FROM Donations d
         WHERE d.Payment_ID NOT IN (15, 16) AND d.timestamp_confirmed < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY d.KID_fordeling, month
       ) k
       JOIN Distribution_cause_areas dca ON dca.Distribution_KID = k.KID_fordeling
       JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
       WHERE dcao.Organization_ID = ?
       GROUP BY k.month ORDER BY k.month`,
      [at, organizationId],
    ),
    rows<{ month: string; donationCount: number; donationsSum: string }>(
      `SELECT DATE_FORMAT(d.timestamp_confirmed, '%Y-%m') AS month, COUNT(*) AS donationCount,
              SUM(d.sum_confirmed) AS donationsSum
       FROM Donations d
       JOIN (
         SELECT DISTINCT dca.Distribution_KID AS kid
         FROM Distribution_cause_areas dca
         JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
         WHERE dcao.Organization_ID = ? AND dca.Percentage_share > 0 AND dcao.Percentage_share > 0
       ) s ON s.kid = d.KID_fordeling
       WHERE d.Payment_ID NOT IN (15, 16) AND d.timestamp_confirmed < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY month`,
      [organizationId, at],
    ),
  ]);
  const byMonth = new Map(counts.map((c) => [c.month, c]));
  return amounts.map((a) => ({
    month: a.month,
    amount: String(a.amount),
    donationCount: Number(byMonth.get(a.month)?.donationCount ?? 0),
    donationsSum: String(byMonth.get(a.month)?.donationsSum ?? "0"),
  }));
}

/**
 * The Oslo calendar month of a timestamp_confirmed (UTC wall clock). Norway is UTC+2 from the
 * last Sunday of March to the last Sunday of October, so a month starts at 22:00 UTC the day
 * before for April–October and 23:00 UTC otherwise; that is all month bucketing needs.
 */
const osloMonthOf = (column: string) =>
  `DATE_FORMAT(DATE_ADD(${column}, INTERVAL (CASE WHEN MONTH(DATE_ADD(${column}, INTERVAL 2 HOUR)) BETWEEN 4 AND 10 THEN 2 ELSE 1 END) HOUR), '%Y-%m')`;

export type ListMonthRow = { month: string; donationCount: number; sum: string };

/**
 * What the admin's Donations list shows for one organization per month, restricted to every
 * payment method except 15 and 16: the number of donations and the sum of each donation's share
 * to the organization rounded to øre (the list's own expression). `oslo` groups by Oslo months
 * (as the list's date filter) up to `osloBefore`; `utc` by UTC months (as allocations) up to
 * `utcBefore`. Both are UTC wall-clock strings ("2026-10-28 23:00:00").
 */
async function getDonationsListMonths(
  organizationId: number,
  bounds: { utcBefore: string; osloBefore: string },
): Promise<{ utc: ListMonthRow[]; oslo: ListMonthRow[] }> {
  const query = (monthExpr: string, before: string) =>
    rows<any>(
      `SELECT ${monthExpr} AS month, COUNT(*) AS donationCount,
              SUM(ROUND(d.sum_confirmed * s.selected_share, 2)) AS sum
       FROM (
         SELECT dca.Distribution_KID AS kid,
                SUM(dca.Percentage_share / 100 * dcao.Percentage_share / 100) AS selected_share
         FROM Distribution_cause_areas dca
         JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
         WHERE dcao.Organization_ID = ?
         GROUP BY dca.Distribution_KID
       ) s
       JOIN Donations d ON d.KID_fordeling = s.kid
       JOIN Distributions dist ON dist.KID = d.KID_fordeling
       JOIN Donors dn ON dn.ID = d.Donor_ID
       WHERE d.Payment_ID NOT IN (15, 16) AND d.timestamp_confirmed < ?
       GROUP BY month`,
      [organizationId, before],
    ).then((result) =>
      result.map((r) => ({
        month: String(r.month),
        donationCount: Number(r.donationCount),
        sum: String(r.sum),
      })),
    );
  const [utc, oslo] = await Promise.all([
    query(monthOf("d.timestamp_confirmed"), bounds.utcBefore),
    query(osloMonthOf("d.timestamp_confirmed"), bounds.osloBefore),
  ]);
  return { utc, oslo };
}

/** Payment methods the Donations list link includes: all except 15 and 16 */
async function getIncludedPaymentMethodIds(): Promise<number[]> {
  return (
    await rows<{ ID: number }>(`SELECT ID FROM Payment WHERE ID NOT IN (15, 16) ORDER BY ID`)
  ).map((r) => r.ID);
}

export type AllocationDayRow = {
  organizationId: number;
  /** UTC day */
  day: IsoDate;
  /** Exact (unrounded); negative when refunds outweigh donations that day */
  amount: string;
  donationCount: number;
};

/**
 * Allocations per recipient and UTC day, up to `at`, leaving out `excludeDonationIds` (donations
 * traced individually). Donations are summed per KID and day before the split is applied, like
 * the balance query.
 */
async function getAllocationDays(
  organizationIds: number[],
  at: IsoDate,
  excludeDonationIds: number[],
): Promise<AllocationDayRow[]> {
  if (organizationIds.length === 0) return [];
  const exclude = excludeDonationIds.length ? excludeDonationIds : [0];
  return (
    await rows<any>(
      `SELECT dcao.Organization_ID AS organizationId, k.day,
              SUM(k.amount * dca.Percentage_share / 100 * dcao.Percentage_share / 100) AS amount,
              SUM(k.cnt) AS donationCount
       FROM (
         SELECT d.KID_fordeling, DATE_FORMAT(d.timestamp_confirmed, '%Y-%m-%d') AS day,
                SUM(d.sum_confirmed) AS amount, COUNT(*) AS cnt
         FROM Donations d
         WHERE d.Payment_ID NOT IN (15, 16) AND d.timestamp_confirmed < DATE_ADD(?, INTERVAL 1 DAY)
           AND d.ID NOT IN (?)
         GROUP BY d.KID_fordeling, day
       ) k
       JOIN Distribution_cause_areas dca ON dca.Distribution_KID = k.KID_fordeling
       JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
       WHERE dcao.Organization_ID IN (?)
       GROUP BY dcao.Organization_ID, k.day
       ORDER BY dcao.Organization_ID, k.day`,
      [at, exclude, organizationIds],
    )
  ).map((r) => ({
    organizationId: Number(r.organizationId),
    day: String(r.day),
    amount: String(r.amount),
    donationCount: Number(r.donationCount),
  }));
}

export type TracedDonationRow = {
  donationId: number;
  donorId: number;
  donorName: string | null;
  /** UTC day */
  day: IsoDate;
  timestampConfirmed: Date;
  sum: string;
  paymentId: number;
  organizationId: number;
  /** Exact share to the organization */
  amount: string;
  /** chosen: by a major_donor round; fronted: linked to a fronted adjustment */
  reason: "chosen" | "fronted";
  /** The round the donation is passed on in */
  roundId: number | null;
  /** fronted: the adjustment */
  adjustmentId: number | null;
};

/**
 * Donations passed on individually, with their allocations to the given recipients: those chosen
 * by approved/paid major_donor rounds (and by `includeRoundId`, whatever its status) and those
 * linked to a fronted adjustment. A donation chosen by several rounds belongs to the first
 * approved/paid one (others can't approve it again), else to `includeRoundId`.
 */
async function getTracedDonations(
  organizationIds: number[],
  includeRoundId = 0,
): Promise<TracedDonationRow[]> {
  if (organizationIds.length === 0) return [];
  return (
    await rows<any>(
      `SELECT x.donationId, d.Donor_ID AS donorId, dn.full_name AS donorName,
              ${isoDate(
                "d.timestamp_confirmed",
              )} AS day, d.timestamp_confirmed AS timestampConfirmed,
              d.sum_confirmed AS sum, d.Payment_ID AS paymentId, a.Organization_ID AS organizationId,
              SUM(a.amount) AS amount, x.reason, x.roundId, x.adjustmentId
       FROM (
         SELECT rd.Donation_ID AS donationId, 'chosen' AS reason,
                COALESCE(MIN(CASE WHEN r.status IN ('approved', 'paid') THEN r.ID END),
                         MIN(CASE WHEN r.ID = ? THEN r.ID END)) AS roundId,
                NULL AS adjustmentId
         FROM Regrant_round_donations rd JOIN Regrant_rounds r ON r.ID = rd.Round_ID
         WHERE r.kind = 'major_donor' AND (r.status IN ('approved', 'paid') OR r.ID = ?)
         GROUP BY rd.Donation_ID
         UNION ALL
         SELECT adj.linked_donation_ID, 'fronted', MIN(adj.Round_ID), MIN(adj.ID)
         FROM Regrant_adjustments adj
         WHERE adj.type = 'fronted' AND adj.linked_donation_ID IS NOT NULL
           AND adj.linked_donation_ID NOT IN (
             SELECT rd.Donation_ID FROM Regrant_round_donations rd JOIN Regrant_rounds r ON r.ID = rd.Round_ID
             WHERE r.kind = 'major_donor' AND (r.status IN ('approved', 'paid') OR r.ID = ?))
         GROUP BY adj.linked_donation_ID
       ) x
       JOIN Donations d ON d.ID = x.donationId
       LEFT JOIN Donors dn ON dn.ID = d.Donor_ID
       JOIN Regrant_allocations a ON a.Donation_ID = d.ID
       WHERE a.Organization_ID IN (?)
       GROUP BY x.donationId, d.Donor_ID, dn.full_name, d.timestamp_confirmed, d.sum_confirmed, d.Payment_ID,
                a.Organization_ID, x.reason, x.roundId, x.adjustmentId
       ORDER BY d.timestamp_confirmed, x.donationId`,
      [includeRoundId, includeRoundId, includeRoundId, organizationIds],
    )
  ).map((r) => ({
    donationId: Number(r.donationId),
    donorId: Number(r.donorId),
    donorName: r.donorName ?? null,
    day: String(r.day),
    timestampConfirmed: r.timestampConfirmed,
    sum: String(r.sum),
    paymentId: Number(r.paymentId),
    organizationId: Number(r.organizationId),
    amount: String(r.amount),
    reason: r.reason,
    roundId: r.roundId === null ? null : Number(r.roundId),
    adjustmentId: r.adjustmentId === null ? null : Number(r.adjustmentId),
  }));
}

/** Ids of all donations passed on individually (see getTracedDonations), for any recipient */
async function getTracedDonationIds(includeRoundId = 0): Promise<number[]> {
  return (
    await rows<{ id: number }>(
      `SELECT rd.Donation_ID AS id FROM Regrant_round_donations rd JOIN Regrant_rounds r ON r.ID = rd.Round_ID
       WHERE r.kind = 'major_donor' AND (r.status IN ('approved', 'paid') OR r.ID = ?)
       UNION
       SELECT linked_donation_ID FROM Regrant_adjustments WHERE type = 'fronted' AND linked_donation_ID IS NOT NULL`,
      [includeRoundId],
    )
  ).map((r) => Number(r.id));
}

//endregion

//region Reconciliation

/** Allocations per recipient and UTC month from the Regrant_allocations view (exact) */
async function getViewMonthly(
  from: string,
  before: string,
): Promise<{ organizationId: number; month: string; amount: string; donationCount: number }[]> {
  return (
    await rows<any>(
      `SELECT a.Organization_ID AS organizationId, ${monthOf("a.timestamp_confirmed")} AS month,
              SUM(a.amount) AS amount, COUNT(DISTINCT a.Donation_ID) AS donationCount
       FROM Regrant_allocations a
       WHERE a.timestamp_confirmed >= ? AND a.timestamp_confirmed < ?
       GROUP BY a.Organization_ID, month`,
      [from, before],
    )
  ).map((r) => ({
    organizationId: Number(r.organizationId),
    month: String(r.month),
    amount: String(r.amount),
    donationCount: Number(r.donationCount),
  }));
}

/**
 * The same figures computed independently of the view, straight from Donations and the split
 * tables: each KID's share per organization (Σ cause-area % × organization %) times the KID's
 * confirmed sum per month, payments 15 and 16 excluded.
 */
async function getDirectMonthly(
  from: string,
  before: string,
): Promise<{ organizationId: number; month: string; amount: string }[]> {
  return (
    await rows<any>(
      `SELECT s.Organization_ID AS organizationId, k.month, SUM(k.amount * s.share) AS amount
       FROM (
         SELECT d.KID_fordeling AS kid, ${monthOf(
           "d.timestamp_confirmed",
         )} AS month, SUM(d.sum_confirmed) AS amount
         FROM Donations d
         WHERE d.Payment_ID NOT IN (15, 16) AND d.timestamp_confirmed >= ? AND d.timestamp_confirmed < ?
         GROUP BY d.KID_fordeling, month
       ) k
       JOIN (
         SELECT dca.Distribution_KID AS kid, dcao.Organization_ID,
                SUM(dca.Percentage_share * dcao.Percentage_share) / 10000 AS share
         FROM Distribution_cause_areas dca
         JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
         GROUP BY dca.Distribution_KID, dcao.Organization_ID
       ) s ON s.kid = k.kid
       GROUP BY s.Organization_ID, k.month`,
      [from, before],
    )
  ).map((r) => ({
    organizationId: Number(r.organizationId),
    month: String(r.month),
    amount: String(r.amount),
  }));
}

export type MonthlyTotalsRow = {
  month: string;
  donationCount: number;
  /** Σ confirmed donations, payments 15 and 16 excluded */
  donations: string;
  /** KIDs without a split */
  unassignedCount: number;
  unassigned: string;
  /** Donations whose split doesn't add up to 100 %: count and the part not allocated (exact) */
  splitGapCount: number;
  splitGap: string;
};

/** Per UTC month: confirmed donations, the part without a split, and the part a split leaves out */
async function getMonthlyTotals(from: string, before: string): Promise<MonthlyTotalsRow[]> {
  return (
    await rows<any>(
      `SELECT k.month, SUM(k.cnt) AS donationCount, SUM(k.amount) AS donations,
              SUM(CASE WHEN s.share IS NULL THEN k.cnt ELSE 0 END) AS unassignedCount,
              SUM(CASE WHEN s.share IS NULL THEN k.amount ELSE 0 END) AS unassigned,
              SUM(CASE WHEN s.share IS NOT NULL AND ABS(1 - s.share) > 0.000001 THEN k.cnt ELSE 0 END) AS splitGapCount,
              SUM(CASE WHEN s.share IS NOT NULL THEN k.amount * (1 - s.share) ELSE 0 END) AS splitGap
       FROM (
         SELECT d.KID_fordeling AS kid, ${monthOf("d.timestamp_confirmed")} AS month,
                SUM(d.sum_confirmed) AS amount, COUNT(*) AS cnt
         FROM Donations d
         WHERE d.Payment_ID NOT IN (15, 16) AND d.timestamp_confirmed >= ? AND d.timestamp_confirmed < ?
         GROUP BY d.KID_fordeling, month
       ) k
       LEFT JOIN (
         SELECT dca.Distribution_KID AS kid, SUM(dca.Percentage_share * dcao.Percentage_share) / 10000 AS share
         FROM Distribution_cause_areas dca
         JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
         GROUP BY dca.Distribution_KID
       ) s ON s.kid = k.kid
       GROUP BY k.month ORDER BY k.month`,
      [from, before],
    )
  ).map((r) => ({
    month: String(r.month),
    donationCount: Number(r.donationCount),
    donations: String(r.donations),
    unassignedCount: Number(r.unassignedCount),
    unassigned: String(r.unassigned),
    splitGapCount: Number(r.splitGapCount),
    splitGap: String(r.splitGap),
  }));
}

/** KIDs with donations in the range whose split doesn't add up to 100 % (at most `limit`) */
async function getSplitGaps(
  from: string,
  before: string,
  limit = 50,
): Promise<
  {
    kid: string;
    sharePercent: string;
    donationCount: number;
    amount: string;
    notAllocated: string;
  }[]
> {
  return (
    await rows<any>(
      `SELECT k.kid, s.share * 100 AS sharePercent, SUM(k.cnt) AS donationCount, SUM(k.amount) AS amount,
              SUM(k.amount * (1 - s.share)) AS notAllocated
       FROM (
         SELECT d.KID_fordeling AS kid, SUM(d.sum_confirmed) AS amount, COUNT(*) AS cnt
         FROM Donations d
         WHERE d.Payment_ID NOT IN (15, 16) AND d.timestamp_confirmed >= ? AND d.timestamp_confirmed < ?
         GROUP BY d.KID_fordeling
       ) k
       JOIN (
         SELECT dca.Distribution_KID AS kid, SUM(dca.Percentage_share * dcao.Percentage_share) / 10000 AS share
         FROM Distribution_cause_areas dca
         JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
         GROUP BY dca.Distribution_KID
       ) s ON s.kid = k.kid
       WHERE ABS(1 - s.share) > 0.000001
       GROUP BY k.kid, s.share
       ORDER BY ABS(SUM(k.amount * (1 - s.share))) DESC
       LIMIT ?`,
      [from, before, limit],
    )
  ).map((r) => ({
    kid: String(r.kid),
    sharePercent: String(r.sharePercent),
    donationCount: Number(r.donationCount),
    amount: String(r.amount),
    notAllocated: String(r.notAllocated),
  }));
}

//endregion

export const regrantingTrace = {
  getLedgerEntries,
  getAllocationMonths,
  getDonationsListMonths,
  getIncludedPaymentMethodIds,
  getAllocationDays,
  getTracedDonations,
  getTracedDonationIds,
  getViewMonthly,
  getDirectMonthly,
  getMonthlyTotals,
  getSplitGaps,
};
