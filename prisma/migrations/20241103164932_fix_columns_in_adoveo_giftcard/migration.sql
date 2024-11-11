/*
  Warnings:

  - You are about to drop the column `Donor_ID` on the `Adoveo_giftcard` table. All the data in the column will be lost.
  - You are about to drop the column `Hash` on the `Adoveo_giftcard` table. All the data in the column will be lost.
  - You are about to drop the column `Status` on the `Adoveo_giftcard` table. All the data in the column will be lost.
  - You are about to drop the column `Sum` on the `Adoveo_giftcard` table. All the data in the column will be lost.
  - You are about to drop the column `Timestamp` on the `Adoveo_giftcard` table. All the data in the column will be lost.
  - Added the required column `Name` to the `Adoveo_giftcard` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `Adoveo_giftcard` DROP FOREIGN KEY `FK_Adoveo_giftcards_donorid`;

-- DropIndex
DROP INDEX `Hash_UNIQUE` ON `Adoveo_giftcard`;

-- AlterTable
ALTER TABLE `Adoveo_giftcard` DROP COLUMN `Donor_ID`,
    DROP COLUMN `Hash`,
    DROP COLUMN `Status`,
    DROP COLUMN `Sum`,
    DROP COLUMN `Timestamp`,
    ADD COLUMN `Name` VARCHAR(45) NOT NULL;
