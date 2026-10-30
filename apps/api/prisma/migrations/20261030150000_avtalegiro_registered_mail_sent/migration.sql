-- AlterTable
-- When the "agreement registered" email was sent, so the Nets return URL sends it once per agreement
ALTER TABLE `Avtalegiro_agreements` ADD COLUMN `registered_mail_sent` DATETIME(0) NULL;

-- Agreements older than a day have been through the return URL already (or never will be): mark
-- them sent. Newer ones may still be on their way back from Nets and get the email then.
-- last_updated is kept as it is.
UPDATE `Avtalegiro_agreements`
  SET `registered_mail_sent` = COALESCE(`created`, NOW()), `last_updated` = `last_updated`
  WHERE `created` IS NULL OR `created` < NOW() - INTERVAL 1 DAY;
