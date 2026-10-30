-- Fix merge_donors to move every table that references Donors.
--
-- The procedure moves the source donor's rows to the destination donor and then
-- deletes the source donor. Any table it forgets is not left behind - it is
-- destroyed, because these foreign keys are ON DELETE CASCADE:
--
--   Funds_donations.DonorID
--   Swish_orders.donorID
--   Mailersend_survey_responses.DonorID
--
-- and these are ON DELETE SET NULL, so the rows survive but are silently
-- orphaned from the donor:
--
--   Adoveo_fundraiser.Donor_ID
--   Adoveo_giftcard_transactions.Sender_donor_ID
--   Adoveo_giftcard_transactions.Receiver_donor_ID
--
-- Also adds a guard against merging a donor into itself. That call is not a
-- no-op today: every UPDATE matches nothing and the DELETE then removes the
-- donor along with all their donations and distributions.

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
    UPDATE Funds_donations SET DonorID = destinationDonorId WHERE DonorID = sourceDonorId AND ID > -1;
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

        # Funds_donations.TaxUnitID is ON DELETE SET NULL, so the rows we just
        # moved over would quietly lose their tax unit when the duplicate is
        # dropped below
        UPDATE Funds_donations
			SET TaxUnitID = selectedTaxUnitId
            WHERE
				DonorID = destinationDonorId AND
                TaxUnitID IN (SELECT * FROM (SELECT ID FROM Tax_unit WHERE Donor_ID = destinationDonorId AND ssn = currentSsn) as ids);

        DELETE FROM Tax_unit
			WHERE
				Donor_ID = destinationDonorId AND
				ssn = currentSsn AND
                ID != selectedTaxUnitId;
    END LOOP consolidateTaxUnits;

    CLOSE curSsns;

    COMMIT;
END;
