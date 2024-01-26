-- CreateTable
CREATE TABLE `AutoGiro_mandates` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `status` VARCHAR(191) NOT NULL,
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `bank_account` VARCHAR(16) NULL,
    `special_information` VARCHAR(191) NULL,
    `name_and_address` VARCHAR(191) NULL,
    `postal_code` VARCHAR(191) NULL,
    `postal_label` VARCHAR(191) NULL,
    `KID` VARCHAR(16) NOT NULL,

    UNIQUE INDEX `AutoGiro_mandates_KID_key`(`KID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
