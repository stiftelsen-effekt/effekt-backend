/*
  Warnings:

  - You are about to drop the column `timetamp` on the `Payment_intent` table. All the data in the column will be lost.

*/
-- Copy all timetamp to timestamp
UPDATE `Payment_intent` SET `timestamp` = `timetamp`;

-- AlterTable
ALTER TABLE `Payment_intent` DROP COLUMN `timetamp`;
