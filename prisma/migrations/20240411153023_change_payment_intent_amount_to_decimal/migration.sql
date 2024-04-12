/*
  Warnings:

  - You are about to alter the column `Payment_amount` on the `Payment_intent` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(16,2)`.

*/
-- AlterTable
ALTER TABLE `Payment_intent` MODIFY `Payment_amount` DECIMAL(16, 2) NULL;
