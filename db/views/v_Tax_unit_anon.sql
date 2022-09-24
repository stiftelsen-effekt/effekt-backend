CREATE OR REPLACE VIEW v_Tax_unit_anon AS
WITH people as (
	SELECT 
		t.ID,
		IF(MOD(CAST(substring(t.ssn, 9 , 1) AS UNSIGNED), 2) = 0, 'F', 'M') as "gender",
		IF(STR_TO_DATE(substring(t.ssn, 1 , 6),'%d%c%y') <= CURDATE(), str_to_date(substring(t.ssn, 1 , 6), "%d%c%y"), DATE_SUB(str_to_date(substring(t.ssn, 1 , 6), "%d%c%y"), INTERVAL 100 YEAR)) as "birthdate"
	FROM EffektDonasjonDB.Tax_unit t
    WHERE CHAR_LENGTH(t.ssn) = 11
)
SELECT 
	t.ID,
    t.Donor_ID,
    p.gender,
    p.birthdate,
    IF((CHAR_LENGTH(t.ssn) = 11), TIMESTAMPDIFF(YEAR, p.birthdate, CURDATE()), NULL)  as "age",
    IF(CHAR_LENGTH(t.ssn) = 9, True, False) AS "is_business", 
    t.registered
FROM EffektDonasjonDB.Tax_unit t
LEFT OUTER JOIN people p on p.ID = t.ID
INNER JOIN EffektDonasjonDB.Donors d on d.ID = t.Donor_ID
WHERE (d.trash IS NULL or d.trash = 0);
