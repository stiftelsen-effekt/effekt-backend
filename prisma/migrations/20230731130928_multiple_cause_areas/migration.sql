/*
  Warnings:

  - You are about to drop the column `UserID` on the `Referral_records` table. All the data in the column will be lost.
  - You are about to drop the `Auth0_users` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Combining_table` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Combining_temp` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Distribution` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Seeded` table. If the table is not empty, all the data it contains will be lost.

*/



-- Backup old data from combining table
CREATE TABLE `Combining_backup` LIKE `Combining_table`;
INSERT INTO `Combining_backup` SELECT * FROM `Combining_table`;

-- Backup old data from distribution table
CREATE TABLE `Distribution_backup` LIKE `Distribution`;
INSERT INTO `Distribution_backup` SELECT * FROM `Distribution`;


-- Before doing anything, we need to do some updates on combining table
-- Before some point in 2022, we did not register wether a distribution was a standard split or not
-- This means that we need to update all the rows that have no standard split value
-- For older distributions, we infer this by looking at the organizations the distribution is split between
-- In 2019, the standard split was 70 AMF (ID 1) and 30 SCI (ID 2)
-- After that, the standard split was 100 GiveWell top charities (ID 12)

-- It's fairly tricky how we should handle this. We've gone over and replaced all the 70 AMF 30 SCI split distribution with 70 AMF 30 GiveWell
-- after we removed SCI from our recommended charities. However, we should likely have updated all those to 100 GiveWell charities at the time,
-- since they probably wanted the automatic rebalancing upon further evidence. I've noted this in a separate issue, and we can deal with it when
-- we have time. I've checked, and all these "older" standard distributions are not in use in any active agreements, and don't seem to have any
-- donations on them for a long time. Therefore, I'm temporarily setting them to not standard distribution, and we'll get back to them later.

-- The query to handle this is a bit hairy, but here goes

-- Firstly, for the original AMF 70 SCI 30 split, we need to update all the rows that have no standard split value
UPDATE `Combining_backup` SET `Standard_split` = 0 
    WHERE KID IN (SELECT * FROM
        (SELECT KID
            FROM Combining_backup 
            
            INNER JOIN
                Distribution_backup ON Distribution_backup.ID = Combining_backup.Distribution_ID
            
            WHERE 
                Standard_split IS NULL
                
                AND 
                    ((Distribution_backup.OrgID = 1 AND percentage_share = 70) 
                    OR 
                    (Distribution_backup.OrgID = 2 AND percentage_share = 30))
                
            GROUP BY 
                KID
            
            HAVING
                -- Since we're doing this concat on the distribution, we must check for distributions with either 70% AMF, 30% SCI _OR_ 30% SCI 70% AMF
                GROUP_CONCAT(Distribution_backup.OrgID,':', ROUND(Distribution_backup.percentage_share))  = '1:70,2:30'
                OR
                GROUP_CONCAT(Distribution_backup.OrgID,':', ROUND(Distribution_backup.percentage_share))  = '2:30,1:70'
            ) KIDs);

-- Second we do this for the AMF 70 GiveWell 30 split
UPDATE `Combining_backup` SET `Standard_split` = 0 
    WHERE KID IN (SELECT * FROM
        (SELECT KID
            FROM Combining_backup 
            
            INNER JOIN
                Distribution_backup ON Distribution_backup.ID = Combining_backup.Distribution_ID
            
            WHERE 
                Standard_split IS NULL
                
                AND 
                    ((Distribution_backup.OrgID = 1 AND percentage_share = 70) 
                    OR 
                    (Distribution_backup.OrgID = 12 AND percentage_share = 30))
                
            GROUP BY 
                KID
            
            HAVING
                -- Since we're doing this concat on the distribution, we must check for distributions with either 70% AMF, 30% GiveWell _OR_ 30% GiveWell 70% AMF
                GROUP_CONCAT(Distribution_backup.OrgID,':', ROUND(Distribution_backup.percentage_share))  = '1:70,12:30'
                OR
                GROUP_CONCAT(Distribution_backup.OrgID,':', ROUND(Distribution_backup.percentage_share))  = '12:30,1:70'
            ) KIDs);

-- Okay, next we simply assume that all distributions 100% to GiveWell TCF are standard distributions
-- In summer 2022 we changed the system to register explicitly if the donor chose standard distribution
-- I checked, and there are NO distributions after this date that are 100% to GiveWell TCF that are not standard distributions
-- Therefore we can simply update all the rows that are 100% to GiveWell TCF to be standard distributions where the standard split is null
-- We can also safely do this directly on combining table, since it's 100% to GiveWell there is no  need for group by and nasty GROUP CONCAT's
UPDATE Combining_backup 
	INNER JOIN
		Distribution_backup ON Distribution_backup.ID = Combining_backup.Distribution_ID
	SET Standard_split = 1
	WHERE 
		Standard_split IS NULL
		AND 
        Distribution_backup.OrgID = 12 AND percentage_share = 100;

-- Finally, the rest of the rows that are not standard distributions are simply not standard distributions
UPDATE Combining_backup 
    SET Standard_split = 0
    WHERE 
        Standard_split IS NULL
        AND 
        KID <> '';


-- DropForeignKey
ALTER TABLE `Combining_table` DROP FOREIGN KEY `fk_Combining_to_Distribution`;

-- DropForeignKey
ALTER TABLE `Combining_table` DROP FOREIGN KEY `fk_Combining_to_Donor`;

-- DropForeignKey
ALTER TABLE `Combining_table` DROP FOREIGN KEY `fk_Combining_to_TaxUnit`;

-- DropForeignKey
ALTER TABLE `Distribution` DROP FOREIGN KEY `fk_Distribution_to_Organizations`;

-- DropForeignKey
ALTER TABLE `Referral_records` DROP FOREIGN KEY `referral_type`;

-- AlterTable
ALTER TABLE `Organizations` ADD COLUMN `cause_area_ID` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Paypal_historic_distributions` MODIFY `KID` VARCHAR(191) NOT NULL;

-- AlterTable remove foreign key FK_replacement_KID_to_Combining_table
ALTER TABLE `AvtaleGiro_replaced_distributions` DROP FOREIGN KEY `FK_replacement_KID_to_Combining_table`;

-- AlterTable
ALTER TABLE `Referral_records` DROP COLUMN `UserID`,
    ADD COLUMN `DonorID` INTEGER NULL;

-- DropTable
DROP TABLE `Auth0_users`;

-- DropTable
DROP TABLE `Combining_table`;

-- DropTable
DROP TABLE `Combining_temp`;

-- DropTable
DROP TABLE `Distribution`;

-- DropTable
DROP TABLE `Seeded`;

-- CreateTable
CREATE TABLE `Cause_areas` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(45) NOT NULL,
    `short_desc` VARCHAR(255) NULL,
    `long_desc` VARCHAR(45) NULL,
    `info_url` VARCHAR(156) NULL,
    `is_active` TINYINT NULL,
    `ordering` TINYINT NULL,

    UNIQUE INDEX `ID_UNIQUE`(`ID`),
    UNIQUE INDEX `name_UNIQUE`(`name`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Insert default global health cause area data (used for migration of old data)
INSERT INTO `Cause_areas` (`name`, `short_desc`, `long_desc`, `info_url`, `is_active`, `ordering`) VALUES ('Global helse', 'Global helse', 'Global helse', 'https://gieffektivt.no/', 1, 1);

-- CreateTable
CREATE TABLE `Distributions` (
    `KID` VARCHAR(16) NOT NULL,
    `Donor_ID` INTEGER NOT NULL,
    `Tax_unit_ID` INTEGER NULL DEFAULT 0,
    `Meta_owner_ID` INTEGER NOT NULL DEFAULT 3,
    `Replaced_old_organizations` BOOLEAN NULL DEFAULT false,
    `inserted` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`KID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Since the previous structure duplicated data over multiple rows, there exists a single donation with an
-- ambigous timestamp created. Rows were inserted and the times happened to roll over to the next second.
-- This is simply a fix to make sure that the timestamp is unambiguous.
UPDATE `Combining_backup` SET `Timestamp_created` = '2022-11-01 18:03:01' WHERE KID = '0675864790';

-- Select and group all the old rows from combining table by the new columns in Distributions
INSERT INTO `Distributions` (`KID`, `Donor_ID`, `Tax_unit_ID`, `Meta_owner_ID`, `Replaced_old_organizations`, `inserted`, `last_updated`)
    SELECT `KID`, `Donor_ID`, `Tax_unit_ID`, `Meta_owner_ID`, `Replaced_old_organizations`, `timestamp_created` as `inserted`, `timestamp_created` as `last_updated` FROM `Combining_backup` 
        GROUP BY `KID`, `Donor_ID`, `Tax_unit_ID`, `Meta_owner_ID`, `Replaced_old_organizations`, `inserted`, `last_updated`;

-- CreateTable
CREATE TABLE `Distribution_cause_areas` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Distribution_KID` VARCHAR(16) NOT NULL,
    `Cause_area_ID` INTEGER NOT NULL,
    `Percentage_share` DECIMAL(15, 12) NOT NULL,
    `Standard_split` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `ID_UNIQUE`(`ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Distribution_cause_area_organizations` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Distribution_cause_area_ID` INTEGER NOT NULL,
    `Organization_ID` INTEGER NOT NULL,
    `Percentage_share` DECIMAL(15, 12) NOT NULL,

    UNIQUE INDEX `ID_UNIQUE`(`ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Organizations` ADD CONSTRAINT `fk_Organizations_to_Cause_areas_idx` FOREIGN KEY (`cause_area_ID`) REFERENCES `Cause_areas`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "Original_AvtaleGiro_KID" and "Replacement_KID" in table "AvtaleGiro_replaced_distributions"
ALTER TABLE `AvtaleGiro_replaced_distributions` MODIFY `Original_AvtaleGiro_KID` VARCHAR(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
ALTER TABLE `AvtaleGiro_replaced_distributions` MODIFY `Replacement_KID` VARCHAR(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- Some cleanup for existing data, this specific record is incorrect and should be removed
DELETE FROM `AvtaleGiro_replaced_distributions` WHERE `Original_AvtaleGiro_KID` = '000973273939544' AND `Replacement_KID` = '000973654247889';

-- AddForeignKey
ALTER TABLE `AvtaleGiro_replaced_distributions` ADD CONSTRAINT `fk_AvtaleGiro_replaced_distributions_to_Distributions_idx` FOREIGN KEY (`Original_AvtaleGiro_KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AvtaleGiro_replaced_distributions` ADD CONSTRAINT `fk_AvtaleGiro_replaced_distributions_to_Distributions_idx2` FOREIGN KEY (`Replacement_KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "KID" in table "Avtalegiro_agreements"
ALTER TABLE `Avtalegiro_agreements` MODIFY `KID` VARCHAR(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- AddForeignKey
ALTER TABLE `Avtalegiro_agreements` ADD CONSTRAINT `fk_Avtalegiro_agreements_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "KID" in table "Avtalegiro_conversion_reminders"
ALTER TABLE `Avtalegiro_conversion_reminders` MODIFY `KID` VARCHAR(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- AddForeignKey
ALTER TABLE `Avtalegiro_conversion_reminders` ADD CONSTRAINT `fk_Avtalegiro_conversion_reminders_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Distributions` ADD CONSTRAINT `fk_Distributions_to_Donors_idx` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Distributions` ADD CONSTRAINT `fk_Distributions_to_Tax_unit_idx` FOREIGN KEY (`Tax_unit_ID`) REFERENCES `Tax_unit`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Distributions` ADD CONSTRAINT `fk_Distributions_to_Data_owner_idx` FOREIGN KEY (`Meta_owner_ID`) REFERENCES `Data_owner`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Distribution_cause_areas` ADD CONSTRAINT `fk_Distribution_cause_areas_to_Distributions_idx` FOREIGN KEY (`Distribution_KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Distribution_cause_areas` ADD CONSTRAINT `fk_Distribution_cause_areas_to_Cause_areas_idx` FOREIGN KEY (`Cause_area_ID`) REFERENCES `Cause_areas`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Distribution_cause_area_organizations` ADD CONSTRAINT `fk_Distribution_ca_organizations_to_Distribution_ca_idx` FOREIGN KEY (`Distribution_cause_area_ID`) REFERENCES `Distribution_cause_areas`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Distribution_cause_area_organizations` ADD CONSTRAINT `fk_Distribution_cause_area_organizations_to_Organizations_idx` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "KID_fordeling" in table "Donations"
ALTER TABLE `Donations` MODIFY `KID_fordeling` VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- Update two rows with incorrect KID
-- Likely caused by a cast to int from string (leading zeros missing)
-- I've cross-checked this with the vipps admin panel, and these seem to be tests for the vipps recurring integration
-- Registered on the anonymous donor
UPDATE `Donations` SET `KID_fordeling` = '001464121995259' WHERE `KID_fordeling` = '1464121995259';

-- AddForeignKey
ALTER TABLE `Donations` ADD CONSTRAINT `fk_Donations_to_Distributions_KID` FOREIGN KEY (`KID_fordeling`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "KID_fordeling" in table "Payment_intent"
ALTER TABLE `Payment_intent` MODIFY `KID_fordeling` VARCHAR(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

-- Clean up rows in Payment_intent that have a KID with no matching distribution
-- This seems to be mostly test-data, a lot of them are registered on me (Håkon)
-- I'm not sure about all of the records, but it should not be an important data loss anyways
-- Roughly 130 rows
DELETE FROM `Payment_intent` 
WHERE 
	`Id` IN (
		SELECT * FROM (
			SELECT `Id` FROM `Payment_intent`
				LEFT JOIN `Distributions`
					ON `Payment_intent`.`KID_fordeling` = `Distributions`.`KID`
					
				WHERE `Distributions`.`KID` IS NULL
			) Ids
		)
	AND
    `Id` > -1;

-- AddForeignKey
ALTER TABLE `Payment_intent` ADD CONSTRAINT `fk_Payment_intent_to_Distributions_idx` FOREIGN KEY (`KID_fordeling`) REFERENCES `Distributions`(`KID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Paypal_historic_distributions` ADD CONSTRAINT `fk_Paypal_historic_distributions_to_Donors_idx` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "KID" in table "Paypal_historic_distributions"
ALTER TABLE `Paypal_historic_distributions` MODIFY `KID` VARCHAR(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- Again, clean up rows in Payment_intent that have a KID with no matching distribution
-- These seem to be broken distributions that have at some point changed, but either way the agreements connected are all cancelled
-- Last donations recieved from them seem to be in 2019
DELETE FROM Paypal_historic_distributions
	WHERE 
    Paypal_historic_distributions.KID IN (
		SELECT * FROM (
			SELECT Paypal_historic_distributions.KID 
				FROM Paypal_historic_distributions
				
                LEFT JOIN Distributions
					ON Paypal_historic_distributions.KID = Distributions.KID
				
                WHERE Distributions.KID IS NULL) 
			KIDs)
	AND ID > -1;

-- AddForeignKey
ALTER TABLE `Paypal_historic_distributions` ADD CONSTRAINT `fk_Paypal_historic_distributions_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Referral_records` ADD CONSTRAINT `fk_Referral_records_to_Donors_idx` FOREIGN KEY (`DonorID`) REFERENCES `Donors`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Referral_records` ADD CONSTRAINT `referral_type` FOREIGN KEY (`ReferralID`) REFERENCES `Referral_types`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "KID" in table "Swish_order"
ALTER TABLE `Swish_order` MODIFY `KID` VARCHAR(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- AddForeignKey
ALTER TABLE `Swish_order` ADD CONSTRAINT `Swish_order_KID_fkey` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "KID" in table "Vipps_agreement_charges"
ALTER TABLE `Vipps_agreement_charges` MODIFY `KID` VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- In this table we have a bunch of distributions that have been replaced after organizations have been removed
-- Looking at the data, it seems a bunch of them just have to be pointed to the old KID, as the agreements might still be active,
-- but are now pointing at a new KID
-- The ones that do not have a a replacement KID seem to be an artifact from moving test-donations from my primary acount to the test account
-- for analysis purposes. I've identified the correct KID for the charges, and will update them to point to the correct KID

UPDATE `Vipps_agreement_charges` SET `KID` = '99241689' WHERE `KID` = '000027799576973' AND `chargeID` <> '';

UPDATE `Vipps_agreement_charges` 
    SET `KID` = (SELECT KID FROM Distributions WHERE KID = concat('0', Vipps_agreement_charges.KID))
    WHERE chargeID IN (SELECT * FROM (
            SELECT chargeID FROM Vipps_agreement_charges
                LEFT JOIN Distributions
                    ON Vipps_agreement_charges.KID = Distributions.KID
                
                WHERE Distributions.KID IS NULL) chargeIds)
    AND `chargeID` <> '';

-- AddForeignKey
ALTER TABLE `Vipps_agreement_charges` ADD CONSTRAINT `FK_KID_KID` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "KID" in table "Vipps_agreements"
ALTER TABLE `Vipps_agreements` MODIFY `KID` VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- For the vipps agreements there are only four with a missing KID
-- These are all tests on either Philip, anon or me (Håkon)
-- Same problem as before, they've been moved to a test donor, or the organizations have been removed, and the KID has not been updated accordingly

UPDATE `Vipps_agreements` 
    SET `KID` = (SELECT KID FROM Distributions WHERE KID = concat('0', Vipps_agreements.KID))
    WHERE ID IN (SELECT * FROM (
            SELECT ID FROM Vipps_agreements
                LEFT JOIN Distributions
                    ON Vipps_agreements.KID = Distributions.KID
                
                WHERE Distributions.KID IS NULL) agreementIds)
	AND ID <> '';

-- AddForeignKey
ALTER TABLE `Vipps_agreements` ADD CONSTRAINT `FK_KID` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "ResolveKID" in table "Vipps_matching_rules"
ALTER TABLE `Vipps_matching_rules` MODIFY `ResolveKID` VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- AddForeignKey
ALTER TABLE `Vipps_matching_rules` ADD CONSTRAINT `fk_Vipps_matching_rules_to_Distributions_idx` FOREIGN KEY (`ResolveKID`) REFERENCES `Distributions`(`KID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Removed borked orders where the donor ID on the row does not exist in the donors table
DELETE FROM Vipps_orders WHERE ID IN (SELECT * FROM (
    SELECT Vipps_orders.ID FROM Vipps_orders
        LEFT JOIN Donors
            ON Vipps_orders.donorID = Donors.ID
        
        WHERE Donors.ID IS NULL) orderIds)
    AND ID > -1;

-- AddForeignKey
ALTER TABLE `Vipps_orders` ADD CONSTRAINT `fk_Vipps_orders_to_Donors_idx` FOREIGN KEY (`donorID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Some rows have donationID set to 0 rather than NULL
-- Update them to NULL
UPDATE Vipps_orders SET donationID = NULL WHERE donationID = 0;

-- Remove some borked test orders
DELETE FROM Vipps_orders WHERE ID IN (23, 687, 742, 1322);

-- AddForeignKey
ALTER TABLE `Vipps_orders` ADD CONSTRAINT `fk_Vipps_orders_to_Donations_idx` FOREIGN KEY (`donationID`) REFERENCES `Donations`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Set characterset to utf8mb4 and collation to utf8mb4_unicode_ci for columns "KID" in table "Vipps_orders"
ALTER TABLE `Vipps_orders` MODIFY `KID` VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- Again, fix some vipps-orders that have wrong KIDs after a change of organizations
UPDATE `Vipps_orders` 
    SET `KID` = (SELECT KID FROM Distributions WHERE KID = concat('0', Vipps_orders.KID))
    WHERE ID IN (SELECT * FROM (
            SELECT ID FROM Vipps_orders
                LEFT JOIN Distributions
                    ON Vipps_orders.KID = Distributions.KID
                
                WHERE Distributions.KID IS NULL) orderIds)
    AND ID > -1;

-- AddForeignKey
ALTER TABLE `Vipps_orders` ADD CONSTRAINT `fk_Vipps_orders_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Time to fill in the new tables with old data
-- We start by filling in the distribution cause areas table
-- This is simple, all the distributions should have one row with 100% to global health
-- We fetch the standard distribution variable from combining table backup
INSERT INTO `Distribution_cause_areas` (`Distribution_KID`, `Cause_area_ID`, `Percentage_share`, `Standard_split`)
    SELECT `KID`, 1, 100, `Standard_split` FROM `Combining_backup` GROUP BY `KID`, `Standard_split`;

-- Now to the tricky bit, filling in the organizational split
INSERT INTO `Distribution_cause_area_organizations` (`Distribution_cause_area_ID`, `Organization_ID`, `Percentage_share`)
    SELECT 
        (SELECT `ID` FROM `Distribution_cause_areas` WHERE `Distribution_KID` = `KID`) as `Distribution_cause_area_ID`,
        `OrgID` as `Organization_ID`,
        `percentage_share` as `Percentage_share`
    FROM `Combining_backup`
        INNER JOIN `Distribution_backup` ON `Distribution_backup`.`ID` = `Combining_backup`.`Distribution_ID` 