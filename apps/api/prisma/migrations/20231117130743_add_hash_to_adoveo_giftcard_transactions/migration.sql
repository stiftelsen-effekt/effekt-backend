/*
  Warnings:

  - A unique constraint covering the columns `[Hash]` on the table `Adoveo_giftcard_transactions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `Hash` to the `Adoveo_giftcard_transactions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Adoveo_giftcard_transactions` ADD COLUMN `Hash` VARCHAR(32) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Hash_UNIQUE` ON `Adoveo_giftcard_transactions`(`Hash`);
