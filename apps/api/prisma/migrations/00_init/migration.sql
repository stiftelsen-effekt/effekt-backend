-- CreateTable
CREATE TABLE `Auth0_users` (
  `Id` VARCHAR(64) NOT NULL,
  `Given Name` TEXT NULL,
  `Family Name` TEXT NULL,
  `Nickname` TEXT NULL,
  `Name` TEXT NULL,
  `Email` VARCHAR(64) NULL,
  `Email Verified` TEXT NULL,
  `Picture` TEXT NULL,
  `Connection` TEXT NULL,
  `Created At` TEXT NULL,
  `Updated At` TEXT NULL,
  `donorid` INTEGER NULL,
  INDEX `index2`(`donorid`),
  INDEX `index3`(`Email`),
  PRIMARY KEY (`Id`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `AvtaleGiro_replaced_distributions` (
  `Original_AvtaleGiro_KID` VARCHAR(15) NOT NULL,
  `Replacement_KID` VARCHAR(15) NOT NULL,
  `Timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`Replacement_KID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Avtalegiro_agreements` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `KID` VARCHAR(15) NOT NULL,
  `amount` INTEGER NOT NULL,
  `payment_date` INTEGER NOT NULL,
  `notice` BOOLEAN NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT false,
  `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `created` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `cancelled` DATE NULL,
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Avtalegiro_conversion_reminders` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `KID` VARCHAR(45) NOT NULL,
  `NumReminders` INTEGER NOT NULL DEFAULT 0,
  `LastReminderSent` DATETIME(0) NULL,
  UNIQUE INDEX `KID_UNIQUE`(`KID`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Avtalegiro_shipment` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `num_claims` INTEGER NULL,
  `generated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Combining_table` (
  `Donor_ID` INTEGER NOT NULL,
  `Distribution_ID` INTEGER NOT NULL,
  `Tax_unit_ID` INTEGER NULL,
  `KID` VARCHAR(16) NOT NULL,
  `timestamp_created` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `Meta_owner_ID` INTEGER NOT NULL DEFAULT 3,
  `Replaced_old_organizations` TINYINT NULL,
  `Standard_split` BOOLEAN NULL,
  INDEX `KID`(`KID`),
  INDEX `KIDTaxUnit`(`KID`, `Tax_unit_ID`),
  INDEX `fk_Combining_to_Distribution_idx`(`Distribution_ID`),
  INDEX `fk_Combining_to_Donor_idx`(`Donor_ID`),
  INDEX `fk_Combining_to_TaxUnit_idx`(`Tax_unit_ID`),
  INDEX `taxUnitDonorId`(`Tax_unit_ID`, `Donor_ID`),
  PRIMARY KEY (`Donor_ID`, `Distribution_ID`, `KID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Data_owner` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `owner` VARCHAR(128) NOT NULL,
  `default` BOOLEAN NOT NULL DEFAULT false,
  UNIQUE INDEX `ID_UNIQUE`(`ID`),
  UNIQUE INDEX `owner_UNIQUE`(`owner`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Distribution` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `OrgID` INTEGER NOT NULL,
  `percentage_share` DECIMAL(15, 12) NOT NULL,
  UNIQUE INDEX `ID_UNIQUE`(`ID`),
  INDEX `fk_Distribution_to_Organizations_idx`(`OrgID`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Donations` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `Donor_ID` INTEGER NOT NULL,
  `Payment_ID` INTEGER NOT NULL,
  `PaymentExternal_ID` VARCHAR(32) NULL,
  `sum_confirmed` DECIMAL(16, 2) NOT NULL,
  `timestamp_confirmed` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `transaction_cost` DECIMAL(16, 2) NULL,
  `KID_fordeling` VARCHAR(16) NOT NULL,
  `inserted` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `last_updated` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `Meta_owner_ID` INTEGER NOT NULL DEFAULT 3,
  UNIQUE INDEX `ID_UNIQUE`(`ID`),
  UNIQUE INDEX `PaymentExternal_ID_UNIQUE`(`PaymentExternal_ID`),
  INDEX `KidAndTimestamp`(`KID_fordeling`, `timestamp_confirmed`),
  INDEX `Timestamp`(`timestamp_confirmed`),
  INDEX `fk_Donations_Donors_KID_idx`(`Donor_ID`),
  INDEX `fk_Donations_to_Donors_idx`(`Payment_ID`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Donors` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `email` TINYTEXT NOT NULL,
  `full_name` TINYTEXT NULL,
  `date_registered` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `password_hash` VARCHAR(64) NULL,
  `password_salt` VARCHAR(32) NULL,
  `Meta_owner_ID` INTEGER NOT NULL DEFAULT 3,
  `newsletter` BOOLEAN NULL,
  `trash` TINYINT NULL,
  `ssn` VARCHAR(45) NULL,
  UNIQUE INDEX `KID_UNIQUE`(`ID`),
  UNIQUE INDEX `email_UNIQUE`(`email`(63)),
  INDEX `full_name`(`full_name`(64)),
  INDEX `search`(`email`(63), `full_name`(64)),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `FB_campaign_org_shares` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `FB_campaign_ID` VARCHAR(20) NOT NULL,
  `Org_ID` INTEGER NOT NULL,
  `Share` DECIMAL(15, 12) NOT NULL,
  `Standard_split` BOOLEAN NULL,
  INDEX `fk_FB_campaign_org_shares_1_idx`(`Org_ID`),
  INDEX `fk_FB_campaign_org_shares_2_idx`(`FB_campaign_ID`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `FB_campaigns` (
  `ID` VARCHAR(20) NOT NULL,
  `Fundraiser_title` VARCHAR(150) NOT NULL,
  `Source_name` VARCHAR(45) NOT NULL,
  `Permalink` VARCHAR(100) NOT NULL,
  `Campaign_owner_name` VARCHAR(45) NOT NULL,
  `Fundraiser_type` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `FB_donation_reports` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `FB_report` LONGBLOB NOT NULL,
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `FB_payment_ID` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `donorID` INTEGER NOT NULL,
  `paymentID` VARCHAR(45) NOT NULL,
  `inserted` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `taxUnitID` INTEGER NOT NULL,
  INDEX `donorID_idx`(`donorID`),
  INDEX `fk_fbpayment_to_taxunit_idx`(`taxUnitID`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Funds_donations` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `DonorID` INTEGER NULL,
  `TaxUnitID` INTEGER NULL,
  `Sum` DECIMAL(15, 2) NOT NULL,
  `Timestamp` DATETIME(0) NOT NULL,
  `PaymentExternalID` VARCHAR(45) NOT NULL,
  INDEX `FK_Funds_donorid_idx`(`DonorID`),
  INDEX `FK_Funds_taxunit_idx`(`TaxUnitID`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Import_logs` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `label` VARCHAR(45) NULL,
  `result` JSON NULL,
  `timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Organizations` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(45) NOT NULL,
  `abbriv` VARCHAR(10) NOT NULL,
  `short_desc` VARCHAR(255) NULL,
  `long_desc` VARCHAR(45) NOT NULL,
  `info_url` VARCHAR(156) NULL,
  `std_percentage_share` TINYINT NULL DEFAULT 0,
  `is_active` TINYINT NULL,
  `ordering` TINYINT NULL,
  UNIQUE INDEX `ID_UNIQUE`(`ID`),
  UNIQUE INDEX `full_name_UNIQUE`(`full_name`),
  UNIQUE INDEX `abbriv_UNIQUE`(`abbriv`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Payment` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `payment_name` VARCHAR(45) NOT NULL,
  `abbriv` VARCHAR(45) NOT NULL,
  `short_desc` VARCHAR(45) NULL,
  `flat_fee` DECIMAL(5, 2) NULL,
  `percentage_fee` DECIMAL(5, 2) NULL,
  `lastUpdated` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `payment_name_UNIQUE`(`payment_name`),
  UNIQUE INDEX `abbriv_UNIQUE`(`abbriv`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Payment_intent` (
  `Id` INTEGER NOT NULL AUTO_INCREMENT,
  `Payment_method` VARCHAR(45) NULL,
  `KID_fordeling` VARCHAR(20) NULL,
  `timetamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `Id_UNIQUE`(`Id`),
  INDEX `KID_fordeling_idx`(`KID_fordeling`),
  PRIMARY KEY (`Id`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Paypal_historic_distributions` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `Donor_ID` INTEGER NOT NULL,
  `KID` INTEGER NOT NULL,
  `ReferenceTransactionNumber` VARCHAR(32) NOT NULL,
  UNIQUE INDEX `Donor_ID_UNIQUE`(`Donor_ID`),
  UNIQUE INDEX `KID_UNIQUE`(`KID`),
  UNIQUE INDEX `ReferenceTransactionNumber_UNIQUE`(`ReferenceTransactionNumber`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Referral_records` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `ReferralID` INTEGER NOT NULL,
  `UserID` INTEGER NOT NULL,
  `Registered` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `other_comment` VARCHAR(1000) NULL,
  `website_session` VARCHAR(45) NULL,
  INDEX `referral_type_idx`(`ReferralID`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Referral_types` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(256) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `ordering` INTEGER NULL,
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Seeded` (
  `Status` VARCHAR(255) NOT NULL,
  `Timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Tax_unit` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `Donor_ID` INTEGER NOT NULL,
  `ssn` VARCHAR(11) NOT NULL,
  `full_name` VARCHAR(128) NOT NULL,
  `registered` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `archived` DATETIME(0) NULL,
  INDEX `FK_tax_unit_donor_id_idx`(`Donor_ID`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Vipps_agreement_charges` (
  `chargeID` VARCHAR(11) NOT NULL,
  `agreementID` VARCHAR(20) NOT NULL,
  `amountNOK` INTEGER UNSIGNED NOT NULL,
  `KID` VARCHAR(15) NOT NULL,
  `dueDate` VARCHAR(100) NOT NULL,
  `timestamp_created` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `status` VARCHAR(30) NOT NULL,
  `type` VARCHAR(20) NULL,
  UNIQUE INDEX `chargeID_UNIQUE`(`chargeID`),
  INDEX `FK_ID_agreementID_idx`(`agreementID`),
  PRIMARY KEY (`chargeID`, `agreementID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Vipps_agreements` (
  `ID` VARCHAR(20) NOT NULL,
  `donorID` INTEGER NOT NULL,
  `KID` VARCHAR(15) NOT NULL,
  `amount` INTEGER NOT NULL,
  `status` VARCHAR(30) NULL,
  `monthly_charge_day` INTEGER NOT NULL,
  `paused_until_date` VARCHAR(255) NULL,
  `agreement_url_code` VARCHAR(100) NOT NULL,
  `timestamp_created` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `force_charge_date` VARCHAR(100) NULL,
  `cancellation_date` DATE NULL,
  INDEX `KID_idx`(`KID`),
  INDEX `donorID_idx`(`donorID`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Vipps_matching_rules` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `SalesLocation` VARCHAR(45) NULL,
  `Message` VARCHAR(45) NULL,
  `PeriodFrom` DATE NOT NULL,
  `PeriodTo` DATE NOT NULL,
  `ResolveKID` VARCHAR(32) NOT NULL,
  `precedence` INTEGER NULL,
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Vipps_order_transaction_statuses` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `orderID` VARCHAR(256) NOT NULL,
  `transactionID` VARCHAR(45) NULL,
  `amount` INTEGER NOT NULL,
  `operation` VARCHAR(45) NOT NULL,
  `timestamp` DATETIME(0) NOT NULL,
  `success` VARCHAR(45) NOT NULL,
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Vipps_orders` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `orderID` VARCHAR(256) NOT NULL,
  `donorID` INTEGER NOT NULL,
  `donationID` INTEGER NULL,
  `KID` VARCHAR(15) NOT NULL,
  `token` VARCHAR(256) NULL,
  `registered` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `DonationID`(`donationID`, `orderID`),
  INDEX `Donor_ID_idx`(`donorID`),
  INDEX `ID_order_id`(`ID`, `orderID`),
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Vipps_tokens` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `expires` DATETIME(0) NOT NULL,
  `type` VARCHAR(45) NOT NULL,
  `token` TEXT NOT NULL,
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `schema_migrations` (
  `version` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`version`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Combining_temp` (
  `Donor_ID` INTEGER NOT NULL,
  `Distribution_ID` INTEGER NOT NULL,
  `Tax_unit_ID` INTEGER NULL,
  `KID` VARCHAR(15) NOT NULL,
  `timestamp_created` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
  `Meta_owner_ID` INTEGER NOT NULL DEFAULT 3,
  `Replaced_old_organizations` TINYINT NULL,
  `Standard_split` BOOLEAN NULL,
  INDEX `KID`(`KID`),
  INDEX `fk_Combining_to_Distribution_idx`(`Distribution_ID`),
  INDEX `fk_Combining_to_Donor_idx`(`Donor_ID`),
  INDEX `fk_Combining_to_TaxUnit_idx`(`Tax_unit_ID`),
  INDEX `taxUnitDonorId`(`Tax_unit_ID`, `Donor_ID`),
  PRIMARY KEY (`Donor_ID`, `Distribution_ID`, `KID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- CreateTable
CREATE TABLE `Conversion_rates` (
  `ID` INTEGER NOT NULL AUTO_INCREMENT,
  `Month` INTEGER NOT NULL,
  `Year` INTEGER NOT NULL,
  `PaymentMethod` VARCHAR(45) NOT NULL,
  `Rate` DOUBLE NOT NULL,
  PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;

-- AddForeignKey
ALTER TABLE
  `Combining_table`
ADD
  CONSTRAINT `Combining_table_KID_fkey` FOREIGN KEY (`KID`) REFERENCES `AvtaleGiro_replaced_distributions`(`Replacement_KID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Combining_table`
ADD
  CONSTRAINT `fk_Combining_to_Distribution` FOREIGN KEY (`Distribution_ID`) REFERENCES `Distribution`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Combining_table`
ADD
  CONSTRAINT `fk_Combining_to_Donor` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Combining_table`
ADD
  CONSTRAINT `fk_Combining_to_TaxUnit` FOREIGN KEY (`Tax_unit_ID`) REFERENCES `Tax_unit`(`ID`) ON DELETE
SET
  NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Distribution`
ADD
  CONSTRAINT `fk_Distribution_to_Organizations` FOREIGN KEY (`OrgID`) REFERENCES `Organizations`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Donations`
ADD
  CONSTRAINT `fk_Donations_to_Donors_ID` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Donations`
ADD
  CONSTRAINT `fk_Donations_to_Payment` FOREIGN KEY (`Payment_ID`) REFERENCES `Payment`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `FB_payment_ID`
ADD
  CONSTRAINT `donorID` FOREIGN KEY (`donorID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `FB_payment_ID`
ADD
  CONSTRAINT `fk_fbpayment_to_taxunit` FOREIGN KEY (`taxUnitID`) REFERENCES `Tax_unit`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Funds_donations`
ADD
  CONSTRAINT `FK_Funds_donorid` FOREIGN KEY (`DonorID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Funds_donations`
ADD
  CONSTRAINT `FK_Funds_taxunit` FOREIGN KEY (`TaxUnitID`) REFERENCES `Tax_unit`(`ID`) ON DELETE
SET
  NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Referral_records`
ADD
  CONSTRAINT `referral_type` FOREIGN KEY (`ReferralID`) REFERENCES `Referral_types`(`ID`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Tax_unit`
ADD
  CONSTRAINT `FK_tax_unit_donor_id` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Vipps_agreement_charges`
ADD
  CONSTRAINT `FK_agreementID_ID` FOREIGN KEY (`agreementID`) REFERENCES `Vipps_agreements`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `Vipps_agreements`
ADD
  CONSTRAINT `FK_donorID` FOREIGN KEY (`donorID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;