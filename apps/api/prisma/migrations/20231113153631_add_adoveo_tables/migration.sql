-- CreateTable
CREATE TABLE `Adoveo_fundraiser_transactions` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `KID` VARCHAR(16) NOT NULL,
    `Sum` DECIMAL(15, 2) NOT NULL,
    `Timestamp` DATETIME(0) NOT NULL,
    `Sender_email` VARCHAR(45) NOT NULL,
    `Sender_phone` VARCHAR(15) NOT NULL,
    `Status` VARCHAR(10) NOT NULL,
    `Location` VARCHAR(45) NOT NULL,
    `Hash` VARCHAR(32) NOT NULL,

    UNIQUE INDEX `Hash_UNIQUE`(`Hash`),
    INDEX `KID_idx`(`KID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Adoveo_giftcard_transactions` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `KID` VARCHAR(16) NOT NULL,
    `Sum` DECIMAL(15, 2) NOT NULL,
    `Timestamp` DATETIME(0) NOT NULL,
    `Sender_donor_ID` INTEGER NOT NULL,
    `Sender_name` VARCHAR(45) NOT NULL,
    `Sender_email` VARCHAR(45) NOT NULL,
    `Sender_phone` VARCHAR(15) NOT NULL,
    `Receiver_name` VARCHAR(45) NOT NULL,
    `Receiver_phone` VARCHAR(15) NOT NULL,
    `Message` VARCHAR(45) NOT NULL,
    `Status` VARCHAR(10) NOT NULL,
    `Location` VARCHAR(45) NOT NULL,
    `CouponSend` VARCHAR(45) NOT NULL,

    INDEX `KID_idx`(`KID`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Adoveo_giftcard_transactions` ADD CONSTRAINT `FK_Adoveo_giftcard_transactions_donorid` FOREIGN KEY (`Sender_donor_ID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;
