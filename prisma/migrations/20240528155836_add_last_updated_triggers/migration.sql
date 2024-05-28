-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS `Adoveo_fundraiser_BEFORE_UPDATE`;
DROP TRIGGER IF EXISTS `Adoveo_fundraiser_org_shares_BEFORE_UPDATE`;
DROP TRIGGER IF EXISTS `Adoveo_fundraiser_transactions_BEFORE_UPDATE`;
DROP TRIGGER IF EXISTS `Adoveo_giftcard_transactions_BEFORE_UPDATE`;
DROP TRIGGER IF EXISTS `AutoGiro_agreement_charges_BEFORE_UPDATE`;
DROP TRIGGER IF EXISTS `AutoGiro_agreements_BEFORE_UPDATE`;
DROP TRIGGER IF EXISTS `AutoGiro_shipments_BEFORE_UPDATE`;
DROP TRIGGER IF EXISTS `AutoGiro_mandates_BEFORE_UPDATE`;
DROP TRIGGER IF EXISTS `Avtalegiro_agreements_BEFORE_UPDATE`;
DROP TRIGGER IF EXISTS `Distributions_BEFORE_UPDATE`;

-- Create new triggers

-- Trigger for Adoveo_fundraiser
CREATE TRIGGER `Adoveo_fundraiser_BEFORE_UPDATE` 
BEFORE UPDATE ON `Adoveo_fundraiser` 
FOR EACH ROW
BEGIN
    SET NEW.Last_updated = NOW();
END;

-- Trigger for Adoveo_fundraiser_org_shares
CREATE TRIGGER `Adoveo_fundraiser_org_shares_BEFORE_UPDATE` 
BEFORE UPDATE ON `Adoveo_fundraiser_org_shares` 
FOR EACH ROW
BEGIN
    SET NEW.Last_updated = NOW();
END;

-- Trigger for Adoveo_fundraiser_transactions
CREATE TRIGGER `Adoveo_fundraiser_transactions_BEFORE_UPDATE` 
BEFORE UPDATE ON `Adoveo_fundraiser_transactions` 
FOR EACH ROW
BEGIN
    SET NEW.Last_updated = NOW();
END;

-- Trigger for Adoveo_giftcard_transactions
CREATE TRIGGER `Adoveo_giftcard_transactions_BEFORE_UPDATE` 
BEFORE UPDATE ON `Adoveo_giftcard_transactions` 
FOR EACH ROW
BEGIN
    SET NEW.Last_updated = NOW();
END;

-- Trigger for AutoGiro_agreement_charges
CREATE TRIGGER `AutoGiro_agreement_charges_BEFORE_UPDATE` 
BEFORE UPDATE ON `AutoGiro_agreement_charges` 
FOR EACH ROW
BEGIN
    SET NEW.last_updated = NOW();
END;

-- Trigger for AutoGiro_agreements
CREATE TRIGGER `AutoGiro_agreements_BEFORE_UPDATE` 
BEFORE UPDATE ON `AutoGiro_agreements` 
FOR EACH ROW
BEGIN
    SET NEW.last_updated = NOW();
END;

-- Trigger for AutoGiro_shipments
CREATE TRIGGER `AutoGiro_shipments_BEFORE_UPDATE` 
BEFORE UPDATE ON `AutoGiro_shipments` 
FOR EACH ROW
BEGIN
    SET NEW.last_updated = NOW();
END;

-- Trigger for AutoGiro_mandates
CREATE TRIGGER `AutoGiro_mandates_BEFORE_UPDATE` 
BEFORE UPDATE ON `AutoGiro_mandates` 
FOR EACH ROW
BEGIN
    SET NEW.last_updated = NOW();
END;

-- Trigger for Avtalegiro_agreements
CREATE TRIGGER `Avtalegiro_agreements_BEFORE_UPDATE` 
BEFORE UPDATE ON `Avtalegiro_agreements` 
FOR EACH ROW
BEGIN
    SET NEW.last_updated = NOW();
END;

-- Trigger for Distributions
CREATE TRIGGER `Distributions_BEFORE_UPDATE` 
BEFORE UPDATE ON `Distributions` 
FOR EACH ROW
BEGIN
    SET NEW.last_updated = NOW();
END;