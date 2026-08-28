-- CreateTable
CREATE TABLE `Donation_referral_codes` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `KID` VARCHAR(32) NULL,
    `Referral_code` VARCHAR(128) NOT NULL,
    `Timestamp` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `KID_idx`(`KID`),
    INDEX `Referral_code_idx`(`Referral_code`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Donation_referral_codes` ADD CONSTRAINT `fk_Donation_referral_codes_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE SET NULL ON UPDATE CASCADE;
