-- Drop foreign key temporarily
ALTER TABLE `Swish_orders` DROP FOREIGN KEY `Swish_order_KID_fkey`;

-- DropIndex
DROP INDEX `Swish_order_KID_key` ON `Swish_orders`;

-- AddForeignKey
ALTER TABLE `Swish_orders` ADD CONSTRAINT `Swish_order_KID_fkey` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;