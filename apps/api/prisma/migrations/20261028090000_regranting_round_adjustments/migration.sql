-- Regranting, follow-up to 20261027150000_regranting (additive only).
--
-- Earmarks: the two reallocation adjustments of an earmark (unrestricted −X, project +X) point at
-- each other, so they are shown, removed and kept together.
ALTER TABLE `Regrant_adjustments` ADD COLUMN `Paired_adjustment_ID` INTEGER NULL;
CREATE INDEX `fk_Regrant_adjustments_to_paired_idx` ON `Regrant_adjustments`(`Paired_adjustment_ID`);
ALTER TABLE `Regrant_adjustments` ADD CONSTRAINT `fk_Regrant_adjustments_to_paired` FOREIGN KEY (`Paired_adjustment_ID`) REFERENCES `Regrant_adjustments`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Adjustments attached to a round count once it is approved; the snapshot keeps them apart from
-- the balance at the cutoff, like the round's fund grants.
ALTER TABLE `Regrant_round_balances` ADD COLUMN `round_adjustments` DECIMAL(16, 2) NOT NULL DEFAULT 0;
