/*
  Warnings:

  - You are about to alter the column `ssn` on the `Tax_unit` table. The data in that column could be lost. The data in that column will be cast from `VarChar(16)` to `VarChar(11)`.

*/
-- DropForeignKey
ALTER TABLE `Referral_records` DROP FOREIGN KEY `fk_referral_record_donor_id`;

-- DropForeignKey
ALTER TABLE `Swish_orders` DROP FOREIGN KEY `Swish_order_KID_fkey`;

-- AlterTable
ALTER TABLE `Payment_intent` ADD COLUMN `Payment_amount` INTEGER NULL,
    ADD COLUMN `timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0);

-- AlterTable
ALTER TABLE `Tax_unit` MODIFY `ssn` VARCHAR(11) NOT NULL;

-- CreateTable
CREATE TABLE `Payment_follow_up` (
    `Id` INTEGER NOT NULL AUTO_INCREMENT,
    `Payment_intent_id` INTEGER NOT NULL,
    `Follow_up_date` DATETIME(0) NOT NULL,

    PRIMARY KEY (`Id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Set character set for external id
ALTER TABLE `Donations` MODIFY `PaymentExternal_ID` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci  NULL;

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


-- AddForeignKey
ALTER TABLE `Swish_orders` ADD CONSTRAINT `Swish_orders_KID_fkey` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;
