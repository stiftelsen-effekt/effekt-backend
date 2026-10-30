-- CreateTable
CREATE TABLE `Mailersend_survey_responses` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `surveyID` INTEGER NOT NULL,
    `questionID` INTEGER NOT NULL,
    `DonorID` INTEGER NOT NULL,
    `answer` VARCHAR(191) NOT NULL,
    `answerID` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Mailersend_survey_responses` ADD CONSTRAINT `fk_Mailersend_survey_responses_to_Donors_idx` FOREIGN KEY (`DonorID`) REFERENCES `Donors`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;
