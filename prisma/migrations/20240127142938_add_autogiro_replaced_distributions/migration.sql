-- CreateTable
CREATE TABLE `AutoGiro_replaced_distributions` (
    `Original_AutoGiro_KID` VARCHAR(15) NOT NULL,
    `Replacement_KID` VARCHAR(15) NOT NULL,
    `Timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`Replacement_KID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AutoGiro_replaced_distributions` ADD CONSTRAINT `fk_AutoGiro_replaced_distributions_to_Distributions_idx` FOREIGN KEY (`Original_AutoGiro_KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutoGiro_replaced_distributions` ADD CONSTRAINT `fk_AutoGiro_replaced_distributions_to_Distributions_idx2` FOREIGN KEY (`Replacement_KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;
