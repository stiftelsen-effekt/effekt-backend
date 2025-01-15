/*
  Warnings:

  - You are about to alter the column `ssn` on the `Tax_unit` table. The data in that column could be lost. The data in that column will be cast from `VarChar(16)` to `VarChar(11)`.

*/

-- The purpose of this section is to safely drop a foreign key constraint from the `Referral_records` table, linking the `DonorID` column to the `Donors` table. The procedure `DropForeignKeyIfExist` first checks if the foreign key `fk_referral_record_donor_id` already exists to avoid errors when dropping the constraint. If the foreign key exists, it is then dropped. This ensures that the migration can be run idempotently, avoiding errors on subsequent executions.

-- 1. Create the procedure
CREATE PROCEDURE DropForeignKeyIfExist()
BEGIN
    DECLARE _foreignKeyExists INT DEFAULT 0;

    SELECT COUNT(*) INTO _foreignKeyExists
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE table_name = 'Referral_records'
    AND constraint_name = 'fk_referral_record_donor_id'
    AND table_schema = DATABASE();

    IF _foreignKeyExists = 1 THEN
      ALTER TABLE `Referral_records` DROP FOREIGN KEY `fk_referral_record_donor_id`;
    END IF;
END;

-- 2. Call the procedure
CALL DropForeignKeyIfExist();

-- 3. Drop the procedure
DROP PROCEDURE DropForeignKeyIfExist;

-- The purpose of this section is to safely add a foreign key constraint to the `Swish_orders` table
-- linking the `KID` column to the `Distributions` table, with specific rules for ON DELETE and ON UPDATE actions.

-- 1. Create the procedure
CREATE PROCEDURE DropForeignKeyIfExist()
BEGIN
    DECLARE _foreignKeyExists INT DEFAULT 0;

    SELECT COUNT(*) INTO _foreignKeyExists
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE table_name = 'Swish_orders'
    AND constraint_name = 'Swish_order_KID_fkey'
    AND table_schema = DATABASE();

    IF _foreignKeyExists = 1 THEN
      ALTER TABLE `Swish_orders` DROP FOREIGN KEY `Swish_order_KID_fkey`;
    END IF;
END;

-- 2. Call the procedure
CALL DropForeignKeyIfExist();

-- 3. Drop the procedure
DROP PROCEDURE DropForeignKeyIfExist;

-- AlterTable
ALTER TABLE `Payment_intent` ADD COLUMN `timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0);

-- The purpose of this section is to safely add a column `Payment_amount` to the `Payment_intent` table if it does not already exist. The `ALTER TABLE` statement includes the `IF NOT EXISTS` clause to check if the column exists before adding it. This ensures that the migration can be run idempotently, avoiding errors on subsequent executions.

-- Step 1: Create the procedure
CREATE PROCEDURE AddColumnIfNotExist()
BEGIN
    DECLARE _columnExists INT DEFAULT 0;

    SELECT COUNT(*) INTO _columnExists
    FROM information_schema.COLUMNS
    WHERE TABLE_NAME = 'Payment_intent'
    AND COLUMN_NAME = 'Payment_amount'
    AND TABLE_SCHEMA = DATABASE();

    IF _columnExists = 0 THEN
      ALTER TABLE `Payment_intent` ADD COLUMN `Payment_amount` INTEGER NULL;
    END IF;
END;

-- Step 2: Call the procedure
CALL AddColumnIfNotExist();

-- Step 3: Drop the procedure
DROP PROCEDURE AddColumnIfNotExist;

-- CreateTable
CREATE TABLE `Payment_follow_up` (
    `Id` INTEGER NOT NULL AUTO_INCREMENT,
    `Payment_intent_id` INTEGER NOT NULL,
    `Follow_up_date` DATETIME(0) NOT NULL,

    PRIMARY KEY (`Id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Temporary drop foreign key from legacy se distribution connection to donations if it exists

-- Step 1: Create the procedure
CREATE PROCEDURE DropForeignKeyIfExist()
BEGIN
    DECLARE _foreignKeyExists INT DEFAULT 0;

    SELECT COUNT(*) INTO _foreignKeyExists
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE table_name = 'LegacySeDistributionConnection'
    AND constraint_name = 'fk_LegacySeDistributionConnection_to_Donations_idx'
    AND table_schema = DATABASE();

    IF _foreignKeyExists = 1 THEN
      ALTER TABLE `LegacySeDistributionConnection` DROP FOREIGN KEY `fk_LegacySeDistributionConnection_to_Donations_idx`;
    END IF;
END;

-- Step 2: Call the procedure
CALL DropForeignKeyIfExist();

-- Step 3: Drop the procedure
DROP PROCEDURE DropForeignKeyIfExist;

-- Set character set for legacy se distribution connection
ALTER TABLE `LegacySeDistributionConnection` MODIFY `paymentID` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci  NOT NULL;

-- Set character set for external id
ALTER TABLE `Donations` MODIFY `PaymentExternal_ID` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci  NULL;

-- Remove legacy connections with adoveo as legacy KID
DELETE FROM `LegacySeDistributionConnection` WHERE `legacyKID` = 'adoveo' AND ID > 0;

-- AddForeignKey
ALTER TABLE `LegacySeDistributionConnection` ADD CONSTRAINT `fk_LegacySeDistributionConnection_to_Donations_idx` FOREIGN KEY (`paymentID`) REFERENCES `Donations`(`PaymentExternal_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment_follow_up` ADD CONSTRAINT `fk_Payment_follow_up_to_Payment_intent_idx` FOREIGN KEY (`Payment_intent_id`) REFERENCES `Payment_intent`(`Id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

-- The purpose of this section is to safely add a foreign key constraint to the `Referral_records` table, linking the `DonorID` column to the `ID` column in the `Donors` table, with specific rules for ON DELETE and ON UPDATE actions. The procedure `AddForeignKeyIfNotExist` first checks if the foreign key `fk_Referral_records_to_Donors_idx` already exists to avoid duplicate or conflicting constraints. If the foreign key does not exist, it is then added. This ensures that the migration can be run idempotently, avoiding errors on subsequent executions.

-- 1. Create the procedure
CREATE PROCEDURE AddForeignKeyIfNotExist()
BEGIN
    DECLARE _foreignKeyExists INT DEFAULT 0;

    SELECT COUNT(*) INTO _foreignKeyExists
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE table_name = 'Referral_records'
    AND constraint_name = 'fk_Referral_records_to_Donors_idx'
    AND table_schema = DATABASE();

    IF _foreignKeyExists = 0 THEN
      ALTER TABLE `Referral_records` ADD CONSTRAINT `fk_Referral_records_to_Donors_idx` FOREIGN KEY (`DonorID`) REFERENCES `Donors`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END;

-- 2. Call the procedure
CALL AddForeignKeyIfNotExist();

-- 3. Drop the procedure
DROP PROCEDURE AddForeignKeyIfNotExist;

-- The purpose of this section is to safely add a foreign key constraint to the `Swish_orders` table
-- linking the `KID` column to the `Distributions` table, with specific rules for ON DELETE and ON UPDATE actions.

-- 1. Create the procedure
CREATE PROCEDURE AddForeignKeyIfNotExist()
BEGIN
    DECLARE _foreignKeyExists INT DEFAULT 0;

    SELECT COUNT(*) INTO _foreignKeyExists
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE table_name = 'Swish_orders'
    AND constraint_name = 'Swish_orders_KID_fkey'
    AND table_schema = DATABASE();

    IF _foreignKeyExists = 0 THEN
      ALTER TABLE `Swish_orders` ADD CONSTRAINT `Swish_orders_KID_fkey` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END;

-- 2. Call the procedure
CALL AddForeignKeyIfNotExist();

-- 3. Drop the procedure
DROP PROCEDURE AddForeignKeyIfNotExist;