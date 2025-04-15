/*
  Warnings:

  - The primary key for the `AutoGiro_replaced_distributions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `AvtaleGiro_replaced_distributions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Distributions` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE `AutoGiro_replaced_distributions` DROP FOREIGN KEY `fk_AutoGiro_replaced_distributions_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `AutoGiro_replaced_distributions` DROP FOREIGN KEY `fk_AutoGiro_replaced_distributions_to_Distributions_idx2`;

-- DropForeignKey
ALTER TABLE `AvtaleGiro_replaced_distributions` DROP FOREIGN KEY `fk_AvtaleGiro_replaced_distributions_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `AvtaleGiro_replaced_distributions` DROP FOREIGN KEY `fk_AvtaleGiro_replaced_distributions_to_Distributions_idx2`;

-- DropForeignKey
ALTER TABLE `Avtalegiro_agreements` DROP FOREIGN KEY `fk_Avtalegiro_agreements_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `Distribution_cause_areas` DROP FOREIGN KEY `fk_Distribution_cause_areas_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `Donations` DROP FOREIGN KEY `fk_Donations_to_Distributions_KID`;

-- DropForeignKey
ALTER TABLE `Swish_orders` DROP FOREIGN KEY `Swish_orders_KID_fkey`;

-- DropForeignKey
ALTER TABLE `Vipps_agreement_charges` DROP FOREIGN KEY `FK_KID_KID`;

-- DropForeignKey
ALTER TABLE `Vipps_agreements` DROP FOREIGN KEY `FK_KID`;

-- DropForeignKey
ALTER TABLE `Vipps_matching_rules` DROP FOREIGN KEY `fk_Vipps_matching_rules_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `Vipps_orders` DROP FOREIGN KEY `fk_Vipps_orders_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `Avtalegiro_conversion_reminders` DROP FOREIGN KEY `fk_Avtalegiro_conversion_reminders_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `Payment_intent` DROP FOREIGN KEY `fk_Payment_intent_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `Paypal_historic_distributions` DROP FOREIGN KEY `fk_Paypal_historic_distributions_to_Distributions_idx`;

-- DropForeignKey
ALTER TABLE `LegacySeDistributionConnection` DROP FOREIGN KEY `fk_LegacySeDistributionConnection_to_Donations_idx`;

-- DropForeignKey
ALTER TABLE `Recurring_agreement_stopped` DROP FOREIGN KEY `Recurring_agreement_stopped_vippsAgreementID_fkey`;

-- DropForeignKey
ALTER TABLE `Vipps_agreement_charges` DROP FOREIGN KEY `FK_agreementID_ID`;

-- AlterTable
ALTER TABLE `AutoGiro_agreements` MODIFY `KID` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `AutoGiro_mandates` MODIFY `KID` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `AutoGiro_replaced_distributions` DROP PRIMARY KEY,
    MODIFY `Original_AutoGiro_KID` VARCHAR(32) NOT NULL,
    MODIFY `Replacement_KID` VARCHAR(32) NOT NULL,
    ADD PRIMARY KEY (`Replacement_KID`);

-- AlterTable
ALTER TABLE `AvtaleGiro_replaced_distributions` DROP PRIMARY KEY,
    MODIFY `Original_AvtaleGiro_KID` VARCHAR(32) NOT NULL,
    MODIFY `Replacement_KID` VARCHAR(32) NOT NULL,
    ADD PRIMARY KEY (`Replacement_KID`);

-- AlterTable
ALTER TABLE `Avtalegiro_agreements` MODIFY `KID` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `Distribution_cause_areas` MODIFY `Distribution_KID` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `Distributions` DROP PRIMARY KEY,
    MODIFY `KID` VARCHAR(32) NOT NULL,
    ADD PRIMARY KEY (`KID`);

-- AlterTable
ALTER TABLE `Donations` MODIFY `KID_fordeling` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `LegacySeDistributionConnection` MODIFY `legacyKID` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `Swish_orders` MODIFY `KID` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `Vipps_agreement_charges` MODIFY `KID` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `Vipps_agreements` MODIFY `KID` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `Vipps_matching_rules` MODIFY `ResolveKID` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `Vipps_orders` MODIFY `KID` VARCHAR(32) NOT NULL;


ALTER TABLE `Adoveo_fundraiser` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Adoveo_fundraiser_org_shares` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Adoveo_fundraiser_transactions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Adoveo_giftcard` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Adoveo_giftcard_org_shares` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Adoveo_giftcard_transactions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Agreement_inflation_adjustments` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `AutoGiro_agreement_charges` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `AutoGiro_agreements` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `AutoGiro_mandates` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `AutoGiro_replaced_distributions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `AutoGiro_shipments` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `AvtaleGiro_replaced_distributions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Avtalegiro_agreements` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Avtalegiro_conversion_reminders` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Avtalegiro_shipment` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Cause_areas` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Conversion_rates` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Data_owner` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Distribution_cause_area_organizations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Distribution_cause_areas` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Distributions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Donations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Donors` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `FB_campaign_org_shares` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `FB_campaigns` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `FB_donation_reports` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `FB_payment_ID` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Fundraiser_transactions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Fundraisers` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Funds_donations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Import_logs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `LegacySeDistributionConnection` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Mailersend_survey_responses` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Organizations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Payment` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Payment_follow_up` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Payment_intent` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Paypal_historic_distributions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Recurring_agreement_stopped` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Recurring_agreement_stopped_reasons` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Referral_records` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Referral_types` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Swish_orders` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Tax_unit` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_agreement_charges` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_agreements` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_matching_rules` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_order_transaction_statuses` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_orders` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_tokens` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `_prisma_migrations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `schema_migrations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE `Avtalegiro_conversion_reminders` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Cause_areas` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Conversion_rates` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Data_owner` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Distribution_cause_areas` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Distributions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Donations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Donors` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `FB_campaign_org_shares` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `FB_campaigns` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `FB_payment_ID` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Fundraiser_transactions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Funds_donations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Import_logs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `LegacySeDistributionConnection` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Mailersend_survey_responses` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Organizations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Payment` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Payment_intent` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Paypal_historic_distributions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Recurring_agreement_stopped` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Recurring_agreement_stopped_reasons` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Referral_records` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Referral_types` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Swish_orders` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Tax_unit` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_agreement_charges` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_agreements` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_matching_rules` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_order_transaction_statuses` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_orders` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `Vipps_tokens` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `_prisma_migrations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE `schema_migrations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `AvtaleGiro_replaced_distributions` ADD CONSTRAINT `fk_AvtaleGiro_replaced_distributions_to_Distributions_idx` FOREIGN KEY (`Original_AvtaleGiro_KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AvtaleGiro_replaced_distributions` ADD CONSTRAINT `fk_AvtaleGiro_replaced_distributions_to_Distributions_idx2` FOREIGN KEY (`Replacement_KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutoGiro_replaced_distributions` ADD CONSTRAINT `fk_AutoGiro_replaced_distributions_to_Distributions_idx` FOREIGN KEY (`Original_AutoGiro_KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutoGiro_replaced_distributions` ADD CONSTRAINT `fk_AutoGiro_replaced_distributions_to_Distributions_idx2` FOREIGN KEY (`Replacement_KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Avtalegiro_agreements` ADD CONSTRAINT `fk_Avtalegiro_agreements_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Distribution_cause_areas` ADD CONSTRAINT `fk_Distribution_cause_areas_to_Distributions_idx` FOREIGN KEY (`Distribution_KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Donations` ADD CONSTRAINT `fk_Donations_to_Distributions_KID` FOREIGN KEY (`KID_fordeling`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Swish_orders` ADD CONSTRAINT `Swish_orders_KID_fkey` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vipps_agreement_charges` ADD CONSTRAINT `FK_KID_KID` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vipps_agreements` ADD CONSTRAINT `FK_KID` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vipps_matching_rules` ADD CONSTRAINT `fk_Vipps_matching_rules_to_Distributions_idx` FOREIGN KEY (`ResolveKID`) REFERENCES `Distributions`(`KID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vipps_orders` ADD CONSTRAINT `fk_Vipps_orders_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Avtalegiro_conversion_reminders` ADD CONSTRAINT `fk_Avtalegiro_conversion_reminders_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment_intent` ADD CONSTRAINT `fk_Payment_intent_to_Distributions_idx` FOREIGN KEY (`KID_fordeling`) REFERENCES `Distributions`(`KID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Paypal_historic_distributions` ADD CONSTRAINT `fk_Paypal_historic_distributions_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LegacySeDistributionConnection` ADD CONSTRAINT `fk_LegacySeDistributionConnection_to_Donations_idx` FOREIGN KEY (`paymentID`) REFERENCES `Donations`(`PaymentExternal_ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recurring_agreement_stopped` ADD CONSTRAINT `Recurring_agreement_stopped_vippsAgreementID_fkey` FOREIGN KEY (`vippsAgreementID`) REFERENCES `Vipps_agreements`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vipps_agreement_charges` ADD CONSTRAINT `FK_agreementID_ID` FOREIGN KEY (`agreementID`) REFERENCES `Vipps_agreements`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;