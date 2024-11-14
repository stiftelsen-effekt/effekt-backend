-- There is some drift in character sets and collation in the production DB that we need to fix
CREATE PROCEDURE convert_to_utf8mb4()
BEGIN
    -- Declare variables for cursor
    DECLARE done BOOLEAN DEFAULT FALSE;
    DECLARE v_table_schema VARCHAR(64);
    DECLARE v_table_name VARCHAR(64);
    DECLARE v_column_name VARCHAR(64);
    DECLARE v_current_charset VARCHAR(32);
    DECLARE v_current_collation VARCHAR(32);
    DECLARE v_data_type VARCHAR(64);
    
    -- Variables for error handling
    DECLARE v_error_message TEXT;
    DECLARE v_alter_statement TEXT;
    
    -- Declare cursor for columns that need conversion
    DECLARE column_cursor CURSOR FOR
        SELECT 
            TABLE_SCHEMA,
            TABLE_NAME,
            COLUMN_NAME,
            CHARACTER_SET_NAME,
            COLLATION_NAME,
            DATA_TYPE
        FROM 
            INFORMATION_SCHEMA.COLUMNS
        WHERE 
            TABLE_SCHEMA = DATABASE()
            AND CHARACTER_SET_NAME IS NOT NULL
            AND (
                CHARACTER_SET_NAME != 'utf8mb4'
                OR COLLATION_NAME != 'utf8mb4_unicode_ci'
            );
    
    -- Declare handler for cursor
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- Declare handler for SQL exceptions
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION 
    BEGIN
        GET DIAGNOSTICS CONDITION 1 
            v_error_message = MESSAGE_TEXT;
        
        -- Log the error (you can modify this to use your preferred logging method)
        INSERT INTO migration_log (
            table_name, 
            column_name, 
            status, 
            error_message, 
            attempted_statement
        ) 
        VALUES (
            v_table_name, 
            v_column_name, 
            'ERROR', 
            v_error_message, 
            v_alter_statement
        );
    END;
    
    -- Create log table if it doesn't exist
    CREATE TABLE IF NOT EXISTS migration_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        execution_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        table_name VARCHAR(64),
        column_name VARCHAR(64),
        status VARCHAR(10),
        error_message TEXT,
        attempted_statement TEXT
    );
    
    -- Open cursor
    OPEN column_cursor;
    
    -- Start conversion loop
    conversion_loop: LOOP
        FETCH column_cursor INTO 
            v_table_schema, 
            v_table_name, 
            v_column_name, 
            v_current_charset, 
            v_current_collation,
            v_data_type;
        
        IF done THEN
            LEAVE conversion_loop;
        END IF;
        
        -- Construct ALTER TABLE statement based on data type
        SET v_alter_statement = CONCAT(
            'ALTER TABLE `', v_table_name, '` ',
            'MODIFY COLUMN `', v_column_name, '` ',
            v_data_type,
            -- Add character length for string types
            CASE 
                WHEN v_data_type IN ('VARCHAR', 'CHAR') THEN
                    CONCAT('(',
                        (SELECT CHARACTER_MAXIMUM_LENGTH 
                         FROM INFORMATION_SCHEMA.COLUMNS 
                         WHERE TABLE_SCHEMA = v_table_schema 
                         AND TABLE_NAME = v_table_name 
                         AND COLUMN_NAME = v_column_name),
                    ')')
                WHEN v_data_type = 'TEXT' THEN ''
                ELSE ''
            END,
            ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
            -- Preserve nullable status
            CASE 
                WHEN (SELECT IS_NULLABLE 
                      FROM INFORMATION_SCHEMA.COLUMNS 
                      WHERE TABLE_SCHEMA = v_table_schema 
                      AND TABLE_NAME = v_table_name 
                      AND COLUMN_NAME = v_column_name) = 'YES' 
                THEN ' NULL'
                ELSE ' NOT NULL'
            END
        );
        
        BEGIN
            -- Execute the ALTER TABLE statement
            SET @alter_sql = v_alter_statement;
            PREPARE stmt FROM @alter_sql;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
            
            -- Log successful conversion
            INSERT INTO migration_log (
                table_name, 
                column_name, 
                status, 
                attempted_statement
            ) 
            VALUES (
                v_table_name, 
                v_column_name, 
                'SUCCESS', 
                v_alter_statement
            );
        END;
    END LOOP;
    
    -- Close cursor
    CLOSE column_cursor;
    
    -- Output summary
    SELECT 
        status,
        COUNT(*) as count
    FROM 
        migration_log
    WHERE 
        execution_time >= (
            SELECT MAX(execution_time) 
            FROM migration_log
            WHERE status = 'SUCCESS'
        )
    GROUP BY 
        status;
END;

CALL convert_to_utf8mb4();
DROP PROCEDURE convert_to_utf8mb4;

-- Now for the cases where we need to remove some foreign keys before we can change the character set
DROP FOREIGN KEY `FK_agreementID_ID` ON `Vipps_agreement_charges`;

-- Update the character set and collation for the columns
ALTER TABLE `EffektDonasjonDB`.`Vipps_agreement_charges` 
    CHANGE COLUMN `agreementID` `agreementID` VARCHAR(20) CHARACTER SET 'utf8mb4' COLLATE 'utf8mb4_unicode_ci' NOT NULL;

ALTER TABLE `EffektDonasjonDB`.`Vipps_agreements` 
    CHANGE COLUMN `ID` `ID` VARCHAR(20) CHARACTER SET 'utf8mb4' COLLATE 'utf8mb4_unicode_ci' NOT NULL ;

-- Add the foreign key back
ALTER TABLE `Vipps_agreement_charges` 
    ADD CONSTRAINT `FK_agreementID_ID` FOREIGN KEY (`agreementID`) REFERENCES `Vipps_agreements`(`ID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop search index on Donors table
ALTER TABLE `EffektDonasjonDB`.`Donors` DROP INDEX `search`;

-- Update the character set and collation for the columns
ALTER TABLE `EffektDonasjonDB`.`Donors` 
    CHANGE COLUMN `email` `email` TINYTEXT CHARACTER SET 'utf8mb4' COLLATE 'utf8mb4_unicode_ci' NOT NULL COMMENT 'epost registrert i donasjonsskjema,\\\\ntrigger generering av ny donor hvis den ikke eksisterer fra før' ,
    CHANGE COLUMN `full_name` `full_name` TINYTEXT CHARACTER SET 'utf8mb4' COLLATE 'utf8mb4_unicode_ci' NULL DEFAULT NULL ;

-- Add the search index back
CREATE INDEX `search` ON `Donors`(`email`(63), `full_name`(63));

-- And drop an unused view
DROP VIEW `Recurring_no_kid_bank_donors`;

-- CreateTable
CREATE TABLE `Recurring_agreement_stopped_reasons` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(45) NOT NULL,

    UNIQUE INDEX `Recurring_agreement_stopped_reasons_name_key`(`name`),
    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recurring_agreement_stopped` (
    `ID` INTEGER NOT NULL AUTO_INCREMENT,
    `avtalegiroAgreementID` INTEGER NULL,
    `autoGiroAgreementID` INTEGER NULL,
    `vippsAgreementID` VARCHAR(20),
    `reasonID` INTEGER NOT NULL,
    `timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Recurring_agreement_stopped` ADD CONSTRAINT `Recurring_agreement_stopped_reasonID_fkey` FOREIGN KEY (`reasonID`) REFERENCES `Recurring_agreement_stopped_reasons`(`ID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recurring_agreement_stopped` ADD CONSTRAINT `Recurring_agreement_stopped_avtalegiroAgreementID_fkey` FOREIGN KEY (`avtalegiroAgreementID`) REFERENCES `Avtalegiro_agreements`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recurring_agreement_stopped` ADD CONSTRAINT `Recurring_agreement_stopped_autoGiroAgreementID_fkey` FOREIGN KEY (`autoGiroAgreementID`) REFERENCES `AutoGiro_agreements`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recurring_agreement_stopped` ADD CONSTRAINT `Recurring_agreement_stopped_vippsAgreementID_fkey` FOREIGN KEY (`vippsAgreementID`) REFERENCES `Vipps_agreements`(`ID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Trigger for Recurring_agreement_stopped
CREATE TRIGGER `Recurring_agreement_stopped_BEFORE_UPDATE` 
BEFORE UPDATE ON `Recurring_agreement_stopped` 
FOR EACH ROW
BEGIN
    SET NEW.last_updated = NOW();
END;