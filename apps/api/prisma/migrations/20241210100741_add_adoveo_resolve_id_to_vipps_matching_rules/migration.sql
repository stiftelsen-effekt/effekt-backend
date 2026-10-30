/*
  Warnings:

  - You are about to drop the `migration_log` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE `Vipps_matching_rules` ADD COLUMN `ResolveAdoveoFundraiserID` INTEGER NULL;

-- DropTable
DROP TABLE `migration_log`;
