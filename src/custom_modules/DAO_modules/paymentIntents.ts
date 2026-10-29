import { DAO } from "../DAO";
import { instantRangeClauses, type InstantRange } from "../osloDays";

/**
 * Payment intents (what a donor said they'd give in the donation widget) with whether the money
 * arrived, for the admin. Payment_intent rows are written by `initialpaymentmethod.addPaymentIntent`.
 *
 * Status, per intent:
 *
 * | status   | when                                                                      |
 * |----------|---------------------------------------------------------------------------|
 * | received | the donor has a donation confirmed on or after the intent's day           |
 * | expired  | not received, and the intent is `awaitingDays` (default 30) days or older |
 * | awaiting | not received, and younger than that                                      |
 *
 * "Received" is the follow-up job's definition (routes/scheduled.ts `shouldSendFollowUp`): any
 * donation by the donor, with any KID, amount or method, whose `DATE(timestamp_confirmed)` is on or
 * after `DATE(intent.timestamp)`. The job stops reminding a donor exactly when this says received.
 * The matched donation is the first such donation.
 *
 * A *new donor* intent is one where the donor had no donation confirmed before the intent's day.
 *
 * Both are decided from the donor's first and last confirmed donation. When the status or
 * new-donor flag is filtered on, they come from one GROUP BY over Donations (a skip scan of the
 * `Donor_ID, timestamp_confirmed` index), so filtering and counting needs no per-intent subqueries.
 * Otherwise the page is sorted, counted and limited first and only its rows get the two values (one
 * index dive each). The matched donation and follow-ups are looked up only for the rows on the page.
 */

export const intentStatuses = ["awaiting", "received", "expired"] as const;
export type IntentStatus = (typeof intentStatuses)[number];

export const intentSortColumns = ["created", "amount", "donorName"] as const;
export type IntentSortColumn = (typeof intentSortColumns)[number];

export const DEFAULT_AWAITING_DAYS = 30;

export type IntentFilter = {
  statuses?: IntentStatus[];
  /** Payment ids (Payment.ID): 2 bank, 7 AvtaleGiro, 6 Vipps, 8 Vipps recurring */
  methodIds?: number[];
  /** Half-open range over the intent's created time (a DB-clock column, see osloDays.ts) */
  createdRange?: InstantRange;
  /** Only intents from donors with no donation before the intent's day */
  newDonorsOnly?: boolean;
  donorId?: number;
  /** Exact KID */
  KID?: string;
  /** Partial match on the donor's name or email */
  donor?: string;
};

export type IntentRow = {
  id: number;
  KID: string;
  donorId: number;
  donorName: string | null;
  /** Decimal string */
  amount: string;
  methodId: number | null;
  method: string | null;
  created: Date;
  status: IntentStatus;
  newDonor: boolean;
  matchedDonation: { id: number; date: Date; sum: string } | null;
  followUps: { count: number; last: Date | null };
};

const sortExpressions: Record<IntentSortColumn, string> = {
  created: "I.created",
  amount: "I.amount",
  donorName: "I.donorName",
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Status and new-donor flag from `S.firstDonation` / `S.lastDonation` (the donor's first and last
 * confirmed donation) and the intent's created time. One parameter: awaitingDays.
 */
const statusColumns = (created: string) => `
      CASE
        WHEN S.lastDonation >= DATE(${created}) THEN 'received'
        WHEN ${created} < NOW() - INTERVAL ? DAY THEN 'expired'
        ELSE 'awaiting'
      END AS status,
      (S.firstDonation IS NULL OR S.firstDonation >= DATE(${created})) AS newDonor`;

/**
 * The intents, as a derived table `I`, plus the WHERE clause over it. Filters on intent columns go
 * inside. With `withStatus` (needed when filtering on status or new donor), `I` has the status and
 * new-donor flag, from one grouped pass over Donations, computed only for the filtered intents.
 * Without it, `I` has only the intent columns; see `statusColumns` and `pageDonationSpan`.
 */
function buildBase(filter: IntentFilter, awaitingDays: number, withStatus = true) {
  const inner: string[] = [];
  const innerParams: unknown[] = [];
  const outer: string[] = [];
  const outerParams: unknown[] = [];

  if (filter.methodIds?.length) {
    inner.push("PI.Payment_method IN (?)");
    innerParams.push(filter.methodIds);
  }
  inner.push(...instantRangeClauses("PI.timestamp", filter.createdRange, "db"));
  if (filter.donorId !== undefined) {
    inner.push("D.Donor_ID = ?");
    innerParams.push(filter.donorId);
  }
  if (filter.KID) {
    inner.push("PI.KID_fordeling = ?");
    innerParams.push(filter.KID);
  }
  if (filter.donor) {
    const pattern = `%${escapeLike(filter.donor)}%`;
    inner.push("(Donors.full_name LIKE ? OR Donors.email LIKE ?)");
    innerParams.push(pattern, pattern);
  }
  if (filter.statuses?.length) {
    outer.push("I.status IN (?)");
    outerParams.push(filter.statuses);
  }
  if (filter.newDonorsOnly) outer.push("I.newDonor = 1");

  // For one donor, aggregate only their donations
  const donationScope = filter.donorId !== undefined ? "WHERE Donor_ID = ?" : "";
  const scopeParams = filter.donorId !== undefined ? [filter.donorId] : [];

  const from = `(
    SELECT
      PI.Id AS id,
      PI.KID_fordeling AS KID,
      D.Donor_ID AS donorId,
      Donors.full_name AS donorName,
      PI.Payment_amount AS amount,
      PI.Payment_method AS methodId,
      PI.timestamp AS created${withStatus ? `,${statusColumns("PI.timestamp")}` : ""}
    FROM Payment_intent PI
    INNER JOIN Distributions D ON D.KID = PI.KID_fordeling
    INNER JOIN Donors ON Donors.ID = D.Donor_ID
    ${
      withStatus
        ? `LEFT JOIN (
      SELECT Donor_ID, MIN(timestamp_confirmed) AS firstDonation, MAX(timestamp_confirmed) AS lastDonation
      FROM Donations ${donationScope}
      GROUP BY Donor_ID
    ) S ON S.Donor_ID = D.Donor_ID`
        : ""
    }
    ${inner.length ? `WHERE ${inner.join(" AND ")}` : ""}
  ) I`;

  return {
    from,
    where: outer.length ? `WHERE ${outer.join(" AND ")}` : "",
    params: withStatus
      ? [awaitingDays, ...scopeParams, ...innerParams, ...outerParams]
      : [...innerParams, ...outerParams],
  };
}

type IntentQueryRow = {
  id: number;
  KID: string;
  donorId: number;
  donorName: string | null;
  amount: string | null;
  methodId: number | null;
  method: string | null;
  created: Date;
  status: IntentStatus;
  newDonor: number;
  total: number;
  matchedId: number | null;
  matchedDate: Date | null;
  matchedSum: string | null;
  followUps: number | null;
  lastFollowUp: Date | null;
};

/**
 * One page of intents in one query: the filtered rows are sorted, counted (window) and limited,
 * then only the page's rows get their matched donation and follow-ups.
 */
async function getList(options: {
  filter: IntentFilter;
  sort: { id: IntentSortColumn; desc: boolean };
  awaitingDays?: number;
  /** Omit page and limit for all rows */
  page?: number;
  limit?: number;
}): Promise<{ rows: IntentRow[]; count: number; pages: number }> {
  const awaitingDays = options.awaitingDays ?? DEFAULT_AWAITING_DAYS;
  // Without a status or new-donor filter, sorting, counting and paging don't need the status, so
  // a page gets it for its rows only. For all rows (no limit) the grouped pass is cheaper.
  const withStatus =
    options.limit === undefined ||
    Boolean(options.filter.statuses?.length || options.filter.newDonorsOnly);
  const { from, where, params } = buildBase(options.filter, awaitingDays, withStatus);
  const direction = options.sort.desc ? "DESC" : "ASC";
  const order = `${sortExpressions[options.sort.id]} ${direction}, I.id ${direction}`;
  const paging = options.limit !== undefined ? "LIMIT ? OFFSET ?" : "";
  const pagingParams =
    options.limit !== undefined ? [options.limit, (options.page ?? 0) * options.limit] : [];

  const page = `
       SELECT I.*, COUNT(*) OVER () AS total
       FROM ${from}
       ${where}
       ORDER BY ${order}
       ${paging}`;
  // The page's rows, with status: computed in `I` already, or here for just these rows from the
  // donor's first and last donation (the same values as the grouped pass in buildBase)
  const pageWithStatus = withStatus
    ? page
    : `
       SELECT Pg.*, ${statusColumns("Pg.created")}
       FROM (${page}) AS Pg
       LEFT JOIN LATERAL (
         SELECT
           (SELECT timestamp_confirmed FROM Donations WHERE Donor_ID = Pg.donorId
            ORDER BY timestamp_confirmed LIMIT 1) AS firstDonation,
           (SELECT timestamp_confirmed FROM Donations WHERE Donor_ID = Pg.donorId
            ORDER BY timestamp_confirmed DESC LIMIT 1) AS lastDonation
       ) AS S ON TRUE`;
  const pageParams = withStatus
    ? [...params, ...pagingParams]
    : [awaitingDays, ...params, ...pagingParams];

  const [rows] = await DAO.query<IntentQueryRow[]>(
    `SELECT
       P.*,
       Payment.payment_name AS method,
       M.ID AS matchedId,
       M.timestamp_confirmed AS matchedDate,
       M.sum_confirmed AS matchedSum,
       F.followUps,
       F.lastFollowUp
     FROM (${pageWithStatus}) AS P
     LEFT JOIN Payment ON Payment.ID = P.methodId
     LEFT JOIN LATERAL (
       SELECT X.ID, X.timestamp_confirmed, X.sum_confirmed
       FROM Donations X
       WHERE P.status = 'received' AND X.Donor_ID = P.donorId
         AND X.timestamp_confirmed >= DATE(P.created)
       ORDER BY X.timestamp_confirmed, X.ID
       LIMIT 1
     ) AS M ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS followUps, MAX(Follow_up_date) AS lastFollowUp
       FROM Payment_follow_up
       WHERE Payment_intent_id = P.id
     ) AS F ON TRUE
     ORDER BY ${order.replace(/\bI\./g, "P.")}`,
    pageParams,
  );

  // An empty page past the end has no row to carry the total; that is rare enough to count again
  let count = rows.length ? Number(rows[0].total) : 0;
  if (!rows.length && (options.page ?? 0) > 0) {
    const [[stats]] = await DAO.query<{ count: number }[]>(
      `SELECT COUNT(*) AS count FROM ${from} ${where}`,
      params,
    );
    count = Number(stats.count);
  }

  return {
    rows: rows.map(mapRow),
    count,
    pages: options.limit !== undefined ? Math.ceil(count / options.limit) : count > 0 ? 1 : 0,
  };
}

const mapRow = (row: IntentQueryRow): IntentRow => ({
  id: row.id,
  KID: row.KID,
  donorId: row.donorId,
  donorName: row.donorName,
  amount: row.amount ?? "0.00",
  methodId: row.methodId,
  method: row.method,
  created: row.created,
  status: row.status,
  newDonor: Number(row.newDonor) === 1,
  matchedDonation:
    row.matchedId !== null && row.matchedDate !== null
      ? { id: row.matchedId, date: row.matchedDate, sum: row.matchedSum ?? "0.00" }
      : null,
  followUps: { count: Number(row.followUps ?? 0), last: row.lastFollowUp },
});

/**
 * New donors (no donation before the intent's day) with an intent awaiting payment, e.g. bank or
 * AvtaleGiro intents from the last 30 days. `donors` counts each donor once.
 */
async function countAwaitingNewDonors(options: {
  methodIds: number[];
  createdRange: InstantRange;
  awaitingDays?: number;
}): Promise<{ donors: number; intents: number }> {
  const { from, where, params } = buildBase(
    {
      methodIds: options.methodIds,
      createdRange: options.createdRange,
      statuses: ["awaiting"],
      newDonorsOnly: true,
    },
    options.awaitingDays ?? DEFAULT_AWAITING_DAYS,
  );
  const [[stats]] = await DAO.query<{ donors: number; intents: number }[]>(
    `SELECT COUNT(DISTINCT I.donorId) AS donors, COUNT(*) AS intents FROM ${from} ${where}`,
    params,
  );
  return { donors: Number(stats.donors), intents: Number(stats.intents) };
}

export const paymentIntents = {
  getList,
  countAwaitingNewDonors,
};
