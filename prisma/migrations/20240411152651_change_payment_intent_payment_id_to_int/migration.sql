/*
  Warnings:

  - You are about to alter the column `Payment_method` on the `Payment_intent` table. The data in that column could be lost. The data in that column will be cast from `VarChar(45)` to `Int`.

*/
-- AlterTable
ALTER TABLE `Payment_intent` MODIFY `Payment_method` INTEGER NULL;
