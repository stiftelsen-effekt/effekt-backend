-- AlterTable
ALTER TABLE `Recurring_agreement_stopped` ADD COLUMN `otherComment` TEXT;

-- AlterTable
ALTER TABLE `Recurring_agreement_stopped_reasons` ADD COLUMN `isOther` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `order` INTEGER NOT NULL DEFAULT 99;
