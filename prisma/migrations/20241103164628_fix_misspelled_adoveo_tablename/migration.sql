/*
  Warnings:

  - You are about to drop the `Adovel_giftcard` table. If the table is not empty, all the data it contains will be lost.

*/

-- DropForeignKey
ALTER TABLE `Adoveo_giftcard_org_shares` DROP FOREIGN KEY `FK_Adoveo_giftcard_org_shares_giftcardid`;

-- DropForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` DROP FOREIGN KEY `FK_Adoveo_giftcard_transactions_giftcardid`;

-- DropTable
DROP TABLE `Adovel_giftcard`;

-- CreateTable
CREATE TABLE `Adoveo_giftcard` (
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
        INSERT INTO `Adoveo_giftcard` (`Donor_ID`, `Sum`, `Timestamp`, `Status`, `Hash`) 
          VALUES (1, 100.00, '2024-11-03 16:22:06', '', '');

        -- Connect existing giftcard transactions to the default giftcard
        UPDATE `Adoveo_giftcard_transactions` SET `Giftcard_ID` = 1;
    END IF;
END;

-- Execute the procedure
CALL ExecuteConditionalMigration();

-- Clean up by dropping the procedure
DROP PROCEDURE ExecuteConditionalMigration;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_org_shares` ADD CONSTRAINT `FK_Adoveo_giftcard_org_shares_giftcardid` FOREIGN KEY (`Giftcard_ID`) REFERENCES `Adoveo_giftcard`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` ADD CONSTRAINT `FK_Adoveo_giftcard_transactions_giftcardid` FOREIGN KEY (`Giftcard_ID`) REFERENCES `Adoveo_giftcard`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;
