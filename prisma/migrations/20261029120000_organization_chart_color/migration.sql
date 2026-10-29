-- Each organization's chart colour in the admin, so an organization looks the same on every
-- page. Holds a palette token name ("chart-3"), not a colour, so light and dark themes keep
-- working; the allowed names are src/custom_modules/orgChartColors.ts. NULL: the admin derives
-- one from the id. Additive: a nullable column (instant in MySQL 8) and updates on the small
-- Organizations table only.

-- AlterTable
ALTER TABLE `Organizations` ADD COLUMN `chart_color` VARCHAR(16) NULL;

-- Backfill: active organizations first, then rank by all-time donation volume (its share of each confirmed
-- donation), ties and organizations without donations by id, and give them the palette in
-- order, strong colours first. The largest organizations get distinct colours; past the 14th
-- the palette repeats. Deterministic: the same data gives the same colours.
--
-- READ COMMITTED: the ranking then reads Donations and the distribution tables as a plain
-- snapshot instead of share-locking their rows for the update, so donations keep coming in.
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;

UPDATE `Organizations` AS O
  INNER JOIN (
    SELECT
      volumes.ID,
      ROW_NUMBER() OVER (ORDER BY volumes.is_active DESC, volumes.volume DESC, volumes.ID ASC) AS position
    FROM (
      SELECT
        Org.ID,
        Org.is_active,
        COALESCE(
          SUM(D.sum_confirmed * CA.Percentage_share / 100 * CAO.Percentage_share / 100),
          0
        ) AS volume
      FROM `Organizations` AS Org
        LEFT JOIN `Distribution_cause_area_organizations` AS CAO ON CAO.Organization_ID = Org.ID
        LEFT JOIN `Distribution_cause_areas` AS CA ON CA.ID = CAO.Distribution_cause_area_ID
        LEFT JOIN `Donations` AS D ON D.KID_fordeling = CA.Distribution_KID
      GROUP BY Org.ID, Org.is_active
    ) AS volumes
  ) AS ranked ON ranked.ID = O.ID
SET O.chart_color = ELT(
  MOD(ranked.position - 1, 14) + 1,
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-10', 'chart-11', 'chart-12',
  'chart-6', 'chart-7', 'chart-8', 'chart-9', 'chart-13', 'chart-14', 'chart-15'
)
WHERE O.chart_color IS NULL;

SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
