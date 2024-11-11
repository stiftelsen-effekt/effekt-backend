/*
  Warnings:

  - You are about to drop the `Adovel_giftcard` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `Adovel_giftcard` DROP FOREIGN KEY `FK_Adovel_giftcards_donorid`;

-- DropForeignKey
ALTER TABLE `Adoveo_giftcard_org_shares` DROP FOREIGN KEY `FK_Adoveo_giftcard_org_shares_giftcardid`;

-- DropForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` DROP FOREIGN KEY `FK_Adoveo_giftcard_transactions_giftcardid`;

-- DropTable
DROP TABLE `Adovel_giftcard`;

-- CreateTable
CREATE TABLE `Adoveo_giftcard` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Donor_ID` INTEGER NOT NULL,
    `Sum` DECIMAL(15, 2) NOT NULL,
    `Timestamp` DATETIME(0) NOT NULL,
    `Status` VARCHAR(10) NOT NULL,
    `Hash` VARCHAR(32) NOT NULL,
    `Created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `Last_updated` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `Hash_UNIQUE`(`Hash`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard` ADD CONSTRAINT `FK_Adoveo_giftcards_donorid` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_org_shares` ADD CONSTRAINT `FK_Adoveo_giftcard_org_shares_giftcardid` FOREIGN KEY (`Giftcard_ID`) REFERENCES `Adoveo_giftcard`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` ADD CONSTRAINT `FK_Adoveo_giftcard_transactions_giftcardid` FOREIGN KEY (`Giftcard_ID`) REFERENCES `Adoveo_giftcard`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;
