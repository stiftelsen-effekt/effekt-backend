-- DropIndex
DROP INDEX `full_name` ON `Donors`;

-- DropIndex
DROP INDEX `search` ON `Donors`;

-- CreateIndex
CREATE INDEX `full_name` ON `Donors`(`full_name`(63));

-- CreateIndex
CREATE INDEX `search` ON `Donors`(`email`(63), `full_name`(63));
