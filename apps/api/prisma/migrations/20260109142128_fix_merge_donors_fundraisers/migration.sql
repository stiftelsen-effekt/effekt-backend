-- Fix merge_donors procedure to include Fundraisers table update
-- Without this fix, when merging donors, any fundraisers owned by the source donor
-- are deleted due to CASCADE delete, breaking fundraiser transaction links

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
