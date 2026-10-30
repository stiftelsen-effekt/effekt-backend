-- AlterTable
ALTER TABLE `Fundraiser_transactions` ADD COLUMN `Inserted` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    ADD COLUMN `Last_updated` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0);

-- AlterTable
ALTER TABLE `Fundraisers` ADD COLUMN `Inserted` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    ADD COLUMN `Last_updated` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0);

-- Create trigger for Fundraiser_transactions
CREATE TRIGGER update_fundraiser_transactions_timestamp
BEFORE UPDATE ON `Fundraiser_transactions`
FOR EACH ROW
SET NEW.Last_updated = CURRENT_TIMESTAMP(0);

-- Create trigger for Fundraisers
CREATE TRIGGER update_fundraisers_timestamp
BEFORE UPDATE ON `Fundraisers`
FOR EACH ROW
SET NEW.Last_updated = CURRENT_TIMESTAMP(0);