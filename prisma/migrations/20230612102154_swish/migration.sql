-- CreateTable
CREATE TABLE `Swish_order` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `KID` VARCHAR(15) NOT NULL,
    `instructionUUID` VARCHAR(36) NOT NULL,
    `donorID` INTEGER NOT NULL,
    `donationID` INTEGER NULL,
    `status` VARCHAR(191) NULL,
    `reference` VARCHAR(32) NOT NULL,
    `registered` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `Swish_order_KID_key`(`KID`),
    UNIQUE INDEX `Swish_order_instructionUUID_key`(`instructionUUID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Swish_order` ADD CONSTRAINT `Swish_order_donorID_fkey` FOREIGN KEY (`donorID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Swish_order` ADD CONSTRAINT `Swish_order_donationID_fkey` FOREIGN KEY (`donationID`) REFERENCES `Donations`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;
