-- Execute as the migration owner in a disposable demo session.
-- This is NOT a migration and never drops a project table.
START TRANSACTION;
CREATE TEMPORARY TABLE demo_contact_note (note_id integer PRIMARY KEY, note text NOT NULL);
ALTER TABLE demo_contact_note ADD COLUMN created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
INSERT INTO demo_contact_note (note_id, note) VALUES (1, 'Demonstrate a small schema change safely');
SELECT * FROM demo_contact_note;
DROP TEMPORARY TABLE demo_contact_note;
COMMIT;
