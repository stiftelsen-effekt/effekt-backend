-- DEPLOY ONLY AFTER Funds_donations rows have been migrated into Donations (Meta_owner_ID = 2).
-- The backend reads EA Giverportal donations from Donations since getEAFundsDonations was changed.

-- merge_donors moved Funds_donations rows between donors. Recreate it without
-- that table so it keeps working once the table is dropped. Otherwise unchanged
-- from 20260821101500_fix_merge_donors_missing_tables.
DROP PROCEDURE IF EXISTS `merge_donors`;

CREATE PROCEDURE `merge_donors`(IN sourceDonorId INT, IN destinationDonorId INT) BEGIN
	DECLARE finished INTEGER DEFAULT 0;
	DECLARE currentSsn varchar(11) DEFAULT "";
    DECLARE selectedTaxUnitId INT;

	# Get all tax units grouped by ssn
    # Used after the donor is merged
	DECLARE curSsns CURSOR FOR SELECT ssn FROM Tax_unit WHERE Donor_ID = destinationDonorId GROUP BY ssn HAVING COUNT(ssn)>1;

	DECLARE exit handler for sqlexception
	BEGIN
		ROLLBACK;
        RESIGNAL;
	END;

	DECLARE exit handler for sqlwarning
	BEGIN
		ROLLBACK;
        RESIGNAL;
    END;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = 1;

    # Merging a donor into itself would fall through to the DELETE below and
    # take the donor and everything cascading off them with it
    IF sourceDonorId = destinationDonorId THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'merge_donors: source and destination donor must differ';
	END IF;

    # Start merging donor
    START TRANSACTION;

    UPDATE Distributions SET Donor_ID = destinationDonorId WHERE Donor_ID = sourceDonorId;
    UPDATE Donations SET Donor_ID = destinationDonorId WHERE Donor_ID = sourceDonorId AND ID > -1;
    UPDATE Vipps_agreements SET donorID = destinationDonorId WHERE donorID = sourceDonorId AND ID != 'abc';
    UPDATE Vipps_orders SET donorID = destinationDonorId WHERE donorID = sourceDonorId AND ID > -1;
    UPDATE Paypal_historic_distributions SET Donor_ID = destinationDonorId WHERE Donor_ID = sourceDonorId AND ID > -1;
    UPDATE Referral_records SET DonorID = destinationDonorId WHERE DonorID = sourceDonorId AND ID > -1;
    UPDATE FB_payment_ID SET donorID = destinationDonorId WHERE donorID = sourceDonorId AND ID > -1;
    UPDATE Tax_unit SET Donor_ID = destinationDonorId WHERE Donor_ID = sourceDonorId AND ID > -1;
    # Transfer fundraiser ownership before deleting source donor to prevent cascade delete
    UPDATE Fundraisers SET Donor_ID = destinationDonorId WHERE Donor_ID = sourceDonorId AND ID > -1;
    # Cascade deletes - these rows are destroyed with the source donor if not moved
    UPDATE Swish_orders SET donorID = destinationDonorId WHERE donorID = sourceDonorId AND ID > -1;
    UPDATE Mailersend_survey_responses SET DonorID = destinationDonorId WHERE DonorID = sourceDonorId AND ID > -1;
    # Set null on delete - these rows survive but lose the donor reference
    UPDATE Adoveo_fundraiser SET Donor_ID = destinationDonorId WHERE Donor_ID = sourceDonorId AND ID > -1;
    UPDATE Adoveo_giftcard_transactions SET Sender_donor_ID = destinationDonorId WHERE Sender_donor_ID = sourceDonorId AND ID > -1;
    UPDATE Adoveo_giftcard_transactions SET Receiver_donor_ID = destinationDonorId WHERE Receiver_donor_ID = sourceDonorId AND ID > -1;

    DELETE FROM Donors WHERE ID = sourceDonorId;

    # Loop over all where count of ssn > 1
    OPEN curSsns;
	consolidateTaxUnits: LOOP
		FETCH curSsns INTO currentSsn;
		IF finished = 1 THEN
			LEAVE consolidateTaxUnits;
		END IF;

		SELECT ID from Tax_unit WHERE Donor_ID = destinationDonorId AND ssn = currentSsn LIMIT 1 INTO selectedTaxUnitId;
        UPDATE Distributions
			SET Tax_unit_ID = selectedTaxUnitId
            WHERE
				Donor_ID = destinationDonorId AND
                Tax_unit_ID IN (SELECT * FROM (SELECT ID FROM Tax_unit WHERE Donor_ID = destinationDonorId AND ssn = currentSsn) as ids);

        DELETE FROM Tax_unit
			WHERE
				Donor_ID = destinationDonorId AND
				ssn = currentSsn AND
                ID != selectedTaxUnitId;
    END LOOP consolidateTaxUnits;

    CLOSE curSsns;

    COMMIT;
END;

-- DropForeignKey
ALTER TABLE `Funds_donations` DROP FOREIGN KEY `FK_Funds_donorid`;

-- DropForeignKey
ALTER TABLE `Funds_donations` DROP FOREIGN KEY `FK_Funds_taxunit`;

-- DropTable
DROP TABLE `Funds_donations`;
