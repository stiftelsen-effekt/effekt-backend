/*
  Warnings:

  - A unique constraint covering the columns `[mandateID]` on the table `AutoGiro_agreements` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `mandateID` to the `AutoGiro_agreements` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `AutoGiro_agreements` ADD COLUMN `mandateID` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `Tax_unit` MODIFY `ssn` VARCHAR(16) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `mandateID_UNIQUE` ON `AutoGiro_agreements`(`mandateID`);

-- AddForeignKey
ALTER TABLE `AutoGiro_agreements` ADD CONSTRAINT `AutoGiro_agreements_mandateID_fkey` FOREIGN KEY (`mandateID`) REFERENCES `AutoGiro_mandates`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;
