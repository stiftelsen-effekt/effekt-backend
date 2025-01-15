/*
  Warnings:

  - You are about to alter the column `Payment_method` on the `Payment_intent` table. The data in that column could be lost. The data in that column will be cast from `VarChar(45)` to `Int`.

*/
-- Change "BANK" to 2
UPDATE `Payment_intent` SET `Payment_method` = 2 WHERE `Payment_method` = 'BANK';

-- AlterTable
ALTER TABLE `Payment_intent` MODIFY `Payment_method` INTEGER NULL;
