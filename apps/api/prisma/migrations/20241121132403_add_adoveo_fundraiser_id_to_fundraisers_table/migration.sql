-- AlterTable
ALTER TABLE `Adoveo_fundraiser` ADD COLUMN `Adoveo_ID` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Adoveo_fundraiser_Adoveo_ID_key` ON `Adoveo_fundraiser`(`Adoveo_ID`);
