-- MySQL dump 10.13  Distrib 8.0.28, for Linux (x86_64)
--
-- Host: 127.0.0.1    Database: EffektDonasjonDB
-- ------------------------------------------------------
-- Server version	8.0.18-google

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `Access_applications`
--

DROP TABLE IF EXISTS `Access_applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Access_applications` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(45) DEFAULT NULL,
  `clientID` varchar(64) DEFAULT NULL,
  `clientSecret` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Access_applications_callbacks`
--

DROP TABLE IF EXISTS `Access_applications_callbacks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Access_applications_callbacks` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `ApplicationID` int(11) NOT NULL,
  `callback` varchar(348) DEFAULT NULL,
  PRIMARY KEY (`ID`),
  UNIQUE KEY `ID_UNIQUE` (`ID`),
  KEY `ApplicationValidCallbacks_idx` (`ApplicationID`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Access_applications_permissions`
--

DROP TABLE IF EXISTS `Access_applications_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Access_applications_permissions` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `Application_ID` int(11) DEFAULT NULL,
  `Permission_ID` int(11) DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Access_keys`
--

DROP TABLE IF EXISTS `Access_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Access_keys` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `Application_ID` int(11) NOT NULL,
  `Donor_ID` int(11) NOT NULL,
  `key` varchar(64) NOT NULL,
  `expires` datetime DEFAULT NULL,
  PRIMARY KEY (`ID`),
  KEY `AccessKeyApplication_idx` (`Application_ID`),
  KEY `AccessKeyDonor_idx` (`Donor_ID`),
  CONSTRAINT `AccessKeyApplication` FOREIGN KEY (`Application_ID`) REFERENCES `Access_applications` (`ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AccessKeyDonor` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors` (`ID`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=285 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER `Access_keys_BEFORE_INSERT` BEFORE INSERT ON `Access_keys` FOR EACH ROW SET new.expires = TIMESTAMPADD(DAY, 30, Now()) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `Access_keys_permissions`
--

DROP TABLE IF EXISTS `Access_keys_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Access_keys_permissions` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `Key_ID` int(11) DEFAULT NULL,
  `Permission_ID` int(11) DEFAULT NULL,
  PRIMARY KEY (`ID`),
  KEY `AccessKeyPermissionsKey_idx` (`Key_ID`),
  KEY `AccessKeyPermissionsPermission_idx` (`Permission_ID`),
  CONSTRAINT `AccessKeyPermissionsKey` FOREIGN KEY (`Key_ID`) REFERENCES `Access_keys` (`ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AccessKeyPermissionsPermission` FOREIGN KEY (`Permission_ID`) REFERENCES `Access_permissions` (`ID`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1105 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Access_permissions`
--

DROP TABLE IF EXISTS `Access_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Access_permissions` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `shortname` varchar(45) DEFAULT NULL,
  `description` varchar(100) DEFAULT NULL,
  `restricted` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Access_restricted_permissions`
--

DROP TABLE IF EXISTS `Access_restricted_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Access_restricted_permissions` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `Donor_ID` int(11) DEFAULT NULL,
  `Permission_ID` int(11) DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=49 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Access_tokens`
--

DROP TABLE IF EXISTS `Access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Access_tokens` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `token` varchar(64) NOT NULL,
  `Key_ID` int(11) NOT NULL,
  `expires` datetime DEFAULT NULL,
  PRIMARY KEY (`ID`),
  KEY `AccessTokenKey_idx` (`Key_ID`),
  CONSTRAINT `AccessTokenKey` FOREIGN KEY (`Key_ID`) REFERENCES `Access_keys` (`ID`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3974 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER `Access_tokens_BEFORE_INSERT` BEFORE INSERT ON `Access_tokens` FOR EACH ROW SET new.expires = TIMESTAMPADD(MINUTE, 20, Now()) */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `AvtaleGiro_replaced_distributions`
--

DROP TABLE IF EXISTS `AvtaleGiro_replaced_distributions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AvtaleGiro_replaced_distributions` (
  `Original_AvtaleGiro_KID` varchar(15) NOT NULL,
  `Replacement_KID` varchar(15) NOT NULL,
  `Timestamp` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Replacement_KID`),
  CONSTRAINT `FK_replacement_KID_to_Combining_table` FOREIGN KEY (`Replacement_KID`) REFERENCES `Combining_table` (`KID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Avtalegiro_agreements`
--

DROP TABLE IF EXISTS `Avtalegiro_agreements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Avtalegiro_agreements` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `KID` varchar(15) NOT NULL,
  `amount` int(11) NOT NULL,
  `payment_date` int(10) NOT NULL,
  `notice` tinyint(1) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '0',
  `last_updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created` datetime DEFAULT CURRENT_TIMESTAMP,
  `cancelled` date DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=435 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Avtalegiro_conversion_reminders`
--

DROP TABLE IF EXISTS `Avtalegiro_conversion_reminders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Avtalegiro_conversion_reminders` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `KID` varchar(45) NOT NULL,
  `NumReminders` int(11) NOT NULL DEFAULT '0',
  `LastReminderSent` datetime DEFAULT NULL,
  PRIMARY KEY (`ID`),
  UNIQUE KEY `KID_UNIQUE` (`KID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Avtalegiro_shipment`
--

DROP TABLE IF EXISTS `Avtalegiro_shipment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Avtalegiro_shipment` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `num_claims` int(11) DEFAULT NULL,
  `generated` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=263 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ChangePass`
--

DROP TABLE IF EXISTS `ChangePass`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ChangePass` (
  `userID` int(11) NOT NULL,
  `token` varchar(40) DEFAULT NULL,
  `expires` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`userID`),
  UNIQUE KEY `userID_UNIQUE` (`userID`),
  UNIQUE KEY `key_UNIQUE` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Combining_table`
--

DROP TABLE IF EXISTS `Combining_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Combining_table` (
  `Donor_ID` int(10) NOT NULL,
  `Distribution_ID` int(11) NOT NULL,
  `KID` varchar(15) NOT NULL,
  `timestamp_created` datetime DEFAULT CURRENT_TIMESTAMP,
  `Meta_owner_ID` int(11) NOT NULL DEFAULT '3',
  `Replaced_old_organizations` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`Donor_ID`,`Distribution_ID`,`KID`),
  KEY `fk_Combining_to_Donor_idx` (`Donor_ID`),
  KEY `fk_Combining_to_Distribution_idx` (`Distribution_ID`),
  KEY `KID` (`KID`),
  CONSTRAINT `fk_Combining_to_Distribution` FOREIGN KEY (`Distribution_ID`) REFERENCES `Distribution` (`ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_Combining_to_Donor` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors` (`ID`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Conversion_rates`
--

DROP TABLE IF EXISTS `Conversion_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Conversion_rates` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `Month` int(11) NOT NULL,
  `Year` int(11) NOT NULL,
  `PaymentMethod` varchar(45) NOT NULL,
  `Rate` double NOT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Data_owner`
--

DROP TABLE IF EXISTS `Data_owner`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Data_owner` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `owner` varchar(128) NOT NULL,
  `default` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`ID`),
  UNIQUE KEY `owner_UNIQUE` (`owner`),
  UNIQUE KEY `ID_UNIQUE` (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Distribution`
--

DROP TABLE IF EXISTS `Distribution`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Distribution` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `OrgID` int(11) NOT NULL,
  `percentage_share` decimal(15,12) NOT NULL COMMENT 'For donations registrered with this KID, the percentage share of the donation given to this organization.',
  PRIMARY KEY (`ID`),
  UNIQUE KEY `ID_UNIQUE` (`ID`),
  KEY `fk_Distribution_to_Organizations_idx` (`OrgID`),
  CONSTRAINT `fk_Distribution_to_Organizations` FOREIGN KEY (`OrgID`) REFERENCES `Organizations` (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=24712 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Donations`
--

DROP TABLE IF EXISTS `Donations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Donations` (
  `ID` int(11) NOT NULL AUTO_INCREMENT COMMENT 'Unik donasjonsID',
  `Donor_ID` int(11) NOT NULL COMMENT 'Foreign key til donor_id',
  `Payment_ID` int(11) NOT NULL COMMENT 'Foreign key til Payment_ID',
  `PaymentExternal_ID` varchar(32) DEFAULT NULL,
  `sum_confirmed` decimal(16,2) NOT NULL COMMENT 'Donert sum bekreftet fra betalingstjeneste',
  `timestamp_confirmed` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp/dato når donasjon er bekreftet fra betalingstjeneste',
  `transaction_cost` decimal(16,2) unsigned DEFAULT NULL COMMENT 'beregnet transaction cost basert på Payment_ID (oppslag på kostnad) og sum confirmed',
  `KID_fordeling` varchar(15) NOT NULL COMMENT 'registrert KID fra betalingstjeneste,\\noppslag i donations_distribution for Donor_ID',
  `inserted` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `Meta_owner_ID` int(11) NOT NULL DEFAULT '3',
  PRIMARY KEY (`ID`),
  UNIQUE KEY `ID_UNIQUE` (`ID`),
  UNIQUE KEY `PaymentExternal_ID_UNIQUE` (`PaymentExternal_ID`),
  KEY `fk_Donations_Donors_KID_idx` (`Donor_ID`),
  KEY `fk_Donations_to_Donors_idx` (`Payment_ID`),
  KEY `Timestamp` (`timestamp_confirmed`),
  KEY `KidAndTimestamp` (`KID_fordeling`,`timestamp_confirmed`),
  CONSTRAINT `fk_Donations_to_Donors_ID` FOREIGN KEY (`Donor_ID`) REFERENCES `Donors` (`ID`),
  CONSTRAINT `fk_Donations_to_Payment` FOREIGN KEY (`Payment_ID`) REFERENCES `Payment` (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=22126 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER `Donations_BEFORE_INSERT` BEFORE INSERT ON `Donations` FOR EACH ROW BEGIN
    DECLARE msg VARCHAR(255);
	IF ((SELECT count(*) as duplicates FROM Donations WHERE payment_ID = NEW.payment_ID AND PaymentExternal_ID = NEW.PaymentExternal_ID) > 0) THEN
		set msg = "Duplicate value found for payment id and payment external id";
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
    END IF;
	SET NEW.transaction_cost = ((SELECT percentage_fee FROM Payment where ID = NEW.payment_ID LIMIT 1)/100)*NEW.sum_confirmed + (SELECT flat_fee FROM Payment where ID = NEW.payment_ID LIMIT 1);
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER `Donations_AFTER_INSERT` AFTER INSERT ON `Donations` FOR EACH ROW BEGIN
	UPDATE Donors SET Meta_owner_ID = NEW.Meta_owner_ID WHERE ID = NEW.Donor_ID;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `Donors`
--
DROP TABLE IF EXISTS `TaxUnit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `TaxUnit` (
  `ID` int(11) NOT NULL AUTO_INCREMENT COMMENT 'Unik ID',
  `email` tinytext NOT NULL COMMENT 'epost registrert i donasjonsskjema,\\ntrigger generering av ny donor hvis den ikke eksisterer fra før',
  `ssn` varchar(11) DEFAULT NULL,
  `full_name` tinytext NOT NULL,
  `date_registered` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'The date the donor first registrered',
  PRIMARY KEY (`ID`),
  UNIQUE KEY `KID_UNIQUE` (`ID`),
  FULLTEXT KEY `search` (`email`,`full_name`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;


DROP TABLE IF EXISTS `Donors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Donors` (
  `ID` int(11) NOT NULL AUTO_INCREMENT COMMENT 'Unik kundeID',
  `email` tinytext NOT NULL COMMENT 'epost registrert i donasjonsskjema,\\ntrigger generering av ny donor hvis den ikke eksisterer fra før',
  `full_name` tinytext NOT NULL,
  `date_registered` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'The date the donor first registrered',
  `password_hash` varchar(64) DEFAULT NULL,
  `password_salt` varchar(32) DEFAULT NULL,
  `ssn` varchar(11) DEFAULT NULL,
  `Meta_owner_ID` int(11) NOT NULL DEFAULT '3',
  `newsletter` tinyint(1) DEFAULT NULL,
  `trash` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`ID`),
  UNIQUE KEY `KID_UNIQUE` (`ID`),
  FULLTEXT KEY `search` (`email`,`full_name`)
) ENGINE=InnoDB AUTO_INCREMENT=8641 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `FB_payment_ID`
--

DROP TABLE IF EXISTS `FB_payment_ID`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `FB_payment_ID` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `donorID` int(11) NOT NULL,
  `paymentID` varchar(45) NOT NULL,
  `inserted` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`),
  KEY `donorID_idx` (`donorID`),
  CONSTRAINT `donorID` FOREIGN KEY (`donorID`) REFERENCES `Donors` (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=369 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Import_logs`
--

DROP TABLE IF EXISTS `Import_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Import_logs` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(45) DEFAULT NULL,
  `result` json DEFAULT NULL,
  `timestamp` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=1051 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Organizations`
--

DROP TABLE IF EXISTS `Organizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Organizations` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(45) NOT NULL,
  `abbriv` varchar(10) NOT NULL,
  `short_desc` varchar(255) DEFAULT NULL,
  `long_desc` varchar(45) NOT NULL,
  `info_url` varchar(156) DEFAULT NULL,
  `std_percentage_share` tinyint(4) DEFAULT '0' COMMENT 'The percentage share of the standard distribution, determined by Effekt. Updated about twice a year',
  `is_active` tinyint(4) DEFAULT NULL,
  `ordering` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`ID`),
  UNIQUE KEY `ID_UNIQUE` (`ID`),
  UNIQUE KEY `full_name_UNIQUE` (`full_name`),
  UNIQUE KEY `abbriv_UNIQUE` (`abbriv`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Payment`
--

DROP TABLE IF EXISTS `Payment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Payment` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `payment_name` varchar(45) NOT NULL,
  `abbriv` varchar(45) NOT NULL,
  `short_desc` varchar(45) DEFAULT NULL,
  `flat_fee` decimal(5,2) DEFAULT NULL COMMENT 'Part of the transaction fee that is a constant number',
  `percentage_fee` decimal(5,2) DEFAULT NULL COMMENT 'Part of the transaction fee that is a share of the transaction sum',
  `lastUpdated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'New ID and Payment_name increment with updated fee information',
  PRIMARY KEY (`ID`),
  UNIQUE KEY `payment_name_UNIQUE` (`payment_name`),
  UNIQUE KEY `abbriv_UNIQUE` (`abbriv`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Payment_intent`
--

DROP TABLE IF EXISTS `Payment_intent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Payment_intent` (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `Payment_method` varchar(45) DEFAULT NULL,
  `KID_fordeling` varchar(20) DEFAULT NULL,
  `timetamp` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `Id_UNIQUE` (`Id`),
  KEY `KID_fordeling_idx` (`KID_fordeling`)
) ENGINE=InnoDB AUTO_INCREMENT=3469 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Paypal_historic_distributions`
--

DROP TABLE IF EXISTS `Paypal_historic_distributions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Paypal_historic_distributions` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `Donor_ID` int(11) NOT NULL,
  `KID` int(11) NOT NULL,
  `ReferenceTransactionNumber` varchar(32) NOT NULL,
  PRIMARY KEY (`ID`),
  UNIQUE KEY `Donor_ID_UNIQUE` (`Donor_ID`),
  UNIQUE KEY `KID_UNIQUE` (`KID`),
  UNIQUE KEY `ReferenceTransactionNumber_UNIQUE` (`ReferenceTransactionNumber`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `Recurring_no_kid_bank_donors`
--

DROP TABLE IF EXISTS `Recurring_no_kid_bank_donors`;
/*!50001 DROP VIEW IF EXISTS `Recurring_no_kid_bank_donors`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `Recurring_no_kid_bank_donors` AS SELECT 
 1 AS `DonorID`,
 1 AS `KID`,
 1 AS `NumDonations`,
 1 AS `DonorName`,
 1 AS `LatestSum`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `Referral_records`
--

DROP TABLE IF EXISTS `Referral_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Referral_records` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `ReferralID` int(11) NOT NULL,
  `UserID` int(11) NOT NULL,
  `Registered` datetime DEFAULT CURRENT_TIMESTAMP,
  `other_comment` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`ID`),
  KEY `referral_type_idx` (`ReferralID`),
  CONSTRAINT `referral_type` FOREIGN KEY (`ReferralID`) REFERENCES `Referral_types` (`ID`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2605 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Referral_types`
--

DROP TABLE IF EXISTS `Referral_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Referral_types` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(256) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `ordering` int(11) DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Vipps_agreement_charges`
--

DROP TABLE IF EXISTS `Vipps_agreement_charges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Vipps_agreement_charges` (
  `chargeID` varchar(11) NOT NULL,
  `agreementID` varchar(20) NOT NULL,
  `amountNOK` int(20) unsigned NOT NULL,
  `KID` varchar(15) NOT NULL,
  `dueDate` varchar(100) NOT NULL,
  `timestamp_created` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `status` varchar(30) NOT NULL,
  `type` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`chargeID`,`agreementID`),
  UNIQUE KEY `chargeID_UNIQUE` (`chargeID`),
  KEY `FK_ID_agreementID_idx` (`agreementID`),
  CONSTRAINT `FK_agreementID_ID` FOREIGN KEY (`agreementID`) REFERENCES `Vipps_agreements` (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Vipps_agreements`
--

DROP TABLE IF EXISTS `Vipps_agreements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Vipps_agreements` (
  `ID` varchar(20) NOT NULL,
  `donorID` int(11) NOT NULL,
  `KID` varchar(15) NOT NULL,
  `amount` int(20) NOT NULL,
  `status` varchar(30) DEFAULT NULL,
  `monthly_charge_day` int(2) NOT NULL,
  `paused_until_date` varchar(255) DEFAULT NULL,
  `agreement_url_code` varchar(100) NOT NULL,
  `timestamp_created` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `force_charge_date` varchar(100) DEFAULT NULL,
  `cancellation_date` date DEFAULT NULL,
  PRIMARY KEY (`ID`),
  KEY `KID_idx` (`KID`),
  KEY `donorID_idx` (`donorID`),
  CONSTRAINT `FK_donorID` FOREIGN KEY (`donorID`) REFERENCES `Donors` (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Vipps_matching_rules`
--

DROP TABLE IF EXISTS `Vipps_matching_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Vipps_matching_rules` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `SalesLocation` varchar(45) DEFAULT NULL,
  `Message` varchar(45) DEFAULT NULL,
  `PeriodFrom` date NOT NULL,
  `PeriodTo` date NOT NULL,
  `ResolveKID` int(11) NOT NULL,
  `precedence` int(11) DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Vipps_order_transaction_statuses`
--

DROP TABLE IF EXISTS `Vipps_order_transaction_statuses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Vipps_order_transaction_statuses` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `orderID` varchar(256) NOT NULL,
  `transactionID` varchar(45) DEFAULT NULL,
  `amount` int(11) NOT NULL,
  `operation` varchar(45) NOT NULL,
  `timestamp` datetime NOT NULL,
  `success` varchar(45) NOT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=1617 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Vipps_orders`
--

DROP TABLE IF EXISTS `Vipps_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Vipps_orders` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `orderID` varchar(256) NOT NULL,
  `donorID` int(11) NOT NULL,
  `donationID` int(11) DEFAULT NULL,
  `KID` varchar(15) NOT NULL,
  `token` varchar(256) DEFAULT NULL,
  `registered` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`),
  KEY `ID_order_id` (`ID`,`orderID`),
  KEY `Donor_ID_idx` (`donorID`),
  KEY `DonationID` (`donationID`,`orderID`)
) ENGINE=InnoDB AUTO_INCREMENT=1205 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Vipps_tokens`
--

DROP TABLE IF EXISTS `Vipps_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Vipps_tokens` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `expires` datetime NOT NULL,
  `type` varchar(45) NOT NULL,
  `token` text NOT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=476 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'EffektDonasjonDB'
--

--
-- Dumping routines for database 'EffektDonasjonDB'
--
/*!50003 DROP FUNCTION IF EXISTS `check_all_donations_sumto_100` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`%`@`%` FUNCTION `check_all_donations_sumto_100`() RETURNS tinyint(1)
BEGIN
	if (COUNT(get_sum_of_donation_KIDs_not_totaling_100() > 0)) then
            return 0;
	else
		return 1;
	end if;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `get_conversion_rate` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`%`@`%` FUNCTION `get_conversion_rate`(treshold TIME, `from` DATE, `to` DATE, method INT) RETURNS float
BEGIN
	-- For calculation the rates
	DECLARE hit DOUBLE DEFAULT 0;
    DECLARE miss DOUBLE DEFAULT 0;
    
    -- For use in loop
    DECLARE match_id INT;
    DECLARE match_delta TIMESTAMP;
    
        
	DECLARE intent_id INT;
    
	DECLARE done BOOLEAN DEFAULT 0;
    
	-- Cursor related stuff for looping over payment intents
	DECLARE intents CURSOR
		FOR SELECT ID FROM Payment_intent
			WHERE `timetamp` > `from` AND `timetamp` < `to` AND Payment_method = method;
    DECLARE CONTINUE HANDLER FOR SQLSTATE '02000' SET done=1;
    
	-- Turn off safe mode
    SET SQL_SAFE_UPDATES=0;
    
    DROP TEMPORARY TABLE IF EXISTS `temp_donations`;
    CREATE TEMPORARY TABLE `temp_donations` SELECT * FROM Donations;
    
    -- Loop over all payment intents
    OPEN intents;
    
    REPEAT
		FETCH intents INTO intent_id;
        
        #Fetch matching donations to donation intent
        SELECT 
			Donations.ID, timediff(Donations.timestamp_confirmed, Payment_intent.timetamp) as t_delta FROM EffektDonasjonDB.Payment_intent
			LEFT JOIN `temp_donations` AS Donations
				ON (
					Donations.KID_fordeling = Payment_intent.KID_fordeling
					# - 10000 because vipps is mistakenly registered one hour wrong (timezone issues)
					AND timediff(Donations.timestamp_confirmed, Payment_intent.timetamp) >= -10000
					AND Donations.Payment_ID = Payment_intent.Payment_method
					)
			WHERE Payment_intent.ID = intent_id
			
			ORDER BY t_delta ASC
			
			LIMIT 1
            
            INTO
				match_id, match_delta;
                
		
        IF (match_id IS NOT NULL AND match_delta < treshold) THEN
			BEGIN
				SET hit = hit + 1;
                DELETE FROM `temp_donations` WHERE ID = match_id;
            END;
		ELSE
			BEGIN
				SET miss = miss + 1;
            END;
		END IF;
	UNTIL done END REPEAT;
    
    DROP TEMPORARY TABLE IF EXISTS `temp_donations`;
    
    -- Turn on safe mode
    SET SQL_SAFE_UPDATES=1;
    
    RETURN hit/(miss+hit);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `get_overall_conversion_rate` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`%`@`%` FUNCTION `get_overall_conversion_rate`(treshold TIME, `from` DATE, `to` DATE) RETURNS float
BEGIN
	-- For calculation the rates
	DECLARE hit DOUBLE DEFAULT 0;
    DECLARE miss DOUBLE DEFAULT 0;
    
    -- For use in loop
    DECLARE match_id INT;
    DECLARE match_delta TIMESTAMP;
    
        
	DECLARE intent_id INT;
    
	DECLARE done BOOLEAN DEFAULT 0;
    
	-- Cursor related stuff for looping over payment intents
	DECLARE intents CURSOR
		FOR SELECT ID FROM Payment_intent
			WHERE `timetamp` > `from` AND `timetamp` < `to`;
    DECLARE CONTINUE HANDLER FOR SQLSTATE '02000' SET done=1;
    
	-- Turn off safe mode
    SET SQL_SAFE_UPDATES=0;
    
    DROP TEMPORARY TABLE IF EXISTS `temp_donations`;
    CREATE TEMPORARY TABLE `temp_donations` SELECT * FROM Donations;
    
    -- Loop over all payment intents
    OPEN intents;
    
    REPEAT
		FETCH intents INTO intent_id;
        
        #Fetch matching donations to donation intent
        SELECT 
			Donations.ID, timediff(Donations.timestamp_confirmed, Payment_intent.timetamp) as t_delta FROM EffektDonasjonDB.Payment_intent
			LEFT JOIN `temp_donations` AS Donations
				ON (
					Donations.KID_fordeling = Payment_intent.KID_fordeling
					# - 10000 because vipps is mistakenly registered one hour wrong (timezone issues)
					AND timediff(Donations.timestamp_confirmed, Payment_intent.timetamp) >= -10000
					AND Donations.Payment_ID = Payment_intent.Payment_method
					)
			WHERE Payment_intent.ID = intent_id
			
			ORDER BY t_delta ASC
			
			LIMIT 1
            
            INTO
				match_id, match_delta;
                
		
        IF (match_id IS NOT NULL AND match_delta < treshold) THEN
			BEGIN
				SET hit = hit + 1;
                DELETE FROM `temp_donations` WHERE ID = match_id;
            END;
		ELSE
			BEGIN
				SET miss = miss + 1;
            END;
		END IF;
	UNTIL done END REPEAT;
    
    DROP TEMPORARY TABLE IF EXISTS `temp_donations`;
    
    -- Turn on safe mode
    SET SQL_SAFE_UPDATES=1;
    
    RETURN hit/(miss+hit);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `intent_id` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`%`@`%` FUNCTION `intent_id`(treshold TIMESTAMP) RETURNS float
BEGIN
	-- For calculation the rates
	DECLARE hit DOUBLE DEFAULT 0;
    DECLARE miss DOUBLE DEFAULT 0;
    
    -- For use in loop
    DECLARE match_id INT;
    DECLARE match_delta TIMESTAMP;
    
        
	DECLARE intent_id INT;
    
	DECLARE done BOOLEAN DEFAULT 0;
    
	-- Cursor related stuff for looping over payment intents
	DECLARE intents CURSOR
		FOR SELECT ID FROM Payment_intent;
    DECLARE CONTINUE HANDLER FOR SQLSTATE '02000' SET done=1;
    

    
    DROP TEMPORARY TABLE IF EXISTS `temp_donations`;
    CREATE TEMPORARY TABLE `temp_donations` SELECT * FROM Donations;
    

    
    -- Loop over all payment intents
    OPEN intents;
    
    REPEAT
		FETCH intents INTO intent_id;
        
        #Fetch matching donations to donation intent
        SELECT 
			Donations.ID, timediff(Donations.timestamp_confirmed, Payment_intent.timetamp) as t_delta FROM EffektDonasjonDB.Payment_intent
			LEFT JOIN `temp_donations` AS Donations
				ON (
					Donations.KID_fordeling = Payment_intent.KID_fordeling
					# - 10000 because vipps is mistakenly registered one hour wrong (timezone issues)
					AND timediff(Donations.timestamp_confirmed, Payment_intent.timetamp) >= -10000
					AND Donations.Payment_ID = Payment_intent.Payment_method
					)
			WHERE Payment_intent.ID = intent_id
			
			ORDER BY t_delta ASC
			
			LIMIT 1
            
            INTO
				match_id, match_delta;
                
		
        IF (match_id IS NOT NULL AND match_delta < treshold) THEN
			BEGIN
				SET hit = hit + 1;
                DELETE FROM `temp_donations` WHERE ID = match_id;
            END;
		ELSE
			BEGIN
				SET miss = miss + 1;
            END;
		END IF;
	UNTIL done END REPEAT;
    
    DROP TEMPORARY TABLE IF EXISTS `temp_donations`;
    RETURN hit/(miss+hit);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `add_donation` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `add_donation`(
	sum_input INT, 
	KID_input INT,
    payment_ID_input INT
)
BEGIN
	insert into EffektDonasjonDB.Donations
	(sum_confirmed, KID_fordeling, Donor_ID, Payment_ID)
	VALUES(sum_input, KID_input, (select Donor_ID from Combining_table where KID = KID_input LIMIT 1), payment_ID_input)
;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `get_aggregate_donations_by_period` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `get_aggregate_donations_by_period`(start_date date,
    end_date date
)
BEGIN
# Må kjøres en eller annen plass i koden, initielt
#SET sql_mode = "STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION";


SELECT Organizations.ID as id, full_name as orgName, sum(sum_confirmed*percentage_share*0.01) as sum 
	FROM( 
	Donations INNER JOIN Combining_table 
			ON Donations.KID_fordeling = Combining_table.KID
		INNER JOIN Distribution
			ON Combining_table.Distribution_ID = Distribution.ID
		INNER JOIN Organizations
			ON Distribution.OrgID = Organizations.ID
) WHERE date(Donations.timestamp_confirmed) >= date(start_date) and date(Donations.timestamp_confirmed) <= date(end_date)
GROUP BY ID;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `get_avtalegiro_agreement_expected_donations_by_date` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `get_avtalegiro_agreement_expected_donations_by_date`(IN exp_year INT, IN exp_month INT, IN exp_date INT)
BEGIN
	SELECT * FROM Avtalegiro_agreements
	WHERE 
    payment_date = exp_date AND
    # Created six days before payment date
    created < DATE_SUB(DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)), interval 6 day) AND
    (
		# Is active
		active = 1 OR
        # Or cancelled after payment date
        cancelled > DATE(CONCAT_WS('-', exp_year, exp_month, exp_date))
    );
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `get_avtalegiro_agreement_missing_donations_by_date` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `get_avtalegiro_agreement_missing_donations_by_date`(IN exp_year INT, IN exp_month INT, IN exp_date INT)
BEGIN
	SELECT 
		AG.ID,
        Donors.email,
        Donors.full_name,
        ROUND(AG.amount / 100) as amount,
        AG.KID,
        AG.payment_date,
        AG.created,
        AG.last_updated,
        AG.cancelled,
        AG.`active`
    
    FROM Avtalegiro_agreements as AG
		
	LEFT JOIN (
		SELECT * FROM Donations WHERE
		Payment_ID = 7
        AND timestamp_confirmed >= DATE(CONCAT_WS('-', exp_year, exp_month, exp_date))
        AND timestamp_confirmed < DATE_ADD(DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)), interval 1 month)
    ) as D 
		ON AG.KID = D.KID_fordeling
        
	INNER JOIN Donors
		ON Donors.ID = (SELECT Donor_ID from Combining_table WHERE KID = AG.KID LIMIT 1)
    
	WHERE 
		AG.payment_date = exp_date 
		# Created six days before payment date
		AND AG.created < DATE_SUB(DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)), interval 6 day) 
		AND (
			# Is active
			AG.active = 1 
			# Or cancelled after payment date
			OR AG.cancelled > DATE_SUB(DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)), interval 6 day) 
		)
        AND D.sum_confirmed IS NULL;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `get_avtalegiro_agreement_recieved_donations_by_date` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `get_avtalegiro_agreement_recieved_donations_by_date`(IN exp_year INT, IN exp_month INT, IN exp_date INT)
BEGIN
	SELECT 
		Donations.ID,
        Donors.email,
        Donors.full_name,
        Donations.sum_confirmed,
        Donations.transaction_cost,
        Donations.KID_fordeling,
        Donations.timestamp_confirmed
        
        FROM Donations 
            
		INNER JOIN Donors
			ON (SELECT Donor_ID FROM Combining_table WHERE Combining_table.KID = Donations.KID_fordeling GROUP BY Donor_ID) = Donors.ID
            
		WHERE KID_fordeling IN (
			SELECT KID FROM Avtalegiro_agreements
			WHERE 
			payment_date = exp_date AND
			# Created six days before payment date
			created < DATE_SUB(DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)), interval 6 day) AND
			(
				# Is active
				active = 1 OR
				# Or cancelled after payment date
				cancelled > DATE(CONCAT_WS('-', exp_year, exp_month, exp_date))
			)
        )
        AND Payment_ID = 7
        AND timestamp_confirmed >= DATE(CONCAT_WS('-', exp_year, exp_month, exp_date))
        AND timestamp_confirmed < DATE_ADD(DATE(CONCAT_WS('-', exp_year, exp_month, exp_date)), interval 1 month);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `get_avtalegiro_missing_since` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `get_avtalegiro_missing_since`(IN exp_year INT, IN exp_month INT, IN exp_date INT)
BEGIN
	SELECT 
		AG.ID,
        Donors.email,
        Donors.full_name,
        ROUND(AG.amount / 100) as amount,
        AG.KID,
        AG.payment_date,
        AG.created,
        AG.last_updated,
        AG.cancelled,
        AG.`active`
    
    FROM Avtalegiro_agreements as AG
		
	LEFT JOIN (
		SELECT * FROM Donations WHERE
		Payment_ID = 7
        AND timestamp_confirmed >= DATE(CONCAT_WS('-', exp_year, exp_month, exp_date))
    ) as D 
		ON AG.KID = D.KID_fordeling
        
	INNER JOIN Donors
		ON Donors.ID = (SELECT Donor_ID from Combining_table WHERE KID = AG.KID LIMIT 1)
    
	WHERE 
		AG.payment_date >= exp_date 
        AND AG.payment_date <= DAY(now())
		# Created six days before payment date
		AND AG.created < DATE_SUB(DATE(CONCAT_WS('-', exp_year, exp_month, AG.payment_date)), interval 6 day) 
		AND (
			# Is active
			AG.active = 1 
			# Or cancelled after payment date
			OR AG.cancelled > DATE_SUB(DATE(CONCAT_WS('-', exp_year, exp_month, AG.payment_date)), interval 6 day) 
		)
        AND D.sum_confirmed IS NULL;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `get_avtalegiro_validation` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `get_avtalegiro_validation`()
BEGIN
	SELECT 
	payment_date as `date`,
	ROUND(SUM(amount) / 100) as expected,
    (
		SELECT IFNULL(ROUND(SUM(sum_confirmed)), 0)
        FROM Donations 
        WHERE KID_Fordeling IN (
			SELECT KID 
            FROM Avtalegiro_agreements 
            WHERE payment_date = AG.payment_date
		)
        AND timestamp_confirmed >= if(day(now()) - payment_date < 0, 
			DATE(CONCAT_WS('-', YEAR((DATE_SUB(now(), interval 1 month))), MONTH((DATE_SUB(now(), interval 1 month))), AG.payment_date)),
			DATE(CONCAT_WS('-', YEAR(now()), MONTH(now()), AG.payment_date))
        )
        AND Payment_ID = 7
	) as actual,
    (
		SELECT IFNULL(ROUND(SUM(sum_confirmed)), 0)
        FROM Donations 
        WHERE KID_Fordeling IN (
			SELECT KID 
            FROM Avtalegiro_agreements 
            WHERE payment_date = AG.payment_date
		)
        AND timestamp_confirmed >= if(day(now()) - payment_date < 0, 
			DATE(CONCAT_WS('-', YEAR((DATE_SUB(now(), interval 1 month))), MONTH((DATE_SUB(now(), interval 1 month))), AG.payment_date)),
			DATE(CONCAT_WS('-', YEAR(now()), MONTH(now()), AG.payment_date))
        )
        AND Payment_ID = 7
	) - ROUND(SUM(amount) / 100) as diff
    
	FROM Avtalegiro_agreements as AG
        
	WHERE
		((Cancelled IS NULL AND active = 1) OR Cancelled > DATE_SUB(if(day(now()) - payment_date < 0, 
				DATE(CONCAT_WS('-', YEAR((DATE_SUB(now(), interval 1 month))), MONTH((DATE_SUB(now(), interval 1 month))), payment_date)),
				DATE(CONCAT_WS('-', YEAR(now()), MONTH(now()), payment_date))
			), INTERVAL 6 DAY))
        AND Created <= DATE_SUB(if(day(now()) - payment_date < 0, 
				DATE(CONCAT_WS('-', YEAR((DATE_SUB(now(), interval 1 month))), MONTH((DATE_SUB(now(), interval 1 month))), payment_date)),
				DATE(CONCAT_WS('-', YEAR(now()), MONTH(now()), payment_date))
			), INTERVAL 6 DAY)

	GROUP BY payment_date
    
    ORDER BY if(day(now()) - payment_date < 0, ABS(payment_date - 28) + day(now()), day(now()) - payment_date) ASC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `get_KID` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `get_KID`()
BEGIN
	SELECT * FROM Distribution as D 
    INNER JOIN Combining_table as C
    ON D.ID = C.Distribution_ID;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `get_recurring_no_kid_bank_donors` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `get_recurring_no_kid_bank_donors`()
BEGIN
	SELECT Donors.ID, Donations.KID_fordeling, count(*) as num_donations, Donors.full_name
		FROM EffektDonasjonDB.Donations as Donations
			INNER JOIN EffektDonasjonDB.Donors as Donors
				ON Donor_ID = Donors.ID
		WHERE Donations.Payment_ID = 5
		GROUP BY CONCAT(Donations.Donor_ID, "-", Donations.KID_fordeling), Donors.full_name, Donors.ID, Donations.KID_fordeling
		HAVING num_donations > 2
		ORDER BY num_donations DESC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `get_sum_of_donation_KIDs_not_totaling_100` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `get_sum_of_donation_KIDs_not_totaling_100`()
BEGIN
	SELECT KID, SUM(percentage_share) as summed FROM EffektDonasjonDB.Distribution as D 
		INNER JOIN Combining_table as C 
		ON 
			D.ID = C.Distribution_ID
		GROUP BY KID
		HAVING summed <> 100.000;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Final view structure for view `Recurring_no_kid_bank_donors`
--

/*!50001 DROP VIEW IF EXISTS `Recurring_no_kid_bank_donors`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `Recurring_no_kid_bank_donors` AS select `Donors`.`ID` AS `DonorID`,`Donations`.`KID_fordeling` AS `KID`,count(0) AS `NumDonations`,`Donors`.`full_name` AS `DonorName`,(select `SubDonations`.`sum_confirmed` from `Donations` `SubDonations` where ((`SubDonations`.`KID_fordeling` = `Donations`.`KID_fordeling`) and (`SubDonations`.`Payment_ID` = 5)) order by `SubDonations`.`timestamp_confirmed` desc limit 1) AS `LatestSum` from (`Donations` join `Donors` on((`Donations`.`Donor_ID` = `Donors`.`ID`))) where (`Donations`.`Payment_ID` = 5) group by concat(`Donations`.`Donor_ID`,'-',`Donations`.`KID_fordeling`),`Donors`.`full_name`,`Donors`.`ID`,`Donations`.`KID_fordeling` having (`NumDonations` > 2) order by `NumDonations` desc */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2022-05-06  6:13:12
