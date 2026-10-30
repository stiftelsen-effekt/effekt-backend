-- Shared manual review queue for transactions from payment reports that could not be
-- registered automatically. Additive: a new table only.

-- CreateTable
CREATE TABLE `Review_queue_items` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Source` VARCHAR(16) NOT NULL,
    `Reason` TEXT NOT NULL,
    `KID` VARCHAR(64) NULL,
    `Amount` DECIMAL(16, 2) NOT NULL,
    `Transaction_date` DATETIME(0) NULL,
    `External_ID` VARCHAR(64) NULL,
    `Payment_ID` INTEGER NOT NULL,
    `Message` TEXT NULL,
    `Payer_name` VARCHAR(255) NULL,
    `Location` VARCHAR(255) NULL,
    `Raw` JSON NULL,
    `Import_log_ID` INTEGER NULL,
    `Status` VARCHAR(16) NOT NULL DEFAULT 'open',
    `Resolved_by` VARCHAR(255) NULL,
    `Resolved_at` DATETIME(0) NULL,
    `Note` TEXT NULL,
    `Donation_ID` INTEGER NULL,
    `Created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `Status_Created_idx`(`Status`, `Created`),
    INDEX `fk_Review_queue_items_to_Import_logs_idx`(`Import_log_ID`),
    INDEX `fk_Review_queue_items_to_Donations_idx`(`Donation_ID`),
    UNIQUE INDEX `Source_External_ID_UNIQUE`(`Source`, `External_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Review_queue_items` ADD CONSTRAINT `fk_Review_queue_items_to_Import_logs` FOREIGN KEY (`Import_log_ID`) REFERENCES `Import_logs`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review_queue_items` ADD CONSTRAINT `fk_Review_queue_items_to_Donations` FOREIGN KEY (`Donation_ID`) REFERENCES `Donations`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;
