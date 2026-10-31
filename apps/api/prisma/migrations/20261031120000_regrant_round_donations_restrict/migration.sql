-- A donation chosen for a major_donor round can't be deleted while the round holds it: deleting
-- it used to remove it from the round silently (ON DELETE CASCADE), changing what an approved or
-- paid round passed on. Remove it from a draft round first; approved and paid rounds keep theirs.
--
-- Only the referential action changes; every existing row already satisfies the key.

-- DropForeignKey
ALTER TABLE `Regrant_round_donations` DROP FOREIGN KEY `fk_Regrant_round_donations_to_Donations`;

-- AddForeignKey
ALTER TABLE `Regrant_round_donations` ADD CONSTRAINT `fk_Regrant_round_donations_to_Donations` FOREIGN KEY (`Donation_ID`) REFERENCES `Donations`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;
