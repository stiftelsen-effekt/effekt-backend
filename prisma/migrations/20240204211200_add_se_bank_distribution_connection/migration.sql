-- CreateTable
CREATE TABLE `LegacySeDistributionConnection` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `paymentID` VARCHAR(32) NOT NULL,
    `legacyKID` VARCHAR(16) NOT NULL,

    UNIQUE INDEX `LegacySeDistributionConnection_paymentID_key`(`paymentID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;