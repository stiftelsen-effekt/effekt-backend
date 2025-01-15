-- AlterTable
ALTER TABLE `Organizations` ADD COLUMN `widget_context` TEXT NULL,
    ADD COLUMN `widget_display_name` VARCHAR(45) NULL;

UPDATE `Organizations` SET `widget_display_name` = `full_name`;