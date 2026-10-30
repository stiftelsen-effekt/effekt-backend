-- Downstream regrants (docs/regranting-downstream.md): what an intermediary payee (GiveWell) did
-- with each of our transfer lines, as it reports to us. Records beside the ledger, never ledger
-- entries: balances, rounds, transfers and transfer lines are unchanged.
--
-- Additive: five new tables and one nullable column on Regrant_documents (an onward report as a
-- fourth possible parent). The marker rows are seeded only where the rows exist, because preview
-- and dev databases differ from production.

-- CreateTable
CREATE TABLE `Intermediary_payees` (
    `Payee_ID` INTEGER NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'USD',
    `notes` TEXT NULL,

    PRIMARY KEY (`Payee_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Regranting_funds` (
    `Organization_ID` INTEGER NOT NULL,
    `notes` TEXT NULL,

    PRIMARY KEY (`Organization_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `External_grantees` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `country` VARCHAR(64) NULL,
    `url` VARCHAR(512) NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `External_grantees_name_key`(`name`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Onward_reports` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Payee_ID` INTEGER NOT NULL,
    `reported_at` DATE NOT NULL,
    `reference` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `created_by` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `Payee_reported_at_idx`(`Payee_ID`, `reported_at`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Onward_allocations` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Transfer_line_ID` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `basis` VARCHAR(16) NOT NULL,
    `Organization_ID` INTEGER NULL,
    `External_grantee_ID` INTEGER NULL,
    `Project_ID` INTEGER NULL,
    `currency` VARCHAR(8) NOT NULL,
    `amount_foreign` DECIMAL(24, 8) NULL,
    `amount_nok` DECIMAL(16, 2) NOT NULL,
    `forwarded_at` DATE NOT NULL,
    `Report_ID` INTEGER NULL,
    `purpose` VARCHAR(255) NULL,
    `note` TEXT NULL,
    `created_by` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` VARCHAR(255) NULL,
    `updated_at` DATETIME(0) NULL,

    INDEX `fk_Onward_allocations_to_Regrant_transfer_lines_idx`(`Transfer_line_ID`),
    INDEX `fk_Onward_allocations_to_Organizations_idx`(`Organization_ID`, `Project_ID`),
    INDEX `fk_Onward_allocations_to_External_grantees_idx`(`External_grantee_ID`),
    INDEX `fk_Onward_allocations_to_Projects_idx`(`Project_ID`),
    INDEX `fk_Onward_allocations_to_Onward_reports_idx`(`Report_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Regrant_documents` ADD COLUMN `Onward_report_ID` INTEGER NULL,
    ADD INDEX `fk_Regrant_documents_to_Onward_reports_idx`(`Onward_report_ID`);

-- AddForeignKey
ALTER TABLE `Intermediary_payees` ADD CONSTRAINT `fk_Intermediary_payees_to_Payees` FOREIGN KEY (`Payee_ID`) REFERENCES `Payees`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regranting_funds` ADD CONSTRAINT `fk_Regranting_funds_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Onward_reports` ADD CONSTRAINT `fk_Onward_reports_to_Intermediary_payees` FOREIGN KEY (`Payee_ID`) REFERENCES `Intermediary_payees`(`Payee_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (lines of paid transfers are never deleted; RESTRICT keeps onward records from
-- disappearing silently if a payment is ever cleared and the lines rewritten)
ALTER TABLE `Onward_allocations` ADD CONSTRAINT `fk_Onward_allocations_to_Regrant_transfer_lines` FOREIGN KEY (`Transfer_line_ID`) REFERENCES `Regrant_transfer_lines`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Onward_allocations` ADD CONSTRAINT `fk_Onward_allocations_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Onward_allocations` ADD CONSTRAINT `fk_Onward_allocations_to_External_grantees` FOREIGN KEY (`External_grantee_ID`) REFERENCES `External_grantees`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Onward_allocations` ADD CONSTRAINT `fk_Onward_allocations_to_Projects` FOREIGN KEY (`Project_ID`) REFERENCES `Projects`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Onward_allocations` ADD CONSTRAINT `fk_Onward_allocations_to_Onward_reports` FOREIGN KEY (`Report_ID`) REFERENCES `Onward_reports`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_documents` ADD CONSTRAINT `fk_Regrant_documents_to_Onward_reports` FOREIGN KEY (`Onward_report_ID`) REFERENCES `Onward_reports`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Markers. GiveWell (looked up by name) is an intermediary payee that reports in USD; skipped
-- where there is no such payee.
INSERT INTO `Intermediary_payees` (`Payee_ID`, `currency`, `notes`)
SELECT p.`ID`, 'USD', 'Forwards pass-through lines and regrants TCF/AGF lines'
FROM `Payees` p
WHERE p.`name` = 'GiveWell';

-- GiveWell's Top Charities Fund (ID 12; the Maximum Impact Fund before Sept 2022) and All Grants
-- Fund (ID 15) in production. Only where that row exists, is a GiveWell fund (dev and preview
-- databases use other ids, and their 12 and 15 are other recipients) and isn't an own fund.
INSERT INTO `Regranting_funds` (`Organization_ID`, `notes`)
SELECT o.`ID`, CASE o.`ID` WHEN 12 THEN 'GiveWell Top Charities Fund' ELSE 'GiveWell All Grants Fund' END
FROM `Organizations` o
WHERE o.`ID` IN (12, 15)
  AND o.`full_name` LIKE '%GiveWell%'
  AND NOT EXISTS (SELECT 1 FROM `Funds` f WHERE f.`Organization_ID` = o.`ID`);
