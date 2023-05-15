SET
  GLOBAL log_bin_trust_function_creators = 1;

-- -------------------------------------------------------------
-- TablePlus 5.3.6(496)
--
-- https://tableplus.com/
--
-- Database: EffektDonasjonDB
-- Generation Time: 2023-05-15 18:29:50.8280
-- -------------------------------------------------------------
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */
;

/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */
;

/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */
;

/*!40101 SET NAMES utf8mb4 */
;

/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */
;

/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */
;

/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */
;

/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */
;

CREATE DEFINER = `root` @`%` PROCEDURE `add_donation`(
  sum_input INT,
  KID_input INT,
  payment_ID_input INT
) BEGIN
insert into
  EffektDonasjonDB.Donations (
    sum_confirmed,
    KID_fordeling,
    Donor_ID,
    Payment_ID
  )
VALUES
  (
    sum_input,
    KID_input,
    (
      select
        Donor_ID
      from
        Combining_table
      where
        KID = KID_input
      LIMIT
        1
    ), payment_ID_input
  );

END;

CREATE DEFINER = `root` @`%` PROCEDURE `archive_org_distributions`(IN inOrgId INT) BEGIN DECLARE finished INTEGER DEFAULT 0;

DECLARE KIDnr varchar(15) DEFAULT "";

DECLARE distributionLastInsert INT;

DECLARE distributionCounter INT DEFAULT 0;

DECLARE curKIDS CURSOR FOR
SELECT
  KID
FROM
  Combining_table as C
  INNER JOIN Distribution as D ON C.Distribution_ID = D.ID
WHERE
  D.OrgID = inOrgId;

-- declare NOT FOUND handler
DECLARE CONTINUE HANDLER FOR NOT FOUND
SET
  finished = 1;

OPEN curKIDS;

getKid: LOOP FETCH curKIDS INTO KIDnr;

IF finished = 1 THEN LEAVE getKid;

END IF;

-- Duplicate distribution rows
-- Replaces archived org with TCF
INSERT INTO
  Distribution (OrgID, percentage_share) (
    SELECT
      OrgID,
      percentage_share
    FROM
      Distribution
    WHERE
      ID IN (
        SELECT
          Distribution_ID
        FROM
          Combining_table
        WHERE
          KID = KIDnr
      )
  );

SET
  distributionCounter = ROW_COUNT();

-- This will inf act be the insert id of the FIRST row of all the rows inserted by the statement above
SET
  distributionLastInsert = last_insert_id();

-- Create new KID for historical distribution
createKID: LOOP IF distributionCounter = 0 THEN LEAVE createKID;

END IF;

INSERT INTO
  Combining_table (
    Donor_ID,
    Distribution_ID,
    Tax_unit_ID,
    KID,
    timestamp_created,
    Meta_owner_ID,
    Replaced_old_organizations,
    Standard_split
  ) (
    SELECT
      Donor_ID,
      distributionLastInsert + distributionCounter - 1 as Distribution_ID,
      Tax_unit_ID,
      CONCAT('0', KID) AS KID,
      NOW() as timestamp_created,
      Meta_owner_ID,
      1 as Replaced_old_organizations,
      Standard_split
    FROM
      Combining_table
    WHERE
      KID = KIDnr -- We are only selecting the information that is common for all rows
      -- When it pertains to a distribution
    LIMIT
      1
  );

SET
  distributionCounter = distributionCounter - 1;

END LOOP createKID;

-- Update existing donations to archived KID
UPDATE
  Donations
SET
  KID_Fordeling = CONCAT('0', KIDnr)
WHERE
  KID_Fordeling = KIDnr;

-- Set active the distribtion of active KID, remove archived org and replace it with TCF
UPDATE
  Distribution
SET
  OrgID = 12
WHERE
  ID = (
    SELECT
      Distribution_ID
    FROM
      (
        SELECT
          Distribution_ID
        FROM
          Combining_table as C
          INNER JOIN Distribution as D ON C.Distribution_ID = D.ID
        WHERE
          KID = KIDnr
          AND OrgID = inOrgId
      ) as distId
  );

END LOOP getKid;

CLOSE curKIDS;

END;

CREATE DEFINER = `%` @`%` FUNCTION `check_all_donations_sumto_100`() RETURNS tinyint(1) BEGIN if (
  COUNT(get_sum_of_donation_KIDs_not_totaling_100() > 0)
) then return 0;

else return 1;

end if;

END;

CREATE DEFINER = `root` @`%` PROCEDURE `consolidate_tax_units`(IN donorId INT) BEGIN DECLARE finished INTEGER DEFAULT 0;

DECLARE currentSsn varchar(11) DEFAULT "";

DECLARE selectedTaxUnitId INT;

# Get all tax units grouped by ssn
# Used after the donor is merged
DECLARE curSsns CURSOR FOR
SELECT
  ssn
FROM
  EffektDonasjonDB.Tax_unit
WHERE
  Donor_ID = donorId
GROUP BY
  ssn
HAVING
  COUNT(ssn) > 1;

DECLARE CONTINUE HANDLER FOR NOT FOUND
SET
  finished = 1;

# Loop over all where count of ssn > 1
OPEN curSsns;

consolidateTaxUnits: LOOP FETCH curSsns INTO currentSsn;

IF finished = 1 THEN LEAVE consolidateTaxUnits;

END IF;

SELECT
  ID
from
  Tax_unit
WHERE
  Donor_ID = donorId
  AND ssn = currentSsn
LIMIT
  1 INTO selectedTaxUnitId;

UPDATE
  Combining_table
SET
  Tax_unit_ID = selectedTaxUnitId
WHERE
  Donor_ID = donorId
  AND Tax_unit_ID IN (
    SELECT
      *
    FROM
      (
        SELECT
          ID
        FROM
          Tax_unit
        WHERE
          Donor_ID = donorId
          AND ssn = currentSsn
      ) as ids
  );

DELETE FROM
  Tax_unit
WHERE
  Donor_ID = donorId
  AND ssn = currentSsn
  AND ID != selectedTaxUnitId;

END LOOP consolidateTaxUnits;

CLOSE curSsns;

END;

CREATE DEFINER = `root` @`%` PROCEDURE `get_aggregate_donations_by_period`(start_date date, end_date date) BEGIN # Må kjøres en eller annen plass i koden, initielt
#SET sql_mode = "STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION";
SELECT
  Organizations.ID as id,
  full_name as orgName,
  sum(sum_confirmed * percentage_share * 0.01) as sum
FROM
  (
    Donations
    INNER JOIN Combining_table ON Donations.KID_fordeling = Combining_table.KID
    INNER JOIN Distribution ON Combining_table.Distribution_ID = Distribution.ID
    INNER JOIN Organizations ON Distribution.OrgID = Organizations.ID
  )
WHERE
  date(Donations.timestamp_confirmed) >= date(start_date)
  and date(Donations.timestamp_confirmed) <= date(end_date)
GROUP BY
  ID;

END;

CREATE DEFINER = `root` @`%` PROCEDURE `get_avtalegiro_agreement_expected_donations_by_date`(
  IN exp_year INT,
  IN exp_month INT,
  IN exp_date INT
) BEGIN
SELECT
  *
FROM
  Avtalegiro_agreements
WHERE
  payment_date = exp_date
  AND # Created six days before payment date
  created < DATE_SUB(
    DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)),
    interval 6 day
  )
  AND (
    # Is active
    active = 1
    OR # Or cancelled after payment date
    cancelled > DATE(CONCAT_WS('-', exp_year, exp_month, exp_date))
  );

END;

CREATE DEFINER = `root` @`%` PROCEDURE `get_avtalegiro_agreement_missing_donations_by_date`(
  IN exp_year INT,
  IN exp_month INT,
  IN exp_date INT
) BEGIN
SELECT
  AG.ID,
  Donors.email,
  Donors.full_name,
  ROUND(AG.amount / 100) as amount,
  AG.KID,
  AG.payment_date,
  AG.created,
  AG.last_updated,
  AG.cancelled,
  AG.`active`
FROM
  Avtalegiro_agreements as AG
  LEFT JOIN (
    SELECT
      *
    FROM
      Donations
    WHERE
      Payment_ID = 7
      AND timestamp_confirmed >= DATE(CONCAT_WS('-', exp_year, exp_month, exp_date))
      AND timestamp_confirmed < DATE_ADD(
        DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)),
        interval 1 month
      )
  ) as D ON AG.KID = D.KID_fordeling
  INNER JOIN Donors ON Donors.ID = (
    SELECT
      Donor_ID
    from
      Combining_table
    WHERE
      KID = AG.KID
    LIMIT
      1
  )
WHERE
  AG.payment_date = exp_date # Created six days before payment date
  AND AG.created < DATE_SUB(
    DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)),
    interval 6 day
  )
  AND (
    # Is active
    AG.active = 1 # Or cancelled after payment date
    OR AG.cancelled > DATE_SUB(
      DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)),
      interval 6 day
    )
  )
  AND D.sum_confirmed IS NULL;

END;

CREATE DEFINER = `root` @`%` PROCEDURE `get_avtalegiro_agreement_recieved_donations_by_date`(
  IN exp_year INT,
  IN exp_month INT,
  IN exp_date INT
) BEGIN
SELECT
  Donations.ID,
  Donors.email,
  Donors.full_name,
  Donations.sum_confirmed,
  Donations.transaction_cost,
  Donations.KID_fordeling,
  Donations.timestamp_confirmed
FROM
  Donations
  INNER JOIN Donors ON (
    SELECT
      Donor_ID
    FROM
      Combining_table
    WHERE
      Combining_table.KID = Donations.KID_fordeling
    GROUP BY
      Donor_ID
  ) = Donors.ID
WHERE
  KID_fordeling IN (
    SELECT
      KID
    FROM
      Avtalegiro_agreements
    WHERE
      payment_date = exp_date
      AND # Created six days before payment date
      created < DATE_SUB(
        DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)),
        interval 6 day
      )
      AND (
        # Is active
        active = 1
        OR # Or cancelled after payment date
        cancelled > DATE(CONCAT_WS('-', exp_year, exp_month, exp_date))
      )
  )
  AND Payment_ID = 7
  AND timestamp_confirmed >= DATE(CONCAT_WS('-', exp_year, exp_month, exp_date))
  AND timestamp_confirmed < DATE_ADD(
    DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)),
    interval 1 month
  );

END;

CREATE DEFINER = `root` @`%` PROCEDURE `get_avtalegiro_missing_since`(
  IN exp_year INT,
  IN exp_month INT,
  IN exp_date INT
) BEGIN
SELECT
  AG.ID,
  Donors.email,
  Donors.full_name,
  ROUND(AG.amount / 100) as amount,
  AG.KID,
  AG.payment_date,
  AG.created,
  AG.last_updated,
  AG.cancelled,
  AG.`active`
FROM
  Avtalegiro_agreements as AG
  LEFT JOIN (
    SELECT
      *
    FROM
      Donations
    WHERE
      Payment_ID = 7
      AND timestamp_confirmed >= DATE(CONCAT_WS('-', exp_year, exp_month, exp_date))
  ) as D ON AG.KID = D.KID_fordeling
  INNER JOIN Donors ON Donors.ID = (
    SELECT
      Donor_ID
    from
      Combining_table
    WHERE
      KID = AG.KID
    LIMIT
      1
  )
WHERE
  AG.payment_date >= exp_date
  AND AG.payment_date <= DAY(now()) # Created six days before payment date
  AND AG.created < DATE_SUB(
    DATE(
      CONCAT_WS('-', exp_year, exp_month, AG.payment_date)
    ),
    interval 6 day
  )
  AND (
    # Is active
    AG.active = 1 # Or cancelled after payment date
    OR AG.cancelled > DATE_SUB(
      DATE(
        CONCAT_WS('-', exp_year, exp_month, AG.payment_date)
      ),
      interval 6 day
    )
  )
  AND D.sum_confirmed IS NULL;

END;

CREATE DEFINER = `root` @`%` PROCEDURE `get_avtalegiro_validation`() BEGIN
SELECT
  payment_date as `date`,
  ROUND(SUM(amount) / 100) as expected,
  (
    SELECT
      IFNULL(ROUND(SUM(sum_confirmed)), 0)
    FROM
      Donations
    WHERE
      KID_Fordeling IN (
        SELECT
          KID
        FROM
          Avtalegiro_agreements
        WHERE
          payment_date = AG.payment_date
      )
      AND timestamp_confirmed >= if(
        day(now()) - payment_date < 0,
        DATE(
          CONCAT_WS(
            '-',
            YEAR((DATE_SUB(now(), interval 1 month))),
            MONTH((DATE_SUB(now(), interval 1 month))),
            AG.payment_date
          )
        ),
        DATE(
          CONCAT_WS('-', YEAR(now()), MONTH(now()), AG.payment_date)
        )
      )
      AND Payment_ID = 7
  ) as actual,
  (
    SELECT
      IFNULL(ROUND(SUM(sum_confirmed)), 0)
    FROM
      Donations
    WHERE
      KID_Fordeling IN (
        SELECT
          KID
        FROM
          Avtalegiro_agreements
        WHERE
          payment_date = AG.payment_date
      )
      AND timestamp_confirmed >= if(
        day(now()) - payment_date < 0,
        DATE(
          CONCAT_WS(
            '-',
            YEAR((DATE_SUB(now(), interval 1 month))),
            MONTH((DATE_SUB(now(), interval 1 month))),
            AG.payment_date
          )
        ),
        DATE(
          CONCAT_WS('-', YEAR(now()), MONTH(now()), AG.payment_date)
        )
      )
      AND Payment_ID = 7
  ) - ROUND(SUM(amount) / 100) as diff
FROM
  Avtalegiro_agreements as AG
WHERE
  (
    (
      Cancelled IS NULL
      AND active = 1
    )
    OR Cancelled > DATE_SUB(
      if(
        day(now()) - payment_date < 0,
        DATE(
          CONCAT_WS(
            '-',
            YEAR((DATE_SUB(now(), interval 1 month))),
            MONTH((DATE_SUB(now(), interval 1 month))),
            payment_date
          )
        ),
        DATE(
          CONCAT_WS('-', YEAR(now()), MONTH(now()), payment_date)
        )
      ),
      INTERVAL 6 DAY
    )
  )
  AND Created <= DATE_SUB(
    if(
      day(now()) - payment_date < 0,
      DATE(
        CONCAT_WS(
          '-',
          YEAR((DATE_SUB(now(), interval 1 month))),
          MONTH((DATE_SUB(now(), interval 1 month))),
          payment_date
        )
      ),
      DATE(
        CONCAT_WS('-', YEAR(now()), MONTH(now()), payment_date)
      )
    ),
    INTERVAL 6 DAY
  )
GROUP BY
  payment_date
ORDER BY
  if(
    day(now()) - payment_date < 0,
    ABS(payment_date - 28) + day(now()),
    day(now()) - payment_date
  ) ASC;

END;

CREATE DEFINER = `root` @`%` FUNCTION `get_conversion_rate`(
  treshold TIME,
  `from` DATE,
  `to` DATE,
  method INT
) RETURNS float BEGIN -- For calculation the rates
DECLARE hit DOUBLE DEFAULT 0;

DECLARE miss DOUBLE DEFAULT 0;

-- For use in loop
DECLARE match_id INT;

DECLARE match_delta TIMESTAMP;

DECLARE intent_id INT;

DECLARE done BOOLEAN DEFAULT 0;

-- Cursor related stuff for looping over payment intents
DECLARE intents CURSOR FOR
SELECT
  ID
FROM
  Payment_intent
WHERE
  `timetamp` > `from`
  AND `timetamp` < `to`
  AND Payment_method = method;

DECLARE CONTINUE HANDLER FOR SQLSTATE '02000'
SET
  done = 1;

-- Turn off safe mode
SET
  SQL_SAFE_UPDATES = 0;

DROP TEMPORARY TABLE IF EXISTS `temp_donations`;

CREATE TEMPORARY TABLE `temp_donations`
SELECT
  *
FROM
  Donations;

-- Loop over all payment intents
OPEN intents;

REPEAT FETCH intents INTO intent_id;

#Fetch matching donations to donation intent
SELECT
  Donations.ID,
  timediff(
    Donations.timestamp_confirmed,
    Payment_intent.timetamp
  ) as t_delta
FROM
  EffektDonasjonDB.Payment_intent
  LEFT JOIN `temp_donations` AS Donations ON (
    Donations.KID_fordeling = Payment_intent.KID_fordeling # - 10000 because vipps is mistakenly registered one hour wrong (timezone issues)
    AND timediff(
      Donations.timestamp_confirmed,
      Payment_intent.timetamp
    ) >= -10000
    AND Donations.Payment_ID = Payment_intent.Payment_method
  )
WHERE
  Payment_intent.ID = intent_id
ORDER BY
  t_delta ASC
LIMIT
  1 INTO match_id,
  match_delta;

IF (
  match_id IS NOT NULL
  AND match_delta < treshold
) THEN BEGIN
SET
  hit = hit + 1;

DELETE FROM
  `temp_donations`
WHERE
  ID = match_id;

END;

ELSE BEGIN
SET
  miss = miss + 1;

END;

END IF;

UNTIL done
END REPEAT;

DROP TEMPORARY TABLE IF EXISTS `temp_donations`;

-- Turn on safe mode
SET
  SQL_SAFE_UPDATES = 1;

RETURN hit /(miss + hit);

END;

CREATE DEFINER = `root` @`%` PROCEDURE `get_KID`() BEGIN
SELECT
  *
FROM
  Distribution as D
  INNER JOIN Combining_table as C ON D.ID = C.Distribution_ID;

END;

CREATE DEFINER = `%` @`%` FUNCTION `get_overall_conversion_rate`(treshold TIME, `from` DATE, `to` DATE) RETURNS float BEGIN -- For calculation the rates
DECLARE hit DOUBLE DEFAULT 0;

DECLARE miss DOUBLE DEFAULT 0;

-- For use in loop
DECLARE match_id INT;

DECLARE match_delta TIMESTAMP;

DECLARE intent_id INT;

DECLARE done BOOLEAN DEFAULT 0;

-- Cursor related stuff for looping over payment intents
DECLARE intents CURSOR FOR
SELECT
  ID
FROM
  Payment_intent
WHERE
  `timetamp` > `from`
  AND `timetamp` < `to`;

DECLARE CONTINUE HANDLER FOR SQLSTATE '02000'
SET
  done = 1;

-- Turn off safe mode
SET
  SQL_SAFE_UPDATES = 0;

DROP TEMPORARY TABLE IF EXISTS `temp_donations`;

CREATE TEMPORARY TABLE `temp_donations`
SELECT
  *
FROM
  Donations;

-- Loop over all payment intents
OPEN intents;

REPEAT FETCH intents INTO intent_id;

#Fetch matching donations to donation intent
SELECT
  Donations.ID,
  timediff(
    Donations.timestamp_confirmed,
    Payment_intent.timetamp
  ) as t_delta
FROM
  EffektDonasjonDB.Payment_intent
  LEFT JOIN `temp_donations` AS Donations ON (
    Donations.KID_fordeling = Payment_intent.KID_fordeling # - 10000 because vipps is mistakenly registered one hour wrong (timezone issues)
    AND timediff(
      Donations.timestamp_confirmed,
      Payment_intent.timetamp
    ) >= -10000
    AND Donations.Payment_ID = Payment_intent.Payment_method
  )
WHERE
  Payment_intent.ID = intent_id
ORDER BY
  t_delta ASC
LIMIT
  1 INTO match_id,
  match_delta;

IF (
  match_id IS NOT NULL
  AND match_delta < treshold
) THEN BEGIN
SET
  hit = hit + 1;

DELETE FROM
  `temp_donations`
WHERE
  ID = match_id;

END;

ELSE BEGIN
SET
  miss = miss + 1;

END;

END IF;

UNTIL done
END REPEAT;

DROP TEMPORARY TABLE IF EXISTS `temp_donations`;

-- Turn on safe mode
SET
  SQL_SAFE_UPDATES = 1;

RETURN hit /(miss + hit);

END;

CREATE DEFINER = `root` @`%` PROCEDURE `get_recurring_no_kid_bank_donors`() BEGIN
SELECT
  Donors.ID,
  Donations.KID_fordeling,
  count(*) as num_donations,
  Donors.full_name
FROM
  EffektDonasjonDB.Donations as Donations
  INNER JOIN EffektDonasjonDB.Donors as Donors ON Donor_ID = Donors.ID
WHERE
  Donations.Payment_ID = 5
GROUP BY
  CONCAT(Donations.Donor_ID, "-", Donations.KID_fordeling),
  Donors.full_name,
  Donors.ID,
  Donations.KID_fordeling
HAVING
  num_donations > 2
ORDER BY
  num_donations DESC;

END;

CREATE DEFINER = `root` @`%` PROCEDURE `get_sum_of_donation_KIDs_not_totaling_100`() BEGIN
SELECT
  KID,
  SUM(percentage_share) as summed
FROM
  EffektDonasjonDB.Distribution as D
  INNER JOIN Combining_table as C ON D.ID = C.Distribution_ID
GROUP BY
  KID
HAVING
  summed <> 100.000;

END;

CREATE DEFINER = `%` @`%` FUNCTION `intent_id`(treshold TIMESTAMP) RETURNS float BEGIN -- For calculation the rates
DECLARE hit DOUBLE DEFAULT 0;

DECLARE miss DOUBLE DEFAULT 0;

-- For use in loop
DECLARE match_id INT;

DECLARE match_delta TIMESTAMP;

DECLARE intent_id INT;

DECLARE done BOOLEAN DEFAULT 0;

-- Cursor related stuff for looping over payment intents
DECLARE intents CURSOR FOR
SELECT
  ID
FROM
  Payment_intent;

DECLARE CONTINUE HANDLER FOR SQLSTATE '02000'
SET
  done = 1;

DROP TEMPORARY TABLE IF EXISTS `temp_donations`;

CREATE TEMPORARY TABLE `temp_donations`
SELECT
  *
FROM
  Donations;

-- Loop over all payment intents
OPEN intents;

REPEAT FETCH intents INTO intent_id;

#Fetch matching donations to donation intent
SELECT
  Donations.ID,
  timediff(
    Donations.timestamp_confirmed,
    Payment_intent.timetamp
  ) as t_delta
FROM
  EffektDonasjonDB.Payment_intent
  LEFT JOIN `temp_donations` AS Donations ON (
    Donations.KID_fordeling = Payment_intent.KID_fordeling # - 10000 because vipps is mistakenly registered one hour wrong (timezone issues)
    AND timediff(
      Donations.timestamp_confirmed,
      Payment_intent.timetamp
    ) >= -10000
    AND Donations.Payment_ID = Payment_intent.Payment_method
  )
WHERE
  Payment_intent.ID = intent_id
ORDER BY
  t_delta ASC
LIMIT
  1 INTO match_id,
  match_delta;

IF (
  match_id IS NOT NULL
  AND match_delta < treshold
) THEN BEGIN
SET
  hit = hit + 1;

DELETE FROM
  `temp_donations`
WHERE
  ID = match_id;

END;

ELSE BEGIN
SET
  miss = miss + 1;

END;

END IF;

UNTIL done
END REPEAT;

DROP TEMPORARY TABLE IF EXISTS `temp_donations`;

RETURN hit /(miss + hit);

END;

CREATE DEFINER = `root` @`%` PROCEDURE `merge_donors`(IN sourceDonorId INT, IN destinationDonorId INT) BEGIN DECLARE finished INTEGER DEFAULT 0;

DECLARE currentSsn varchar(11) DEFAULT "";

DECLARE selectedTaxUnitId INT;

# Get all tax units grouped by ssn
# Used after the donor is merged
DECLARE curSsns CURSOR FOR
SELECT
  ssn
FROM
  EffektDonasjonDB.Tax_unit
WHERE
  Donor_ID = destinationDonorId
GROUP BY
  ssn
HAVING
  COUNT(ssn) > 1;

DECLARE exit handler for sqlexception BEGIN ROLLBACK;

RESIGNAL;

END;

DECLARE exit handler for sqlwarning BEGIN ROLLBACK;

RESIGNAL;

END;

DECLARE CONTINUE HANDLER FOR NOT FOUND
SET
  finished = 1;

# Start merging donor
START TRANSACTION;

UPDATE
  Combining_table
SET
  Donor_ID = destinationDonorId
WHERE
  Donor_ID = sourceDonorId;

UPDATE
  Donations
SET
  Donor_ID = destinationDonorId
WHERE
  Donor_ID = sourceDonorId
  AND ID > -1;

UPDATE
  Vipps_agreements
SET
  donorID = destinationDonorId
WHERE
  donorID = sourceDonorId
  AND ID != 'abc';

UPDATE
  Vipps_orders
SET
  donorID = destinationDonorId
WHERE
  donorID = sourceDonorId
  AND ID > -1;

UPDATE
  Paypal_historic_distributions
SET
  Donor_ID = destinationDonorId
WHERE
  Donor_ID = sourceDonorId
  AND ID > -1;

UPDATE
  Referral_records
SET
  UserID = destinationDonorId
WHERE
  UserID = sourceDonorId
  AND ID > -1;

UPDATE
  FB_payment_ID
SET
  donorID = destinationDonorId
WHERE
  donorID = sourceDonorId
  AND ID > -1;

UPDATE
  Tax_unit
SET
  Donor_ID = destinationDonorId
WHERE
  Donor_ID = sourceDonorId
  AND ID > -1;

DELETE FROM
  Donors
WHERE
  ID = sourceDonorId;

# Loop over all where count of ssn > 1
OPEN curSsns;

consolidateTaxUnits: LOOP FETCH curSsns INTO currentSsn;

IF finished = 1 THEN LEAVE consolidateTaxUnits;

END IF;

SELECT
  ID
from
  Tax_unit
WHERE
  Donor_ID = destinationDonorId
  AND ssn = currentSsn
LIMIT
  1 INTO selectedTaxUnitId;

UPDATE
  Combining_table
SET
  Tax_unit_ID = selectedTaxUnitId
WHERE
  Donor_ID = destinationDonorId
  AND Tax_unit_ID IN (
    SELECT
      *
    FROM
      (
        SELECT
          ID
        FROM
          Tax_unit
        WHERE
          Donor_ID = destinationDonorId
          AND ssn = currentSsn
      ) as ids
  );

DELETE FROM
  Tax_unit
WHERE
  Donor_ID = destinationDonorId
  AND ssn = currentSsn
  AND ID != selectedTaxUnitId;

END LOOP consolidateTaxUnits;

CLOSE curSsns;

COMMIT;

END;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */
;

/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */
;

/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */
;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */
;

/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */
;

/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */
;

/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */
;