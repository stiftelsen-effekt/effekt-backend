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

-- Distributions.KID is utf8mb4 / utf8mb4_0900_ai_ci in production. Prisma creates
-- this table as utf8mb4_unicode_ci, so MySQL 3780 rejects the FK unless we align.
CREATE PROCEDURE AlignDonationReferralCodesKidWithDistributions()
BEGIN
    DECLARE kid_charset VARCHAR(64);
    DECLARE kid_collation VARCHAR(64);

    SELECT CHARACTER_SET_NAME, COLLATION_NAME
    INTO kid_charset, kid_collation
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'Distributions'
      AND COLUMN_NAME = 'KID';

    SET @align_kid_sql = CONCAT(
      'ALTER TABLE `Donation_referral_codes` MODIFY `KID` VARCHAR(32) CHARACTER SET ',
      kid_charset,
      ' COLLATE ',
      kid_collation,
      ' NULL'
    );
    PREPARE align_kid_stmt FROM @align_kid_sql;
    EXECUTE align_kid_stmt;
    DEALLOCATE PREPARE align_kid_stmt;
END;

CALL AlignDonationReferralCodesKidWithDistributions();
DROP PROCEDURE AlignDonationReferralCodesKidWithDistributions;

-- AddForeignKey
ALTER TABLE `Donation_referral_codes` ADD CONSTRAINT `fk_Donation_referral_codes_to_Distributions_idx` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE SET NULL ON UPDATE CASCADE;
