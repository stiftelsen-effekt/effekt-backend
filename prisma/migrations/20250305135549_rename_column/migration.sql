/*
  Warnings:

  - You are about to drop the column `Fundraiser_ID` on the `Distributions` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `Distributions` DROP FOREIGN KEY `fk_Distributions_to_Fundraiser_transactions_idx`;

-- AlterTable
ALTER TABLE `Distributions` DROP COLUMN `Fundraiser_ID`,
    ADD COLUMN `Fundraiser_transaction_ID` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Distributions` ADD CONSTRAINT `fk_Distributions_to_Fundraiser_transactions_idx` FOREIGN KEY (`Fundraiser_transaction_ID`) REFERENCES `Fundraiser_transactions`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;
