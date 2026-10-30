-- CreateTable
CREATE TABLE `AutoGiro_agreements` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `KID` VARCHAR(16) NOT NULL,
    `amount` INTEGER NOT NULL,
    `payment_date` INTEGER NOT NULL,
    `notice` BOOLEAN NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `cancelled` DATE NULL,

    UNIQUE INDEX `KID_UNIQUE`(`KID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutoGiro_shipment` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `num_charges` INTEGER NOT NULL,
    `sent_date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutoGiro_agreement_charges` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `agreementID` INTEGER NOT NULL,
    `shipmentID` INTEGER NOT NULL,
    `donationID` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL,
    `amount` VARCHAR(191) NOT NULL,
    `claim_date` DATETIME(3) NULL,
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `AutoGiro_agreement_charges_donationID_key`(`donationID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AutoGiro_agreement_charges` ADD CONSTRAINT `AutoGiro_agreement_charges_donationID_fkey` FOREIGN KEY (`donationID`) REFERENCES `Donations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutoGiro_agreement_charges` ADD CONSTRAINT `AutoGiro_agreement_charges_shipmentID_fkey` FOREIGN KEY (`shipmentID`) REFERENCES `AutoGiro_shipment`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;
