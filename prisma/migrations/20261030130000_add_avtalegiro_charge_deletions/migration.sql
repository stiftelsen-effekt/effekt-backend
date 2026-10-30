-- AlterTable
-- The shipment that sent the deletion request for a charge, when an agreement is cancelled after its claim was sent
ALTER TABLE `Avtalegiro_agreement_charges` ADD COLUMN `deletion_shipmentID` INTEGER NULL;

-- CreateIndex
CREATE INDEX `fk_Avtalegiro_agreement_charges_to_deletion_shipment_idx` ON `Avtalegiro_agreement_charges`(`deletion_shipmentID`);

-- AddForeignKey
ALTER TABLE `Avtalegiro_agreement_charges` ADD CONSTRAINT `fk_Avtalegiro_agreement_charges_to_deletion_shipment_idx` FOREIGN KEY (`deletion_shipmentID`) REFERENCES `Avtalegiro_shipment`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;
