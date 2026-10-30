-- The data owner chosen when the report was uploaded, used as the default when registering a
-- donation from the item. Additive: a nullable column, NULL for existing items (and for items
-- queued by the REST uploads and the scheduled import, which use the default owner).

-- AlterTable
ALTER TABLE `Review_queue_items` ADD COLUMN `Meta_owner_ID` INTEGER NULL;

-- CreateIndex
CREATE INDEX `fk_Review_queue_items_to_Data_owner_idx` ON `Review_queue_items`(`Meta_owner_ID`);

-- AddForeignKey
ALTER TABLE `Review_queue_items` ADD CONSTRAINT `fk_Review_queue_items_to_Data_owner` FOREIGN KEY (`Meta_owner_ID`) REFERENCES `Data_owner`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;
