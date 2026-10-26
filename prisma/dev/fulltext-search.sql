-- Production has a FULLTEXT index on Donors(email, full_name) that the migrations never recreated
-- after 20241111195003 replaced it with a BTREE index. Donor search (MATCH ... AGAINST) needs it.
CREATE FULLTEXT INDEX search_fulltext ON Donors (full_name, email);
