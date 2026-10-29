-- Free-text notes on regranting rounds and transfers: explanations for the record (calculation
-- errors, held-back amounts, mis-keyed donations). Documentation, not money: editable in any
-- round status. Regrant_transfers.bank_ref is the bank's reference only.
ALTER TABLE `Regrant_rounds` ADD COLUMN `notes` TEXT NULL;
ALTER TABLE `Regrant_transfers` ADD COLUMN `notes` TEXT NULL;
