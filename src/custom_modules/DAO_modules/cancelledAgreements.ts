import { DAO } from "../DAO";

/**
 * Cancelled recurring agreements (Vipps and AvtaleGiro, Norway) with what we know about why and
 * about the donor. An agreement counts as cancelled when it has a cancellation date
 * (Vipps_agreements.cancellation_date, Avtalegiro_agreements.cancelled); Vipps agreements that
 * are STOPPED without a date have nothing to sort or filter by and are left out.
 *
 * One page query (filters, "has another active agreement", sort, paging), one summary query
 * over the whole filtered set, and batched lookups for the page rows' reasons and donor stats.
 */

export const cancelledAgreementProviders = ["vipps", "avtalegiro"] as const;
export type CancelledAgreementProvider = (typeof cancelledAgreementProviders)[number];

export const cancelledAgreementSortColumns = [
  "cancelled",
  "created",
  "amount",
  "donorName",
  "latestDonation",
  "donationSum",
  "donationCount",
] as const;
export type CancelledAgreementSortColumn = (typeof cancelledAgreementSortColumns)[number];

export type CancelledAgreementFilter = {
  providers?: CancelledAgreementProvider[];
  /** Inclusive YYYY-MM-DD days; the cancelled columns are plain dates */
  cancelled?: { from?: string; to?: string };
  /** Agreements with at least one of these reasons recorded */
  reasonIds?: number[];
  /** Whether the donor has another active Vipps or AvtaleGiro agreement */
  hasOtherActiveAgreement?: boolean;
  /** Partial name or email; all digits also matches the donor id exactly or part of the KID */
  donor?: string;
};

export type CancellationReason = {
  reasonId: number;
  name: string;
  /** The donor's own words, only for the "other" reason */
  comment: string | null;
  /** When the donor gave the reason (Oslo wall clock as stored) */
  recorded: Date | null;
};

export type DonorDonationStats = {
  latestDonation: Date | null;
  /** Decimal string, kroner */
  donationSum: string;
  donationCount: number;
};

export type CancelledAgreementRow = {
  provider: CancelledAgreementProvider;
  id: string;
  KID: string;
  /** Monthly amount, kroner, decimal string */
  amount: string;
  created: Date | null;
  /** YYYY-MM-DD */
  cancelled: string;
  donorId: number;
  donorName: string | null;
  hasOtherActiveAgreement: boolean;
  /** Types of the donor's active agreements, empty when there are none */
  otherActiveProviders: CancelledAgreementProvider[];
  donorStats: DonorDonationStats;
  reasons: CancellationReason[];
};

export type CancelledAgreementSummary = {
  count: number;
  withOtherActiveCount: number;
  /** Agreements with at least one recorded reason */
  withReasonCount: number;
  /** Reasons given for the matching agreements, most frequent first */
  reasons: { reasonId: number; name: string; count: number }[];
};

/** One collation for every string column, so the UNION works whatever the tables use */
const str = (expression: string) =>
  `CAST(${expression} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_0900_ai_ci`;

/** Active includes paused Vipps agreements: the donor still has the agreement */
const providerQueries: Record<CancelledAgreementProvider, string> = {
  vipps: `
    SELECT ${str("'vipps'")} AS provider, ${str("VA.ID")} AS id, ${str("VA.KID")} AS KID,
      VA.donorID AS donorId, ${str("Donors.full_name")} AS donorName,
      ${str("Donors.email")} AS donorEmail,
      CAST(VA.amount AS DECIMAL(16, 2)) AS amount, VA.timestamp_created AS created,
      VA.cancellation_date AS cancelledDate
    FROM Vipps_agreements VA
    INNER JOIN Donors ON Donors.ID = VA.donorID
    WHERE VA.cancellation_date IS NOT NULL`,
  avtalegiro: `
    SELECT ${str("'avtalegiro'")} AS provider, ${str("AG.ID")} AS id, ${str("AG.KID")} AS KID,
      D.Donor_ID AS donorId, ${str("Donors.full_name")} AS donorName,
      ${str("Donors.email")} AS donorEmail,
      CAST(AG.amount / 100 AS DECIMAL(16, 2)) AS amount, AG.created AS created,
      AG.cancelled AS cancelledDate
    FROM Avtalegiro_agreements AG
    INNER JOIN Distributions D ON D.KID = AG.KID
    INNER JOIN Donors ON Donors.ID = D.Donor_ID
    WHERE AG.cancelled IS NOT NULL`,
};

const otherActiveVipps = `EXISTS (
  SELECT 1 FROM Vipps_agreements V2
  WHERE V2.donorID = C.donorId AND UPPER(V2.status) = 'ACTIVE'
    AND NOT (C.provider = 'vipps' AND V2.ID = C.id))`;
const otherActiveAvtalegiro = `EXISTS (
  SELECT 1 FROM Avtalegiro_agreements A2
  INNER JOIN Distributions D2 ON D2.KID = A2.KID
  WHERE D2.Donor_ID = C.donorId AND A2.active = 1
    AND NOT (C.provider = 'avtalegiro' AND A2.ID = C.id))`;

/**
 * Recorded reasons keyed like the agreements (provider, id as text), so they join on equal types
 * and collations; comparing the int AvtaleGiro column to the text id would skip the index.
 */
const reasonKeys = `
  SELECT ${str("'vipps'")} AS provider, ${str("vippsAgreementID")} AS id, reasonID
  FROM Recurring_agreement_stopped WHERE vippsAgreementID IS NOT NULL
  UNION ALL
  SELECT ${str("'avtalegiro'")}, ${str("avtalegiroAgreementID")}, reasonID
  FROM Recurring_agreement_stopped WHERE avtalegiroAgreementID IS NOT NULL`;

/** Matches a reason key RK to the agreement F */
const reasonOfAgreement = "(RK.provider = F.provider AND RK.id = F.id)";

const donorStat = (expression: string) =>
  `(SELECT ${expression} FROM Donations DS WHERE DS.Donor_ID = F.donorId)`;

/** ORDER BY expressions; donor stats are correlated subqueries on the Donor_ID index */
const sortExpressions: Record<CancelledAgreementSortColumn, string> = {
  cancelled: "F.cancelledDate",
  created: "F.created",
  amount: "F.amount",
  donorName: "F.donorName",
  latestDonation: donorStat("MAX(DS.timestamp_confirmed)"),
  donationSum: donorStat("COALESCE(SUM(DS.sum_confirmed), 0)"),
  donationCount: donorStat("COUNT(*)"),
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** `WITH F AS (…)`: the requested providers with the other-active flags, and the WHERE over F */
function buildQuery(filter: CancelledAgreementFilter) {
  const providers = filter.providers?.length ? filter.providers : [...cancelledAgreementProviders];
  const union = providers.map((provider) => providerQueries[provider]).join("\nUNION ALL\n");
  const cte = `WITH C AS (${union}),
    RK AS (${reasonKeys}),
    F AS (
      SELECT C.*, ${otherActiveVipps} AS otherVipps, ${otherActiveAvtalegiro} AS otherAvtalegiro
      FROM C
    )`;

  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, ...values: unknown[]) => {
    where.push(clause);
    params.push(...values);
  };

  if (filter.cancelled?.from) add("F.cancelledDate >= ?", filter.cancelled.from);
  if (filter.cancelled?.to) add("F.cancelledDate <= ?", filter.cancelled.to);
  if (filter.hasOtherActiveAgreement !== undefined) {
    add(`(F.otherVipps OR F.otherAvtalegiro) = ?`, filter.hasOtherActiveAgreement ? 1 : 0);
  }
  if (filter.reasonIds?.length) {
    add(
      `EXISTS (SELECT 1 FROM RK WHERE RK.reasonID IN (?) AND ${reasonOfAgreement})`,
      filter.reasonIds,
    );
  }
  if (filter.donor) {
    const pattern = `%${escapeLike(filter.donor)}%`;
    if (/^\d+$/.test(filter.donor)) {
      add(
        "(F.donorName LIKE ? OR F.donorEmail LIKE ? OR F.donorId = ? OR F.KID LIKE ?)",
        pattern,
        pattern,
        Number(filter.donor),
        pattern,
      );
    } else {
      add("(F.donorName LIKE ? OR F.donorEmail LIKE ?)", pattern, pattern);
    }
  }

  return { cte, where: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

type PageRow = {
  provider: CancelledAgreementProvider;
  id: string;
  KID: string;
  donorId: number;
  donorName: string | null;
  amount: string;
  created: Date | null;
  cancelled: string;
  otherVipps: number;
  otherAvtalegiro: number;
};

async function getList(options: {
  filter: CancelledAgreementFilter;
  sort: { id: CancelledAgreementSortColumn; desc: boolean };
  page: number;
  limit: number;
}): Promise<{ rows: CancelledAgreementRow[]; summary: CancelledAgreementSummary; pages: number }> {
  const { cte, where, params } = buildQuery(options.filter);
  const direction = options.sort.desc ? "DESC" : "ASC";
  const order = [
    sortExpressions[options.sort.id],
    "F.cancelledDate",
    "F.provider",
    "CHAR_LENGTH(F.id)",
    "F.id",
  ]
    .map((expression) => `${expression} ${direction}`)
    .join(", ");

  const pageQuery = DAO.query<PageRow[]>(
    `${cte}
     SELECT F.provider, F.id, F.KID, F.donorId, F.donorName, F.amount, F.created,
       DATE_FORMAT(F.cancelledDate, '%Y-%m-%d') AS cancelled, F.otherVipps, F.otherAvtalegiro
     FROM F
     ${where}
     ORDER BY ${order}
     LIMIT ? OFFSET ?`,
    [...params, options.limit, options.page * options.limit],
  );
  const [[rows], summary] = await Promise.all([pageQuery, getSummary(cte, where, params)]);
  const [reasons, donorStats] = await Promise.all([
    getReasons(rows),
    getDonorStats(rows.map((row) => row.donorId)),
  ]);

  return {
    rows: rows.map((row): CancelledAgreementRow => {
      const otherActiveProviders: CancelledAgreementProvider[] = [];
      if (Number(row.otherVipps)) otherActiveProviders.push("vipps");
      if (Number(row.otherAvtalegiro)) otherActiveProviders.push("avtalegiro");
      return {
        provider: row.provider,
        id: row.id,
        KID: row.KID,
        amount: row.amount,
        created: row.created,
        cancelled: row.cancelled,
        donorId: row.donorId,
        donorName: row.donorName,
        hasOtherActiveAgreement: otherActiveProviders.length > 0,
        otherActiveProviders,
        donorStats: donorStats.get(row.donorId) ?? {
          latestDonation: null,
          donationSum: "0.00",
          donationCount: 0,
        },
        reasons: reasons.get(`${row.provider}:${row.id}`) ?? [],
      };
    }),
    summary,
    pages: Math.ceil(summary.count / options.limit),
  };
}

async function getSummary(
  cte: string,
  where: string,
  params: unknown[],
): Promise<CancelledAgreementSummary> {
  const totalsQuery = DAO.query<
    { count: number; withOtherActiveCount: string | null; withReasonCount: string | null }[]
  >(
    `${cte}
     SELECT COUNT(*) AS count,
       SUM(F.otherVipps OR F.otherAvtalegiro) AS withOtherActiveCount,
       SUM(EXISTS (SELECT 1 FROM RK WHERE ${reasonOfAgreement})) AS withReasonCount
     FROM F
     ${where}`,
    params,
  );
  const reasonsQuery = DAO.query<{ reasonId: number; name: string; count: number }[]>(
    `${cte}
     SELECT RS.ID AS reasonId, RS.name, COUNT(DISTINCT F.provider, F.id) AS count
     FROM F
     INNER JOIN RK ON ${reasonOfAgreement}
     INNER JOIN Recurring_agreement_stopped_reasons RS ON RS.ID = RK.reasonID
     ${where}
     GROUP BY RS.ID, RS.name, RS.\`order\`
     ORDER BY count DESC, RS.\`order\`, RS.ID`,
    params,
  );
  const [[[totals]], [reasons]] = await Promise.all([totalsQuery, reasonsQuery]);
  return {
    count: Number(totals.count),
    withOtherActiveCount: Number(totals.withOtherActiveCount ?? 0),
    withReasonCount: Number(totals.withReasonCount ?? 0),
    reasons: reasons.map((reason) => ({
      reasonId: reason.reasonId,
      name: reason.name,
      count: Number(reason.count),
    })),
  };
}

/** Recorded reasons for the page's agreements, keyed "provider:id", oldest first */
async function getReasons(
  rows: { provider: CancelledAgreementProvider; id: string }[],
): Promise<Map<string, CancellationReason[]>> {
  const result = new Map<string, CancellationReason[]>();
  const vippsIds = rows.filter((row) => row.provider === "vipps").map((row) => row.id);
  const avtalegiroIds = rows
    .filter((row) => row.provider === "avtalegiro")
    .map((row) => Number(row.id));
  if (!vippsIds.length && !avtalegiroIds.length) return result;

  const [reasons] = await DAO.query<
    {
      vippsAgreementID: string | null;
      avtalegiroAgreementID: number | null;
      reasonId: number;
      name: string;
      isOther: number;
      otherComment: string | null;
      timestamp: Date | null;
    }[]
  >(
    `SELECT R.vippsAgreementID, R.avtalegiroAgreementID, R.reasonID AS reasonId, RS.name,
       RS.isOther, R.otherComment, R.timestamp
     FROM Recurring_agreement_stopped R
     INNER JOIN Recurring_agreement_stopped_reasons RS ON RS.ID = R.reasonID
     WHERE R.vippsAgreementID IN (?) OR R.avtalegiroAgreementID IN (?)
     ORDER BY R.timestamp, R.ID`,
    // IN () with an empty list is a syntax error; NULL matches nothing
    [vippsIds.length ? vippsIds : [null], avtalegiroIds.length ? avtalegiroIds : [null]],
  );
  for (const reason of reasons) {
    const key =
      reason.vippsAgreementID !== null
        ? `vipps:${reason.vippsAgreementID}`
        : `avtalegiro:${reason.avtalegiroAgreementID}`;
    const comment = reason.isOther ? reason.otherComment?.trim() || null : null;
    const list = result.get(key) ?? [];
    list.push({
      reasonId: reason.reasonId,
      name: reason.name,
      comment,
      recorded: reason.timestamp,
    });
    result.set(key, list);
  }
  return result;
}

/** Latest donation, sum and count per donor, over all their donations */
async function getDonorStats(donorIds: number[]): Promise<Map<number, DonorDonationStats>> {
  const ids = [...new Set(donorIds)];
  if (!ids.length) return new Map();
  const [stats] = await DAO.query<
    { donorId: number; latestDonation: Date | null; donationSum: string; donationCount: number }[]
  >(
    `SELECT Donor_ID AS donorId, MAX(timestamp_confirmed) AS latestDonation,
       CAST(SUM(sum_confirmed) AS DECIMAL(16, 2)) AS donationSum, COUNT(*) AS donationCount
     FROM Donations
     WHERE Donor_ID IN (?)
     GROUP BY Donor_ID`,
    [ids],
  );
  return new Map(
    stats.map((row) => [
      row.donorId,
      {
        latestDonation: row.latestDonation,
        donationSum: String(row.donationSum),
        donationCount: Number(row.donationCount),
      },
    ]),
  );
}

/** Every reason a donor can pick, in the form's order */
async function getReasonOptions(): Promise<{ id: number; name: string; isOther: boolean }[]> {
  const [reasons] = await DAO.query<{ ID: number; name: string; isOther: number }[]>(
    "SELECT ID, name, isOther FROM Recurring_agreement_stopped_reasons ORDER BY `order`, ID",
  );
  return reasons.map((reason) => ({
    id: reason.ID,
    name: reason.name,
    isOther: Boolean(reason.isOther),
  }));
}

export const cancelledAgreements = {
  getList,
  getReasonOptions,
};
