/*
  Warnings:

  - You are about to drop the `Combining_backup` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Distribution_backup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `Avtalegiro_conversion_reminders` DROP FOREIGN KEY `fk_Avtalegiro_conversion_reminders_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `Payment_intent` DROP FOREIGN KEY `fk_Payment_intent_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `Paypal_historic_distributions` DROP FOREIGN KEY `fk_Paypal_historic_distributions_to_Distributions_idx`;

-- AlterTable
ALTER TABLE `Avtalegiro_conversion_reminders` MODIFY `KID` VARCHAR(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci  NOT NULL;

-- AlterTable
ALTER TABLE `Payment_intent` MODIFY `KID_fordeling` VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci  NULL;

-- AlterTable
ALTER TABLE `Paypal_historic_distributions` MODIFY `KID` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci  NOT NULL;

-- DropTable
DROP TABLE `Combining_backup`;

-- DropTable
DROP TABLE `Distribution_backup`;

-- AddForeignKey
ALTER TABLE `Avtalegiro_conversion_reminders` ADD CONSTRAINT `fk_Avtalegiro_conversion_reminders_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment_intent` ADD CONSTRAINT `fk_Payment_intent_to_Distributions_idx` FOREIGN KEY (`KID_fordeling`) REFERENCES `Distributions`(`KID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Paypal_historic_distributions` ADD CONSTRAINT `fk_Paypal_historic_distributions_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;