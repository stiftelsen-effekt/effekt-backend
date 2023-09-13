-- DropForeignKey
ALTER TABLE `Swish_orders` DROP FOREIGN KEY `Swish_orders_KID_fkey`;

-- DropIndex
DROP INDEX `Swish_order_KID_key` ON `Swish_orders`;

-- Add new normal (non-unique) index
CREATE INDEX `Swish_orders_KID_key` ON `Swish_orders`(`KID`);

-- AddForeignKey
ALTER TABLE `Swish_orders` ADD CONSTRAINT `Swish_orders_KID_fkey` FOREIGN KEY (`KID`) REFERENCES `Distributions`(`KID`) ON DELETE CASCADE ON UPDATE CASCADE;