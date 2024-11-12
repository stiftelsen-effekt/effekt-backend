/*
  Warnings:

  - Added the required column `Giftcard_ID` to the `Adoveo_giftcard_transactions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Adoveo_giftcard_transactions` ADD COLUMN `Giftcard_ID` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `Adovel_giftcard` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Donor_ID` INTEGER NOT NULL,
    `Sum` DECIMAL(15, 2) NOT NULL,
    `Timestamp` DATETIME(0) NOT NULL,
    `Status` VARCHAR(10) NOT NULL,
    `Hash` VARCHAR(32) NOT NULL,
    `Created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `Last_updated` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `Hash_UNIQUE`(`Hash`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Adoveo_giftcard_org_shares` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `Giftcard_ID` INTEGER NOT NULL,
    `Org_ID` INTEGER NOT NULL,
    `Share` DECIMAL(18, 15) NOT NULL,
    `Standard_split` BOOLEAN NULL,
    `Created` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `Last_updated` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

/*
This migration script handles the connection of existing giftcard transactions to a default giftcard.

PURPOSE:
- Checks if there are any existing records in the Adoveo_giftcard_transactions table
- If transactions exist, creates a default giftcard and links all transactions to it
- If no transactions exist, does nothing (skips the migration)

WHAT IT DOES:
1. Creates a default giftcard with ID=1 and amount=100.00
2. Sets up the organization share for this giftcard (100% to Org_ID 12 (TCF))
3. Updates all existing transactions to reference this default giftcard

This approach ensures we only create the default giftcard if it's actually needed
(i.e., if there are existing transactions that need to be connected to a giftcard).
*/

DELIMITER //

CREATE PROCEDURE ExecuteConditionalMigration()
BEGIN
    DECLARE has_transactions INT;
    
    -- Check if there are any records in Adoveo_giftcard_transactions
    SELECT COUNT(*) INTO has_transactions 
    FROM Adoveo_giftcard_transactions 
    LIMIT 1;
    
    -- Only execute the migration if there are transactions
    IF has_transactions > 0 THEN
        -- Add default giftcard
        INSERT INTO `Adovel_giftcard` 
            (`Donor_ID`, `Sum`, `Timestamp`, `Status`, `Hash`) 
        VALUES 
            (1, 100.00, '2024-11-03 16:22:06', '', '');
            
        -- Add organization share for the giftcard
        INSERT INTO `Adoveo_giftcard_org_shares` 
            (`Giftcard_ID`, `Org_ID`, `Share`, `Standard_split`) 
        VALUES 
            (1, 12, 100, 1);
            
        -- Connect existing transactions to the default giftcard
        UPDATE `Adoveo_giftcard_transactions` 
        SET `Giftcard_ID` = 1;
    END IF;
END //

DELIMITER ;

-- Execute the procedure
CALL ExecuteConditionalMigration();

-- Clean up by dropping the procedure
DROP PROCEDURE ExecuteConditionalMigration;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_org_shares` ADD CONSTRAINT `FK_Adoveo_giftcard_org_shares_giftcardid` FOREIGN KEY (`Giftcard_ID`) REFERENCES `Adovel_giftcard`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_org_shares` ADD CONSTRAINT `FK_Adoveo_giftcard_org_shares_orgid` FOREIGN KEY (`Org_ID`) REFERENCES `Organizations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` ADD CONSTRAINT `FK_Adoveo_giftcard_transactions_giftcardid` FOREIGN KEY (`Giftcard_ID`) REFERENCES `Adovel_giftcard`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;
