-- Donations by KID with everything the regranting balance needs (confirmed time, payment method,
-- sum), so the per-KID sums behind allocations and "Unassigned" read only this index, not the
-- table rows. Additive: an InnoDB secondary index, built online (in place, no table copy; reads
-- and writes continue). KidAndTimestamp is a prefix of it and could be dropped later.

-- CreateIndex
CREATE INDEX `KidTimestampPaymentSum` ON `Donations`(`KID_fordeling`, `timestamp_confirmed`, `Payment_ID`, `sum_confirmed`);
