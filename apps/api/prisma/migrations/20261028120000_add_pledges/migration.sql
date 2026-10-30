-- CreateTable
CREATE TABLE `Pledges` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Sum` DECIMAL(16, 2) NOT NULL,
    `Decided_date` DATE NOT NULL,
    `Received_date` DATE NULL,
    `Donation_ID` INTEGER NULL,
    `Inserted` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_Pledges_to_Donations_idx`(`Donation_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Pledges` ADD CONSTRAINT `fk_Pledges_to_Donations_idx` FOREIGN KEY (`Donation_ID`) REFERENCES `Donations`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;
