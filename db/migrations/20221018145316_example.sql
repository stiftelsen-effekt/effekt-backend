-- migrate:up
ALTER TABLE Donations ADD COLUMN doggo VARCHAR(20);

-- migrate:down
ALTER TABLE Donations DROP COLUMN doggo;

