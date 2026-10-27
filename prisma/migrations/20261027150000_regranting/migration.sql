-- Regranting ("tildelinger"), see docs/regranting.md. Additive: new tables and one view only;
-- no existing table changes shape.

-- CreateTable
CREATE TABLE `Payees` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'NOK',
    `bank_account` VARCHAR(64) NULL,
    `iban` VARCHAR(64) NULL,
    `swift` VARCHAR(16) NULL,
    `wallet` VARCHAR(128) NULL,
    `payment_reference_template` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Organization_payees` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Organization_ID` INTEGER NOT NULL,
    `Payee_ID` INTEGER NOT NULL,
    `valid_from` DATE NOT NULL,
    `valid_to` DATE NULL,

    INDEX `Organization_valid_from_idx`(`Organization_ID`, `valid_from`),
    INDEX `fk_Organization_payees_to_Payees_idx`(`Payee_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Projects` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Organization_ID` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `country` VARCHAR(64) NULL,
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'proposed',
    `agreement_ref` VARCHAR(255) NULL,
    `report_due` DATE NULL,
    `documents_url` VARCHAR(512) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_Projects_to_Organizations_idx`(`Organization_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Regrant_rounds` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `cutoff` DATE NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `min_transfer` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `created_by` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `approved_by` VARCHAR(255) NULL,
    `approved_at` DATETIME(0) NULL,
    `paid_at` DATE NULL,

    INDEX `Status_cutoff_idx`(`status`, `cutoff`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Regrant_round_donations` (
    `Round_ID` INTEGER NOT NULL,
    `Donation_ID` INTEGER NOT NULL,

    INDEX `fk_Regrant_round_donations_to_Donations_idx`(`Donation_ID`),
    PRIMARY KEY (`Round_ID`, `Donation_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Regrant_round_recipients` (
    `Round_ID` INTEGER NOT NULL,
    `Organization_ID` INTEGER NOT NULL,
    `include_direct` BOOLEAN NOT NULL,

    INDEX `fk_Regrant_round_recipients_to_Organizations_idx`(`Organization_ID`),
    PRIMARY KEY (`Round_ID`, `Organization_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Regrant_round_balances` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Round_ID` INTEGER NOT NULL,
    `Organization_ID` INTEGER NOT NULL,
    `Project_ID` INTEGER NULL,
    `balance_at_cutoff` DECIMAL(16, 2) NOT NULL,
    `committed` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `fund_grants` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `in_round` DECIMAL(16, 2) NOT NULL DEFAULT 0,
    `included_direct` BOOLEAN NOT NULL,

    INDEX `fk_Regrant_round_balances_to_Regrant_rounds_idx`(`Round_ID`),
    INDEX `fk_Regrant_round_balances_to_Organizations_idx`(`Organization_ID`),
    INDEX `fk_Regrant_round_balances_to_Projects_idx`(`Project_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Regrant_transfers` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Round_ID` INTEGER NOT NULL,
    `Payee_ID` INTEGER NOT NULL,
    `amount_nok` DECIMAL(16, 2) NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `amount_foreign` DECIMAL(24, 8) NULL,
    `fx_rate` DECIMAL(18, 8) NULL,
    `bank_fee` DECIMAL(16, 2) NULL,
    `paid_at` DATE NULL,
    `bank_ref` VARCHAR(255) NULL,
    `paid_by` VARCHAR(16) NOT NULL DEFAULT 'foundation',

    INDEX `fk_Regrant_transfers_to_Regrant_rounds_idx`(`Round_ID`),
    INDEX `fk_Regrant_transfers_to_Payees_idx`(`Payee_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Regrant_transfer_lines` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Transfer_ID` INTEGER NOT NULL,
    `Organization_ID` INTEGER NOT NULL,
    `Project_ID` INTEGER NULL,
    `amount_nok` DECIMAL(16, 2) NOT NULL,

    INDEX `fk_Regrant_transfer_lines_to_Regrant_transfers_idx`(`Transfer_ID`),
    INDEX `Organization_project_idx`(`Organization_ID`, `Project_ID`),
    INDEX `fk_Regrant_transfer_lines_to_Projects_idx`(`Project_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Regrant_adjustments` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Organization_ID` INTEGER NOT NULL,
    `Project_ID` INTEGER NULL,
    `amount` DECIMAL(16, 2) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `reason` TEXT NOT NULL,
    `effective_at` DATE NOT NULL,
    `Round_ID` INTEGER NULL,
    `linked_transfer_ID` INTEGER NULL,
    `linked_donation_ID` INTEGER NULL,
    `document_ref` VARCHAR(512) NULL,
    `created_by` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `Organization_effective_at_idx`(`Organization_ID`, `effective_at`),
    INDEX `fk_Regrant_adjustments_to_Projects_idx`(`Project_ID`),
    INDEX `fk_Regrant_adjustments_to_Regrant_rounds_idx`(`Round_ID`),
    INDEX `fk_Regrant_adjustments_to_Regrant_transfers_idx`(`linked_transfer_ID`),
    INDEX `fk_Regrant_adjustments_to_Donations_idx`(`linked_donation_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Funds` (
    `Organization_ID` INTEGER NOT NULL,
    `max_hold_days` INTEGER NULL,

    PRIMARY KEY (`Organization_ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Fund_grants` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Fund_ID` INTEGER NOT NULL,
    `Round_ID` INTEGER NOT NULL,
    `rationale` TEXT NOT NULL,
    `approved_by` VARCHAR(255) NULL,
    `approved_at` DATETIME(0) NULL,
    `created_by` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_Fund_grants_to_Funds_idx`(`Fund_ID`),
    INDEX `fk_Fund_grants_to_Regrant_rounds_idx`(`Round_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Fund_grant_lines` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Fund_grant_ID` INTEGER NOT NULL,
    `Organization_ID` INTEGER NOT NULL,
    `Project_ID` INTEGER NULL,
    `amount` DECIMAL(16, 2) NOT NULL,

    INDEX `fk_Fund_grant_lines_to_Fund_grants_idx`(`Fund_grant_ID`),
    INDEX `Organization_project_idx`(`Organization_ID`, `Project_ID`),
    INDEX `fk_Fund_grant_lines_to_Projects_idx`(`Project_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Regrant_holds` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Organization_ID` INTEGER NOT NULL,
    `Project_ID` INTEGER NULL,
    `reason` TEXT NOT NULL,
    `until` DATE NULL,
    `created_by` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_Regrant_holds_to_Organizations_idx`(`Organization_ID`),
    INDEX `fk_Regrant_holds_to_Projects_idx`(`Project_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Organization_payees` ADD CONSTRAINT `fk_Organization_payees_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Organization_payees` ADD CONSTRAINT `fk_Organization_payees_to_Payees` FOREIGN KEY (`Payee_ID`) REFERENCES `Payees`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Projects` ADD CONSTRAINT `fk_Projects_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_round_donations` ADD CONSTRAINT `fk_Regrant_round_donations_to_Regrant_rounds` FOREIGN KEY (`Round_ID`) REFERENCES `Regrant_rounds`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_round_donations` ADD CONSTRAINT `fk_Regrant_round_donations_to_Donations` FOREIGN KEY (`Donation_ID`) REFERENCES `Donations`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_round_recipients` ADD CONSTRAINT `fk_Regrant_round_recipients_to_Regrant_rounds` FOREIGN KEY (`Round_ID`) REFERENCES `Regrant_rounds`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_round_recipients` ADD CONSTRAINT `fk_Regrant_round_recipients_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_round_balances` ADD CONSTRAINT `fk_Regrant_round_balances_to_Regrant_rounds` FOREIGN KEY (`Round_ID`) REFERENCES `Regrant_rounds`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_round_balances` ADD CONSTRAINT `fk_Regrant_round_balances_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_round_balances` ADD CONSTRAINT `fk_Regrant_round_balances_to_Projects` FOREIGN KEY (`Project_ID`) REFERENCES `Projects`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_transfers` ADD CONSTRAINT `fk_Regrant_transfers_to_Regrant_rounds` FOREIGN KEY (`Round_ID`) REFERENCES `Regrant_rounds`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_transfers` ADD CONSTRAINT `fk_Regrant_transfers_to_Payees` FOREIGN KEY (`Payee_ID`) REFERENCES `Payees`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_transfer_lines` ADD CONSTRAINT `fk_Regrant_transfer_lines_to_Regrant_transfers` FOREIGN KEY (`Transfer_ID`) REFERENCES `Regrant_transfers`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_transfer_lines` ADD CONSTRAINT `fk_Regrant_transfer_lines_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_transfer_lines` ADD CONSTRAINT `fk_Regrant_transfer_lines_to_Projects` FOREIGN KEY (`Project_ID`) REFERENCES `Projects`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_adjustments` ADD CONSTRAINT `fk_Regrant_adjustments_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_adjustments` ADD CONSTRAINT `fk_Regrant_adjustments_to_Projects` FOREIGN KEY (`Project_ID`) REFERENCES `Projects`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_adjustments` ADD CONSTRAINT `fk_Regrant_adjustments_to_Regrant_rounds` FOREIGN KEY (`Round_ID`) REFERENCES `Regrant_rounds`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_adjustments` ADD CONSTRAINT `fk_Regrant_adjustments_to_Regrant_transfers` FOREIGN KEY (`linked_transfer_ID`) REFERENCES `Regrant_transfers`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_adjustments` ADD CONSTRAINT `fk_Regrant_adjustments_to_Donations` FOREIGN KEY (`linked_donation_ID`) REFERENCES `Donations`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Funds` ADD CONSTRAINT `fk_Funds_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fund_grants` ADD CONSTRAINT `fk_Fund_grants_to_Funds` FOREIGN KEY (`Fund_ID`) REFERENCES `Funds`(`Organization_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fund_grants` ADD CONSTRAINT `fk_Fund_grants_to_Regrant_rounds` FOREIGN KEY (`Round_ID`) REFERENCES `Regrant_rounds`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fund_grant_lines` ADD CONSTRAINT `fk_Fund_grant_lines_to_Fund_grants` FOREIGN KEY (`Fund_grant_ID`) REFERENCES `Fund_grants`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fund_grant_lines` ADD CONSTRAINT `fk_Fund_grant_lines_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fund_grant_lines` ADD CONSTRAINT `fk_Fund_grant_lines_to_Projects` FOREIGN KEY (`Project_ID`) REFERENCES `Projects`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_holds` ADD CONSTRAINT `fk_Regrant_holds_to_Organizations` FOREIGN KEY (`Organization_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_holds` ADD CONSTRAINT `fk_Regrant_holds_to_Projects` FOREIGN KEY (`Project_ID`) REFERENCES `Projects`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Allocations: the part of each donation that goes to each recipient. Calculated, never stored.
-- Payment 15 (Influenced) and 16 (AMF direkte) never pass through our accounts. Drift is a
-- recipient like any other. Donations without a split have no rows ("Unassigned").
CREATE OR REPLACE ALGORITHM = MERGE SQL SECURITY INVOKER VIEW `Regrant_allocations` AS
SELECT d.ID AS Donation_ID,
       dcao.Organization_ID,
       d.sum_confirmed * dca.Percentage_share / 100 * dcao.Percentage_share / 100 AS amount,
       d.timestamp_confirmed
FROM Donations d
JOIN Distribution_cause_areas dca ON dca.Distribution_KID = d.KID_fordeling
JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
WHERE d.Payment_ID NOT IN (15, 16);
