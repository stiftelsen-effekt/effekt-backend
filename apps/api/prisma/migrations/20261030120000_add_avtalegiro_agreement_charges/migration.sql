-- CreateTable
-- One row per claim sent to Mastercard Payment Services (Nets) for an AvtaleGiro agreement
-- Same collation as Avtalegiro_agreements.KID and Distributions.KID, so KIDs can be compared across tables
CREATE TABLE `Avtalegiro_agreement_charges` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `agreementID` INTEGER NOT NULL,
    `shipmentID` INTEGER NOT NULL,
    `KID` VARCHAR(32) NOT NULL,
    `due_date` DATE NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `donationID` INTEGER NULL,
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    `created` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `donationID_UNIQUE`(`donationID`),
    INDEX `KID_due_date_idx`(`KID`, `due_date`),
    INDEX `fk_Avtalegiro_agreement_charges_to_shipment_idx`(`shipmentID`),
    INDEX `fk_Avtalegiro_agreement_charges_to_agreements_idx`(`agreementID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `Avtalegiro_agreement_charges` ADD CONSTRAINT `fk_Avtalegiro_agreement_charges_to_agreements_idx` FOREIGN KEY (`agreementID`) REFERENCES `Avtalegiro_agreements`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Avtalegiro_agreement_charges` ADD CONSTRAINT `fk_Avtalegiro_agreement_charges_to_shipment_idx` FOREIGN KEY (`shipmentID`) REFERENCES `Avtalegiro_shipment`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Avtalegiro_agreement_charges` ADD CONSTRAINT `fk_Avtalegiro_agreement_charges_to_donations_idx` FOREIGN KEY (`donationID`) REFERENCES `Donations`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;
