/*
  Warnings:

  - You are about to drop the column `KID` on the `Adoveo_fundraiser_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `KID` on the `Adoveo_giftcard_transactions` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[Donation_ID]` on the table `Adoveo_fundraiser_transactions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[Donation_ID]` on the table `Adoveo_giftcard_transactions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `Fundraiser_ID` to the `Adoveo_fundraiser_transactions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` DROP FOREIGN KEY `FK_Adoveo_giftcard_transactions_donorid`;

-- DropIndex
DROP INDEX `KID_idx` ON `Adoveo_fundraiser_transactions`;

-- DropIndex
DROP INDEX `KID_idx` ON `Adoveo_giftcard_transactions`;

-- AlterTable
ALTER TABLE `Adoveo_fundraiser_transactions` DROP COLUMN `KID`,
    ADD COLUMN `Created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    ADD COLUMN `Donation_ID` INTEGER NULL,
    ADD COLUMN `Fundraiser_ID` INTEGER NOT NULL,
    ADD COLUMN `Last_updated` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0);

-- AlterTable
ALTER TABLE `Adoveo_giftcard_transactions` DROP COLUMN `KID`,
    ADD COLUMN `Created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    ADD COLUMN `Donation_ID` INTEGER NULL,
    ADD COLUMN `Last_updated` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    ADD COLUMN `Receiver_donor_ID` INTEGER NULL,
    MODIFY `Sender_donor_ID` INTEGER NULL;

-- CreateTable
CREATE TABLE `Adoveo_fundraiser` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Donor_ID` INTEGER NULL,
    `Name` VARCHAR(45) NOT NULL,
    `Created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `Last_updated` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Adoveo_fundraiser_org_shares` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Fundraiser_ID` INTEGER NOT NULL,
    `Org_ID` INTEGER NOT NULL,
    `Share` DECIMAL(15, 12) NOT NULL,
    `Standard_split` BOOLEAN NULL,
    `Created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `Last_updated` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Donation_ID_UNIQUE` ON `Adoveo_fundraiser_transactions`(`Donation_ID`);

-- CreateIndex
CREATE UNIQUE INDEX `Donation_ID_UNIQUE` ON `Adoveo_giftcard_transactions`(`Donation_ID`);

-- AddForeignKey
ALTER TABLE `Adoveo_fundraiser` ADD CONSTRAINT `FK_Adoveo_fundraiser_donorid` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_fundraiser_org_shares` ADD CONSTRAINT `FK_Adoveo_fundraiser_org_shares_fundraiserid` FOREIGN KEY (`Fundraiser_ID`) REFERENCES `Adoveo_fundraiser`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_fundraiser_org_shares` ADD CONSTRAINT `FK_Adoveo_fundraiser_org_shares_orgid` FOREIGN KEY (`Org_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_fundraiser_transactions` ADD CONSTRAINT `FK_Adoveo_fundraiser_transactions_fundraiserid` FOREIGN KEY (`Fundraiser_ID`) REFERENCES `Adoveo_fundraiser`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_fundraiser_transactions` ADD CONSTRAINT `FK_Adoveo_fundraiser_transactions_donationid` FOREIGN KEY (`Donation_ID`) REFERENCES `Donations`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` ADD CONSTRAINT `FK_Adoveo_giftcard_transactions_donationid` FOREIGN KEY (`Donation_ID`) REFERENCES `Donations`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` ADD CONSTRAINT `FK_Adoveo_giftcard_transactions_sender_donorid` FOREIGN KEY (`Sender_donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` ADD CONSTRAINT `FK_Adoveo_giftcard_transactions_receiver_donorid` FOREIGN KEY (`Receiver_donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;
