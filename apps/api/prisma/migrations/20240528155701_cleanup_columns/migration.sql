/*
  Warnings:

  - You are about to drop the column `password_hash` on the `Donors` table. All the data in the column will be lost.
  - You are about to drop the column `password_salt` on the `Donors` table. All the data in the column will be lost.
  - You are about to drop the column `ssn` on the `Donors` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Donors` DROP COLUMN `password_hash`,
    DROP COLUMN `password_salt`,
    DROP COLUMN `ssn`;

-- AlterTable
ALTER TABLE `Tax_unit` MODIFY `ssn` VARCHAR(32) NOT NULL;
