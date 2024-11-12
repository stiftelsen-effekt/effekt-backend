-- CreateTable
CREATE TABLE `Recurring_agreement_stopped_reasons` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(45) NOT NULL,

    UNIQUE INDEX `Recurring_agreement_stopped_reasons_name_key`(`name`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recurring_agreement_stopped` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `avtalegiroAgreementID` INTEGER NULL,
    `autoGiroAgreementID` INTEGER NULL,
    `vippsAgreementID` VARCHAR(20) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NULL,
    `reasonID` INTEGER NOT NULL,
    `timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Recurring_agreement_stopped` ADD CONSTRAINT `Recurring_agreement_stopped_reasonID_fkey` FOREIGN KEY (`reasonID`) REFERENCES `Recurring_agreement_stopped_reasons`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recurring_agreement_stopped` ADD CONSTRAINT `Recurring_agreement_stopped_avtalegiroAgreementID_fkey` FOREIGN KEY (`avtalegiroAgreementID`) REFERENCES `Avtalegiro_agreements`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recurring_agreement_stopped` ADD CONSTRAINT `Recurring_agreement_stopped_autoGiroAgreementID_fkey` FOREIGN KEY (`autoGiroAgreementID`) REFERENCES `AutoGiro_agreements`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recurring_agreement_stopped` ADD CONSTRAINT `Recurring_agreement_stopped_vippsAgreementID_fkey` FOREIGN KEY (`vippsAgreementID`) REFERENCES `Vipps_agreements`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Trigger for Recurring_agreement_stopped
CREATE TRIGGER `Recurring_agreement_stopped_BEFORE_UPDATE` 
BEFORE UPDATE ON `Recurring_agreement_stopped` 
FOR EACH ROW
BEGIN
    SET NEW.last_updated = NOW();
END;