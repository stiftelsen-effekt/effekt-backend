ALTER TABLE `Swish_order` RENAME TO `Swish_orders`;

-- DropForeignKey
ALTER TABLE `Swish_orders` DROP FOREIGN KEY `Swish_order_donationID_fkey`;

-- DropForeignKey
ALTER TABLE `Swish_orders` DROP FOREIGN KEY `Swish_order_donorID_fkey`;

-- AddForeignKey
ALTER TABLE `Swish_orders` ADD CONSTRAINT `Swish_orders_donorID_fkey` FOREIGN KEY (`donorID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Swish_orders` ADD CONSTRAINT `Swish_orders_donationID_fkey` FOREIGN KEY (`donationID`) REFERENCES `Donations`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `Swish_orders` RENAME INDEX `Swish_order_donationID_key` TO `Swish_orders_donationID_key`;

-- RenameIndex
ALTER TABLE `Swish_orders` RENAME INDEX `Swish_order_instructionUUID_key` TO `Swish_orders_instructionUUID_key`;
