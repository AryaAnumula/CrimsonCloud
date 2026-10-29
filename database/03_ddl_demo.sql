-- Task: demonstrate the DDL commands the project must show (CREATE / ALTER / DROP) on real
-- objects, together with primary keys, foreign keys, CHECK and UNIQUE constraints, indexes and a
-- view. The project database is never touched: everything lives in a throwaway demo schema.
--
-- Why no START TRANSACTION here: MySQL commits DDL implicitly, so a transaction cannot undo a
-- CREATE/ALTER/DROP. This file therefore makes itself safe by dropping the whole demo schema at
-- the end, and re-creating it at the start if a previous run was interrupted.
--
-- Run in MySQL Workbench (or `mysql`) connected to your server; no project credentials are needed
-- beyond permission to create a database.

-- Re-runnable: remove any earlier demo run (DROP database).
DROP DATABASE IF EXISTS blood_bank_ddl_demo;

-- CREATE database.
CREATE DATABASE blood_bank_ddl_demo
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

USE blood_bank_ddl_demo;

-- CREATE TABLE with primary key, NOT NULL, DEFAULT, CHECK and COMPOSITE name constraint.
CREATE TABLE demo_donor (
  donor_id    int           NOT NULL AUTO_INCREMENT,
  name        varchar(80)   NOT NULL,
  blood_group char(3)       NOT NULL,
  weight_kg   decimal(5,2)  NOT NULL,
  created_at  datetime(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (donor_id),
  CONSTRAINT ck_demo_donor_weight CHECK (weight_kg >= 40),
  CONSTRAINT ck_demo_donor_group  CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'))
) ENGINE=InnoDB;

-- CREATE TABLE with a FOREIGN KEY, a supporting index and a DEFAULT.
-- ON DELETE RESTRICT is the same policy the project uses for real donations.
CREATE TABLE demo_donation (
  donation_id  int           NOT NULL AUTO_INCREMENT,
  donor_id     int           NOT NULL,
  quantity_ml  int           NOT NULL,
  collected_at datetime(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (donation_id),
  KEY ix_demo_donation_donor (donor_id),
  CONSTRAINT fk_demo_donation_donor FOREIGN KEY (donor_id)
    REFERENCES demo_donor (donor_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_demo_donation_volume CHECK (quantity_ml BETWEEN 200 AND 500)
) ENGINE=InnoDB;

-- Two valid rows, so the next statements have something to show.
INSERT INTO demo_donor (name, blood_group, weight_kg) VALUES ('Demo Donor One', 'O+', 68.50);
INSERT INTO demo_donation (donor_id, quantity_ml) VALUES (LAST_INSERT_ID(), 450);

-- Refused by the database. Run any of these by hand to show the error messages:
--   INSERT INTO demo_donor (name, blood_group, weight_kg) VALUES ('Too Light', 'O+', 35);    -- CHECK
--   INSERT INTO demo_donor (name, blood_group, weight_kg) VALUES ('Bad Group', 'X+', 70);    -- CHECK
--   INSERT INTO demo_donation (donor_id, quantity_ml) VALUES (99999, 450);                   -- FOREIGN KEY
--   INSERT INTO demo_donation (donor_id, quantity_ml) VALUES (1, 900);                       -- CHECK volume

-- ALTER: add a column, add a UNIQUE constraint, change a column type, add a nullable column.
ALTER TABLE demo_donor    ADD COLUMN phone varchar(20) NULL AFTER name;
ALTER TABLE demo_donor    ADD CONSTRAINT uq_demo_donor_phone UNIQUE (phone);
ALTER TABLE demo_donation MODIFY COLUMN quantity_ml smallint unsigned NOT NULL;
ALTER TABLE demo_donation ADD COLUMN note varchar(200) NULL;

-- CREATE VIEW, to show that the current structure is queryable before it is removed.
CREATE VIEW demo_donor_summary AS
SELECT d.donor_id, d.name, count(n.donation_id) AS donation_count,
       coalesce(sum(n.quantity_ml), 0) AS collected_ml
FROM demo_donor d
LEFT JOIN demo_donation n ON n.donor_id = d.donor_id
GROUP BY d.donor_id, d.name;

-- Inspect what the DDL actually produced.
SHOW CREATE TABLE demo_donor;
SHOW CREATE TABLE demo_donation;
SHOW INDEX FROM demo_donor;
SELECT * FROM demo_donor_summary;

-- DROP individual pieces first (DROP INDEX / DROP COLUMN / DROP FOREIGN KEY / DROP VIEW),
-- then the tables, then the schema.
ALTER TABLE demo_donor    DROP INDEX uq_demo_donor_phone;
ALTER TABLE demo_donor    DROP COLUMN phone;
ALTER TABLE demo_donation DROP FOREIGN KEY fk_demo_donation_donor;
ALTER TABLE demo_donation DROP INDEX ix_demo_donation_donor;
DROP VIEW demo_donor_summary;
DROP TABLE demo_donation;
DROP TABLE demo_donor;
DROP DATABASE blood_bank_ddl_demo;

-- Nothing from this file remains: your project schema, its data and its own DDL are untouched.
