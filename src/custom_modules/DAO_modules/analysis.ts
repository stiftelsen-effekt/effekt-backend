import { DAO } from "../DAO";

/** Milestone for the "through time" total, shown on the analysis overview */
export const THROUGH_TIME_MILESTONE = 200_000_000;

export type AnalysisOverview = {
  thisYear: {
    year: number;
    sum: number;
  };
  throughTime: {
    /** Measured only. Pledges are never mixed into this number */
    measured: number;
    donations: number;
    from: string | null;
  };
  pledges: {
    open: number;
    count: number;
  };
  withPledges: {
    sum: number;
    milestone: number;
    remaining: number;
    passed: boolean;
  };
};

/**
 * Raw sums from the database, before they are combined into the overview.
 */
export type AnalysisOverviewTotals = {
  year: number;
  thisYearSum: number;
  throughTimeMeasured: number;
  throughTimeDonations: number;
  throughTimeFrom: Date | null;
  openPledgesSum: number;
  openPledgesCount: number;
};

/**
 * Combines the raw sums into the overview. Kept separate from the queries so the
 * rules can be tested without a database.
 */
export function buildOverview(
  totals: AnalysisOverviewTotals,
  milestone = THROUGH_TIME_MILESTONE,
): AnalysisOverview {
  const measured = Math.round(totals.throughTimeMeasured);
  const open = Math.round(totals.openPledgesSum);
  const withPledges = measured + open;

  return {
    thisYear: {
      year: totals.year,
      sum: Math.round(totals.thisYearSum),
    },
    throughTime: {
      measured,
      donations: totals.throughTimeDonations,
      from: totals.throughTimeFrom ? totals.throughTimeFrom.toISOString().slice(0, 10) : null,
    },
    pledges: {
      open,
      count: totals.openPledgesCount,
    },
    withPledges: {
      sum: withPledges,
      milestone,
      remaining: Math.max(milestone - withPledges, 0),
      passed: withPledges >= milestone,
    },
  };
}

/**
 * Sums for the analysis overview. Same definitions as the analysis pipeline
 * (Data-Analysis-1), so the numbers can be compared one to one:
 *
 * - This year: every confirmed donation this calendar year up to now, including
 *   support for our own operations and Influenced donations.
 * - Through time: what has gone on to the recipients since the start. The share of
 *   each donation that went to operations (organization "Drift") is held outside,
 *   as on the counter on the website. Influenced donations are included.
 * - Open pledges: decided but not received gifts, kept as a separate layer.
 */
async function getOverviewTotals(now: Date = new Date()): Promise<AnalysisOverviewTotals> {
  const year = now.getFullYear();

  const [[thisYear]] = await DAO.query<{ sum: string | null }[]>(
    `
    SELECT SUM(sum_confirmed) AS sum
    FROM Donations
    WHERE YEAR(timestamp_confirmed) = ? AND timestamp_confirmed <= ?
    `,
    // YEAR() on the stored value, as the pipeline does. A JS date for 1 January would be
    // sent as UTC and pull in the last hour of New Year's Eve.
    [year, now],
  );

  const [[throughTime]] = await DAO.query<
    { measured: string | null; donations: number; first: Date | null }[]
  >(
    `
    SELECT
      SUM(t.to_recipients) AS measured,
      COUNT(*) AS donations,
      MIN(t.timestamp_confirmed) AS first
    FROM (
      SELECT
        d.timestamp_confirmed,
        d.sum_confirmed * (1 - COALESCE(operations.share, 0)) AS to_recipients
      FROM Donations d
      LEFT JOIN (
        SELECT dca.Distribution_KID AS KID,
          SUM(dca.Percentage_share / 100 * dcao.Percentage_share / 100) AS share
        FROM Distribution_cause_areas dca
        JOIN Distribution_cause_area_organizations dcao
          ON dcao.Distribution_cause_area_ID = dca.ID
        JOIN Organizations o ON o.ID = dcao.Organization_ID
        WHERE o.abbriv = 'Drift' AND dcao.Percentage_share > 0
        GROUP BY dca.Distribution_KID
      ) operations ON operations.KID = d.KID_fordeling
      WHERE d.timestamp_confirmed IS NOT NULL
    ) t
    WHERE t.to_recipients > 0
    `,
  );

  const [[pledges]] = await DAO.query<{ sum: string | null; count: number }[]>(
    `
    SELECT SUM(Sum) AS sum, COUNT(*) AS count
    FROM Pledges
    WHERE Received_date IS NULL
    `,
  );

  return {
    year,
    thisYearSum: parseFloat(thisYear.sum ?? "0"),
    throughTimeMeasured: parseFloat(throughTime.measured ?? "0"),
    throughTimeDonations: Number(throughTime.donations),
    throughTimeFrom: throughTime.first ? new Date(throughTime.first) : null,
    openPledgesSum: parseFloat(pledges.sum ?? "0"),
    openPledgesCount: Number(pledges.count),
  };
}

export const analysis = {
  getOverviewTotals,
};
