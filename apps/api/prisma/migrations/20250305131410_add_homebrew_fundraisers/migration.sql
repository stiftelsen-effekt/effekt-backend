-- AlterTable
ALTER TABLE `Distributions` ADD COLUMN `Fundraiser_ID` INTEGER NULL;

-- CreateTable
CREATE TABLE `Fundraisers` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Donor_ID` INTEGER NOT NULL,

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Fundraiser_transactions` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Fundraiser_ID` INTEGER NOT NULL,
    `Message` TEXT NOT NULL,
    `Show_name` BOOLEAN NOT NULL,

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Distributions` ADD CONSTRAINT `fk_Distributions_to_Fundraiser_transactions_idx` FOREIGN KEY (`Fundraiser_ID`) REFERENCES `Fundraiser_transactions`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fundraisers` ADD CONSTRAINT `fk_Fundraiser_to_Donors_idx` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fundraiser_transactions` ADD CONSTRAINT `fk_Fundraiser_transactions_to_Fundraiser_idx` FOREIGN KEY (`Fundraiser_ID`) REFERENCES `Fundraisers`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;
