-- remove leading and trailing whitespaces with trim 
-- check if there are whitespaces between words to check if there are several names or just first name
-- if there is just a first name, add the donor_id to the first_name to make a unique common_name
-- if there is no full_name at all then just use donor_id

CREATE OR REPLACE VIEW v_Donors_anon AS 
WITH several_names AS (	
	SELECT
		d.full_name,
		d.ID,
		d.date_registered,
		d.password_hash IS NOT NULL AS "has_password",
		d.Meta_owner_ID,
		d.newsletter,
		IF((LENGTH(TRIM(d.full_name)) - LENGTH(REPLACE(TRIM(d.full_name), ' ', '')) + 1) > 1, True, False) as several_names
	FROM EffektDonasjonDB.Donors d
    WHERE (d.trash IS NULL OR d.trash = 0)
), common_name AS (
	SELECT 
		sn.ID,
        sn.date_registered, 
        sn.has_password,
        sn.Meta_owner_ID,
        sn.newsletter,
		IF((CONCAT(SUBSTRING_INDEX(TRIM(sn.full_name), ' ', 1), "_", IF(sn.several_names, SUBSTRING_INDEX(TRIM(sn.full_name), ' ', -1), sn.ID))) IS NULL, 
				sn.ID,  
                (CONCAT(SUBSTRING_INDEX(TRIM(sn.full_name), ' ', 1), "_", IF(sn.several_names, SUBSTRING_INDEX(TRIM(sn.full_name), ' ', -1), sn.ID)))
		  ) AS common_name
	FROM several_names sn
), distinct_names AS (
	SELECT 
		DISTINCT(cm.common_name) AS distinct_name
	FROM common_name cm
), name_id AS (
	SELECT
		dm.distinct_name,
		ROW_NUMBER() OVER (ORDER BY dm.distinct_name) AS name_id
	FROM distinct_names dm
)
	SELECT 
		cm.ID,
        cm.date_registered,
		ni.name_ID,
        cm.has_password,
        cm.Meta_owner_ID,
        cm.newsletter
	FROM name_id ni
	INNER JOIN common_name cm ON cm.common_name = ni.distinct_name;
