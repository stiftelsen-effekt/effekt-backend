CREATE ALGORITHM = UNDEFINED DEFINER = `root` @`%` SQL SECURITY DEFINER VIEW `Recurring_no_kid_bank_donors` AS
select
  `Donors`.`ID` AS `DonorID`,
  `Donations`.`KID_fordeling` AS `KID`,
  count(0) AS `NumDonations`,
  `Donors`.`full_name` AS `DonorName`,
  (
    select
      `SubDonations`.`sum_confirmed`
    from
      `Donations` `SubDonations`
    where
      (
        (
          `SubDonations`.`KID_fordeling` = `Donations`.`KID_fordeling`
        )
        and (`SubDonations`.`Payment_ID` = 5)
      )
    order by
      `SubDonations`.`timestamp_confirmed` desc
    limit
      1
  ) AS `LatestSum`
from
  (
    `Donations`
    join `Donors` on((`Donations`.`Donor_ID` = `Donors`.`ID`))
  )
where
  (`Donations`.`Payment_ID` = 5)
group by
  concat(
    `Donations`.`Donor_ID`,
    '-',
    `Donations`.`KID_fordeling`
  ),
  `Donors`.`full_name`,
  `Donors`.`ID`,
  `Donations`.`KID_fordeling`
having
  (`NumDonations` > 2)
order by
  `NumDonations` desc;

CREATE ALGORITHM = UNDEFINED DEFINER = `root` @`%` SQL SECURITY DEFINER VIEW `v_Donors_anon` AS with `several_names` as (
  select
    `d`.`full_name` AS `full_name`,
    `d`.`ID` AS `ID`,
    `d`.`date_registered` AS `date_registered`,
    (`d`.`password_hash` is not null) AS `has_password`,
    `d`.`Meta_owner_ID` AS `Meta_owner_ID`,
    `d`.`newsletter` AS `newsletter`,
    if(
      (
        (`d`.`full_name` like '%standard%')
        or (`d`.`full_name` like '%linjeforening%')
        or (`d`.`full_name` like '%smørekoppen%')
        or (`d`.`full_name` like '%ntnu%')
        or (`d`.`full_name` like '% AS')
        or (`d`.`full_name` like '% As')
        or (`d`.`full_name` like '%Foreningen%')
        or (`d`.`full_name` like '%Stiftelsen%')
        or (`d`.`full_name` like '%auksjon%')
        or (`d`.`email` = 'anon@gieffektivt.no')
      ),
      0,
      1
    ) AS `is_person`,
    if((`d`.`full_name` like '%anonym%'), 1, 0) AS `is_anon`,
    if(
      (
        (
          (
            length(trim(`d`.`full_name`)) - length(replace(trim(`d`.`full_name`), ' ', ''))
          ) + 1
        ) > 1
      ),
      true,
      false
    ) AS `several_names`
  from
    `Donors` `d`
  where
    (
      (`d`.`trash` is null)
      or (`d`.`trash` = 0)
    )
),
`common_name` as (
  select
    `sn`.`ID` AS `ID`,
    `sn`.`date_registered` AS `date_registered`,
    `sn`.`has_password` AS `has_password`,
    `sn`.`is_anon` AS `is_anon`,
    `sn`.`Meta_owner_ID` AS `Meta_owner_ID`,
    `sn`.`is_person` AS `is_person`,
    `sn`.`newsletter` AS `newsletter`,
    if(
      (
        concat(
          substring_index(trim(`sn`.`full_name`), ' ', 1),
          '_',
          if(
            `sn`.`several_names`,
            substring_index(trim(`sn`.`full_name`), ' ', -(1)),
            `sn`.`ID`
          )
        ) is null
      ),
      `sn`.`ID`,
      concat(
        substring_index(trim(`sn`.`full_name`), ' ', 1),
        '_',
        if(
          `sn`.`several_names`,
          substring_index(trim(`sn`.`full_name`), ' ', -(1)),
          `sn`.`ID`
        )
      )
    ) AS `common_name`
  from
    `several_names` `sn`
),
`distinct_names` as (
  select
    distinct `cm`.`common_name` AS `distinct_name`
  from
    `common_name` `cm`
),
`name_id` as (
  select
    `dm`.`distinct_name` AS `distinct_name`,
    row_number() OVER (
      ORDER BY
        `dm`.`distinct_name`
    ) AS `name_id`
  from
    `distinct_names` `dm`
),
`only_business_tu` as (
  select
    `t`.`Donor_ID` AS `Donor_ID`,
    min(if((char_length(`t`.`ssn`) = 9), true, false)) AS `only_business_tu`
  from
    `Tax_unit` `t`
  group by
    `t`.`Donor_ID`
)
select
  `cm`.`ID` AS `ID`,
  `cm`.`date_registered` AS `date_registered`,
  `ni`.`name_id` AS `name_ID`,
  `cm`.`has_password` AS `has_password`,
  if(
    (`ob`.`only_business_tu` is null),
    `cm`.`is_person`,
    (
      (0 <> `cm`.`is_person`)
      and (0 = `ob`.`only_business_tu`)
    )
  ) AS `is_person`,
  `cm`.`is_anon` AS `is_anon`,
  `cm`.`Meta_owner_ID` AS `Meta_owner_ID`,
  `cm`.`newsletter` AS `newsletter`
from
  (
    (
      `name_id` `ni`
      join `common_name` `cm` on((`cm`.`common_name` = `ni`.`distinct_name`))
    )
    left join `only_business_tu` `ob` on((`ob`.`Donor_ID` = `cm`.`ID`))
  );

CREATE ALGORITHM = UNDEFINED DEFINER = `root` @`%` SQL SECURITY DEFINER VIEW `v_Duplicate_full_names` AS
select
  count(`D`.`full_name`) AS `COUNT(full_name)`,
  `D`.`full_name` AS `fname`,
  (
    select
      `Auth0_users`.`donorid`
    from
      `Auth0_users`
    where
      `Auth0_users`.`Email` in (
        select
          `Donors`.`email`
        from
          `Donors`
        where
          (`Donors`.`full_name` = `D`.`full_name`)
      )
    limit
      1
  ) AS `auth0id`,
  (
    select
      `Auth0_users`.`Email`
    from
      `Auth0_users`
    where
      `Auth0_users`.`Email` in (
        select
          `Donors`.`email`
        from
          `Donors`
        where
          (`Donors`.`full_name` = `D`.`full_name`)
      )
    limit
      1
  ) AS `auth0email`,
  (
    select
      `Donations`.`timestamp_confirmed`
    from
      (
        `Donations`
        join `Donors` on((`Donors`.`ID` = `Donations`.`Donor_ID`))
      )
    where
      `Donors`.`email` in (
        select
          `Donors`.`email`
        from
          `Donors`
        where
          (`Donors`.`full_name` = `D`.`full_name`)
      )
    order by
      `Donations`.`timestamp_confirmed` desc
    limit
      1
  ) AS `lastDonationDate`,
  (
    select
      `Donations`.`Donor_ID`
    from
      (
        `Donations`
        join `Donors` on((`Donors`.`ID` = `Donations`.`Donor_ID`))
      )
    where
      `Donors`.`email` in (
        select
          `Donors`.`email`
        from
          `Donors`
        where
          (`Donors`.`full_name` = `D`.`full_name`)
      )
    order by
      `Donations`.`timestamp_confirmed` desc
    limit
      1
  ) AS `lastDonationDonorId`
from
  `Donors` `D`
where
  (
    (
      (`D`.`trash` = 0)
      or (`D`.`trash` is null)
    )
    and (locate(' ', `D`.`full_name`) > 0)
    and (`D`.`full_name` <> '')
  )
group by
  `D`.`full_name`
having
  (count(`D`.`full_name`) > 1);

CREATE ALGORITHM = UNDEFINED DEFINER = `root` @`%` SQL SECURITY DEFINER VIEW `v_Duplicate_orgs_in_distributions` AS
select
  `C`.`KID` AS `KID`,
  `D`.`OrgID` AS `OrgID`,
  count(`D`.`OrgID`) AS `duplicates`,
  sum(`D`.`percentage_share`) AS `percentage_sum`
from
  (
    `Combining_table` `C`
    join `Distribution` `D` on((`C`.`Distribution_ID` = `D`.`ID`))
  )
group by
  `C`.`KID`,
  `D`.`OrgID`
having
  (count(`D`.`OrgID`) > 1);

CREATE ALGORITHM = UNDEFINED DEFINER = `root` @`%` SQL SECURITY DEFINER VIEW `v_Tax_deductions` AS
select
  sum(`Donations`.`sum_confirmed`) AS `SUM(sum_confirmed)`,
  `TX`.`ID` AS `TaxUnitID`,
  `TX`.`ssn` AS `TaxUnitSsn`,
  `TX`.`full_name` AS `TaxUnitName`,
  `D`.`email` AS `DonorUserEmail`,
  `D`.`full_name` AS `DonorUserName`
from
  (
    (
      (
        `Tax_unit` `TX`
        join (
          select
            `Combining_table`.`KID` AS `KID`,
            `Combining_table`.`Tax_unit_ID` AS `Tax_unit_ID`
          from
            `Combining_table`
          group by
            `Combining_table`.`KID`,
            `Combining_table`.`Tax_unit_ID`
        ) `C` on((`TX`.`ID` = `C`.`Tax_unit_ID`))
      )
      join `Donations` on((`C`.`KID` = `Donations`.`KID_fordeling`))
    )
    join `Donors` `D` on((`D`.`ID` = `Donations`.`Donor_ID`))
  )
where
  (
    (year(`Donations`.`timestamp_confirmed`) = 2022)
    and (
      (`D`.`trash` <> 1)
      or (`D`.`trash` is null)
    )
    and (`TX`.`ssn` is not null)
    and (`TX`.`ssn` <> '')
  )
group by
  `TX`.`ID`,
  `TX`.`ssn`,
  `TX`.`full_name`,
  `D`.`email`,
  `D`.`full_name`
having
  (sum(`Donations`.`sum_confirmed`) >= 500)
order by
  sum(`Donations`.`sum_confirmed`) desc
limit
  10000;

CREATE ALGORITHM = UNDEFINED DEFINER = `root` @`%` SQL SECURITY DEFINER VIEW `v_Tax_unit_anon` AS with `people` as (
  select
    `t`.`ID` AS `ID`,
    if(
      (
        (cast(substr(`t`.`ssn`, 9, 1) as unsigned) % 2) = 0
      ),
      'F',
      'M'
    ) AS `gender`,
    if(
      (
        str_to_date(substr(`t`.`ssn`, 1, 6), '%d%c%y') <= curdate()
      ),
      str_to_date(substr(`t`.`ssn`, 1, 6), '%d%c%y'),
      (
        str_to_date(substr(`t`.`ssn`, 1, 6), '%d%c%y') - interval 100 year
      )
    ) AS `birthdate`
  from
    `Tax_unit` `t`
  where
    (char_length(`t`.`ssn`) = 11)
)
select
  `t`.`ID` AS `ID`,
  `t`.`Donor_ID` AS `Donor_ID`,
  `p`.`gender` AS `gender`,
  `p`.`birthdate` AS `birthdate`,
  if(
    (char_length(`t`.`ssn`) = 11),
    timestampdiff(YEAR, `p`.`birthdate`, curdate()),
    NULL
  ) AS `age`,
  if((char_length(`t`.`ssn`) = 9), true, false) AS `is_business`,
  `t`.`registered` AS `registered`
from
  (
    (
      `Tax_unit` `t`
      left join `people` `p` on((`p`.`ID` = `t`.`ID`))
    )
    join `Donors` `d` on((`d`.`ID` = `t`.`Donor_ID`))
  )
where
  (
    (
      (`d`.`trash` is null)
      or (`d`.`trash` = 0)
    )
    and (`t`.`archived` is null)
    and (`t`.`ssn` is not null)
    and (`t`.`ssn` <> '')
  );