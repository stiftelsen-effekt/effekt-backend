-- Each donor's donations by confirmed time: the first/last donation per donor (payment intent
-- status and new-donor flag) becomes a covering skip scan, and "the donor's first donation on or
-- after a day" a single index dive. Additive: an InnoDB secondary index, built online (in place,
-- no table copy; reads and writes continue).

-- CreateIndex
CREATE INDEX `Donations_Donor_ID_timestamp_confirmed_idx` ON `Donations`(`Donor_ID`, `timestamp_confirmed`);
