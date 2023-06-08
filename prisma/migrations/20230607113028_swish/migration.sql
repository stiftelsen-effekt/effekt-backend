-- CreateTable
CREATE TABLE `SwishOrder` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `KID` VARCHAR(15) NOT NULL,
    `instructionUUID` VARCHAR(36) NOT NULL,
    `donorID` INTEGER NOT NULL,
    `donationID` INTEGER NULL,
    `status` ENUM('PAID', 'DECLINED', 'ERROR', 'CANCELLED') NULL,
    `reference` VARCHAR(32) NOT NULL,
    `registered` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `Donor_ID_idx`(`donorID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
