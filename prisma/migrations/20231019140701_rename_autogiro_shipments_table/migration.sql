/*
  Warnings:

  - You are about to drop the `AutoGiro_shipment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `AutoGiro_agreement_charges` DROP FOREIGN KEY `AutoGiro_agreement_charges_shipmentID_fkey`;

-- DropTable
DROP TABLE `AutoGiro_shipment`;

-- CreateTable
CREATE TABLE `AutoGiro_shipments` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `num_charges` INTEGER NOT NULL,
    `sent_date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AutoGiro_agreement_charges` ADD CONSTRAINT `AutoGiro_agreement_charges_shipmentID_fkey` FOREIGN KEY (`shipmentID`) REFERENCES `AutoGiro_shipments`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;
