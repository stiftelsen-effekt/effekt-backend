-- Links to documents (bilag, receipts, bank confirmations; usually Google Drive URLs) for
-- regranting rounds, transfers and adjustments. Several per record. Each row belongs to exactly
-- one of Round_ID, Transfer_ID, Adjustment_ID; the API enforces that (MySQL doesn't allow a
-- CHECK constraint on columns used by a foreign key's ON DELETE CASCADE). Deleting the round,
-- transfer or adjustment deletes its links.
--
-- Additive: a new table, plus a copy of the existing Regrant_adjustments.document_ref values.
-- document_ref stays for now (the running code reads it until the deploy) and is no longer
-- read or written; a later migration can drop it.

-- CreateTable
CREATE TABLE `Regrant_documents` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(1024) NOT NULL,
    `label` VARCHAR(255) NULL,
    `Round_ID` INTEGER NULL,
    `Transfer_ID` INTEGER NULL,
    `Adjustment_ID` INTEGER NULL,
    `created_by` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_Regrant_documents_to_Regrant_rounds_idx`(`Round_ID`),
    INDEX `fk_Regrant_documents_to_Regrant_transfers_idx`(`Transfer_ID`),
    INDEX `fk_Regrant_documents_to_Regrant_adjustments_idx`(`Adjustment_ID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Regrant_documents` ADD CONSTRAINT `fk_Regrant_documents_to_Regrant_rounds` FOREIGN KEY (`Round_ID`) REFERENCES `Regrant_rounds`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_documents` ADD CONSTRAINT `fk_Regrant_documents_to_Regrant_transfers` FOREIGN KEY (`Transfer_ID`) REFERENCES `Regrant_transfers`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Regrant_documents` ADD CONSTRAINT `fk_Regrant_documents_to_Regrant_adjustments` FOREIGN KEY (`Adjustment_ID`) REFERENCES `Regrant_adjustments`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy the existing single references. A URL stays the url; anything else ("Bilag 16-043")
-- becomes the label, with the text also as url so the row is complete (it isn't a link).
INSERT INTO `Regrant_documents` (`url`, `label`, `Adjustment_ID`, `created_by`, `created_at`)
SELECT
    TRIM(a.`document_ref`),
    CASE WHEN TRIM(a.`document_ref`) LIKE 'http%' THEN NULL ELSE LEFT(TRIM(a.`document_ref`), 255) END,
    a.`ID`,
    a.`created_by`,
    a.`created_at`
FROM `Regrant_adjustments` a
WHERE a.`document_ref` IS NOT NULL AND TRIM(a.`document_ref`) <> '';
