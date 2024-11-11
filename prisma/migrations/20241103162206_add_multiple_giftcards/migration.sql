/*
  Warnings:

  - Added the required column `Giftcard_ID` to the `Adoveo_giftcard_transactions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Adoveo_giftcard_transactions` ADD COLUMN `Giftcard_ID` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `Adovel_giftcard` (
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

-- CreateTable
CREATE TABLE `Adoveo_giftcard_org_shares` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Giftcard_ID` INTEGER NOT NULL,
    `Org_ID` INTEGER NOT NULL,
    `Share` DECIMAL(18, 15) NOT NULL,
    `Standard_split` BOOLEAN NULL,
    `Created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `Last_updated` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Adovel_giftcard` ADD CONSTRAINT `FK_Adovel_giftcards_donorid` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_org_shares` ADD CONSTRAINT `FK_Adoveo_giftcard_org_shares_giftcardid` FOREIGN KEY (`Giftcard_ID`) REFERENCES `Adovel_giftcard`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_org_shares` ADD CONSTRAINT `FK_Adoveo_giftcard_org_shares_orgid` FOREIGN KEY (`Org_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` ADD CONSTRAINT `FK_Adoveo_giftcard_transactions_giftcardid` FOREIGN KEY (`Giftcard_ID`) REFERENCES `Adovel_giftcard`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;
