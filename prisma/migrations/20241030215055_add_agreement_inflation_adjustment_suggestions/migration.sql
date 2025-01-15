-- CreateTable
CREATE TABLE `Agreement_inflation_adjustments` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `agreement_ID` VARCHAR(45) NOT NULL,
    `agreement_type` VARCHAR(20) NOT NULL,
    `current_amount` INTEGER NOT NULL,
    `proposed_amount` INTEGER NOT NULL,
    `inflation_percentage` DECIMAL(10, 6) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated` DATETIME(0) NULL,
    `expires` DATETIME(0) NOT NULL,

    UNIQUE INDEX `Agreement_inflation_adjustments_token_key`(`token`),
    INDEX `Agreement_inflation_adjustments_agreement_ID_agreement_type_idx`(`agreement_ID`, `agreement_type`),
    INDEX `Agreement_inflation_adjustments_status_idx`(`status`),
    INDEX `Agreement_inflation_adjustments_expires_idx`(`expires`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
