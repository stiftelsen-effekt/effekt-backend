-- At most one live AutoGiro charge (PENDING, COMPLETED or FAILED) per agreement and claim month.
-- AMENDED and CANCELLED charges are replaced or withdrawn, so they don't count.
--
-- Charges created before this migration are left out of the key (NULL): some agreements have
-- two completed charges in the same month from 2024, and historical rows are not changed.
-- The cutoff compares `created`, which is filled by the DB clock, with a date in that clock.
ALTER TABLE `AutoGiro_agreement_charges`
  ADD COLUMN `claim_month_key` VARCHAR(6) GENERATED ALWAYS AS (
    IF(
      `status` IN ('PENDING', 'COMPLETED', 'FAILED') AND `created` >= '2026-11-01 00:00:00',
      DATE_FORMAT(`claim_date`, '%Y%m'),
      NULL
    )
  ) STORED;

CREATE UNIQUE INDEX `AutoGiro_agreement_charges_agreementID_claim_month_key_key`
  ON `AutoGiro_agreement_charges`(`agreementID`, `claim_month_key`);
