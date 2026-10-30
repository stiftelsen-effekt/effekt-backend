/*
  Warnings:

  - You are about to alter the column `Share` on the `Adoveo_fundraiser_org_shares` table. The data in that column could be lost. The data in that column will be cast from `Decimal(15,12)` to `Decimal(18,15)`.
  - You are about to alter the column `Percentage_share` on the `Distribution_cause_area_organizations` table. The data in that column could be lost. The data in that column will be cast from `Decimal(15,12)` to `Decimal(18,15)`.
  - You are about to alter the column `Percentage_share` on the `Distribution_cause_areas` table. The data in that column could be lost. The data in that column will be cast from `Decimal(15,12)` to `Decimal(18,15)`.
  - You are about to alter the column `Share` on the `FB_campaign_org_shares` table. The data in that column could be lost. The data in that column will be cast from `Decimal(15,12)` to `Decimal(18,15)`.
*/

-- AlterTable
ALTER TABLE `Adoveo_fundraiser_org_shares` MODIFY `Share` DECIMAL(18, 15) NOT NULL;

-- AlterTable
ALTER TABLE `Distribution_cause_area_organizations` MODIFY `Percentage_share` DECIMAL(18, 15) NOT NULL;

-- AlterTable
ALTER TABLE `Distribution_cause_areas` MODIFY `Percentage_share` DECIMAL(18, 15) NOT NULL;

-- AlterTable
ALTER TABLE `FB_campaign_org_shares` MODIFY `Share` DECIMAL(18, 15) NOT NULL;