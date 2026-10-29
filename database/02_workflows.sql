-- Import in MySQL Workbench / mysql CLI, or run npm run db:setup.
-- Stored-program delimiters are understood by the setup runner too.
DELIMITER $$

DROP FUNCTION IF EXISTS active_staff$$
CREATE FUNCTION active_staff(p_staff int) RETURNS boolean
READS SQL DATA
BEGIN
    RETURN EXISTS (SELECT 1 FROM staff WHERE staff_id = p_staff AND status = 'ACTIVE');
END$$

DROP TRIGGER IF EXISTS donor_insert_guard$$
CREATE TRIGGER donor_insert_guard BEFORE INSERT ON donor FOR EACH ROW
BEGIN
    IF NEW.dob > CURRENT_DATE() THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Birth date cannot be in the future'; END IF;
END$$
DROP TRIGGER IF EXISTS donor_update_guard$$
CREATE TRIGGER donor_update_guard BEFORE UPDATE ON donor FOR EACH ROW
BEGIN
    IF NEW.dob > CURRENT_DATE() THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Birth date cannot be in the future'; END IF;
    IF NEW.blood_group_id <> OLD.blood_group_id AND EXISTS (SELECT 1 FROM donation WHERE donor_id = OLD.donor_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Blood group cannot change after a donation is recorded';
    END IF;
END$$

DROP TRIGGER IF EXISTS donation_insert_guard$$
CREATE TRIGGER donation_insert_guard BEFORE INSERT ON donation FOR EACH ROW
BEGIN
    DECLARE donor_lock int;
    SELECT donor_id INTO donor_lock FROM donor WHERE donor_id = NEW.donor_id FOR UPDATE;
    IF NOT active_staff(NEW.collected_by) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Collector must be active'; END IF;
    IF NEW.collected_at > CURRENT_TIMESTAMP(3) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Collection cannot be in the future'; END IF;
    IF NEW.screening_status <> 'PENDING' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A new donation must await screening'; END IF;
END$$
DROP TRIGGER IF EXISTS donation_update_guard$$
CREATE TRIGGER donation_update_guard BEFORE UPDATE ON donation FOR EACH ROW
BEGIN
    IF NEW.donor_id <> OLD.donor_id OR NEW.collected_at <> OLD.collected_at
       OR NEW.quantity_ml <> OLD.quantity_ml OR NEW.collected_by <> OLD.collected_by
       OR NEW.donation_type <> OLD.donation_type OR NEW.collection_status <> OLD.collection_status THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Collection records are immutable';
    END IF;
    IF OLD.screening_status <> 'PENDING' AND (NEW.screening_status <> OLD.screening_status OR NOT (NEW.screening_ref <=> OLD.screening_ref)) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A finalized screening cannot be overwritten';
    END IF;
END$$

DROP TRIGGER IF EXISTS storage_update_guard$$
CREATE TRIGGER storage_update_guard BEFORE UPDATE ON storage FOR EACH ROW
BEGIN
    IF NEW.capacity_units < NEW.occupied_units THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Capacity cannot be less than occupied slots'; END IF;
    IF NEW.status = 'INACTIVE' AND NEW.occupied_units > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Move or discard units before deactivating storage'; END IF;
END$$

DROP TRIGGER IF EXISTS unit_insert_guard$$
CREATE TRIGGER unit_insert_guard BEFORE INSERT ON blood_unit FOR EACH ROW
BEGIN
    DECLARE expected_group int;
    DECLARE quantity decimal(7,2);
    DECLARE collected datetime(3);
    SELECT r.blood_group_id, d.quantity_ml, d.collected_at INTO expected_group, quantity, collected
    FROM donation d JOIN donor r ON r.donor_id = d.donor_id WHERE d.donation_id = NEW.donation_id;
    IF expected_group IS NULL OR NEW.blood_group_id <> expected_group OR NEW.volume_ml <> quantity THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unit group and volume must match its donation';
    END IF;
    IF NEW.expires_at <= collected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Expiry must be later than collection'; END IF;
    IF NEW.status <> 'QUARANTINED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New units start in quarantine'; END IF;
    -- Atomic slot acquisition: no stale COUNT snapshot and no overfilled store.
    UPDATE storage SET occupied_units = occupied_units + 1
    WHERE storage_id = NEW.storage_id AND status = 'ACTIVE' AND occupied_units < capacity_units;
    IF ROW_COUNT() <> 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Storage is full, inactive or missing'; END IF;
END$$

DROP TRIGGER IF EXISTS unit_update_guard$$
CREATE TRIGGER unit_update_guard BEFORE UPDATE ON blood_unit FOR EACH ROW
BEGIN
    DECLARE screening varchar(12);
    IF OLD.status IN ('ISSUED', 'DISCARDED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issued or discarded units cannot be edited'; END IF;
    IF NEW.donation_id <> OLD.donation_id OR NEW.blood_group_id <> OLD.blood_group_id
       OR NEW.volume_ml <> OLD.volume_ml OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unit identity, volume and expiry are immutable';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
        (OLD.status = 'QUARANTINED' AND NEW.status IN ('AVAILABLE', 'DISCARDED')) OR
        (OLD.status = 'AVAILABLE' AND NEW.status IN ('ISSUED', 'DISCARDED'))
    ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid unit status transition'; END IF;
    IF NEW.status IN ('AVAILABLE', 'ISSUED') THEN
        SELECT screening_status INTO screening FROM donation WHERE donation_id = NEW.donation_id;
        IF NEW.expires_at <= CURRENT_TIMESTAMP(3) OR screening <> 'APPROVED'
           OR NOT EXISTS (SELECT 1 FROM blood_test WHERE unit_id = NEW.unit_id AND test_type = 'SCREENING_PANEL' AND result = 'PASS')
           OR EXISTS (SELECT 1 FROM blood_test WHERE unit_id = NEW.unit_id AND result = 'FAIL') THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unit needs approved screening, passing screening tests and a future expiry';
        END IF;
    END IF;
    IF NEW.status = 'ISSUED' AND NOT EXISTS (SELECT 1 FROM issue_detail WHERE unit_id = NEW.unit_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue a unit through the issuance workflow';
    END IF;
    IF NEW.storage_id <> OLD.storage_id AND NEW.status IN ('QUARANTINED', 'AVAILABLE') THEN
        UPDATE storage SET occupied_units = occupied_units + 1
        WHERE storage_id = NEW.storage_id AND status = 'ACTIVE' AND occupied_units < capacity_units;
        IF ROW_COUNT() <> 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Destination storage is full, inactive or missing'; END IF;
    END IF;
    IF (NEW.storage_id <> OLD.storage_id OR NEW.status IN ('ISSUED', 'DISCARDED')) THEN
        UPDATE storage SET occupied_units = occupied_units - 1 WHERE storage_id = OLD.storage_id;
    END IF;
END$$

DROP TRIGGER IF EXISTS test_insert_guard$$
CREATE TRIGGER test_insert_guard BEFORE INSERT ON blood_test FOR EACH ROW
BEGIN
    DECLARE unit_state varchar(15);
    DECLARE donation_key int;
    DECLARE collected datetime(3);
    SELECT status, donation_id INTO unit_state, donation_key FROM blood_unit WHERE unit_id = NEW.unit_id FOR UPDATE;
    IF unit_state IS NULL OR unit_state <> 'QUARANTINED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tests require a quarantined unit'; END IF;
    SELECT collected_at INTO collected FROM donation WHERE donation_id = donation_key;
    IF NOT active_staff(NEW.tested_by) OR NEW.tested_at < collected OR NEW.tested_at > CURRENT_TIMESTAMP(3) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid tester or test time';
    END IF;
END$$

DROP TRIGGER IF EXISTS request_insert_guard$$
CREATE TRIGGER request_insert_guard BEFORE INSERT ON blood_request FOR EACH ROW
BEGIN
    IF NEW.status <> 'PENDING' OR NEW.verified_by IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A new request must await verification'; END IF;
END$$
DROP TRIGGER IF EXISTS request_update_guard$$
CREATE TRIGGER request_update_guard BEFORE UPDATE ON blood_request FOR EACH ROW
BEGIN
    DECLARE delivered int;
    IF NEW.hospital_id <> OLD.hospital_id OR NEW.blood_group_id <> OLD.blood_group_id
       OR NEW.requested_units <> OLD.requested_units OR NEW.priority <> OLD.priority
       OR NEW.required_at <> OLD.required_at OR NEW.requested_at <> OLD.requested_at OR NEW.request_type <> OLD.request_type THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Replace a draft instead of editing request requirements';
    END IF;
    IF OLD.verified_by IS NOT NULL AND (NOT (NEW.verified_by <=> OLD.verified_by) OR NOT (NEW.verified_at <=> OLD.verified_at)) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Verification history is immutable';
    END IF;
    IF NEW.verified_by IS NOT NULL AND NOT active_staff(NEW.verified_by) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Verifier must be active'; END IF;
    IF NEW.status <> OLD.status AND NOT (
        (OLD.status = 'PENDING' AND NEW.status IN ('VERIFIED', 'CANCELLED')) OR
        (OLD.status IN ('VERIFIED', 'PARTIALLY_FULFILLED') AND NEW.status IN ('PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'))
    ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid request status transition'; END IF;
    IF NEW.status = 'VERIFIED' AND NOT EXISTS (SELECT 1 FROM hospital WHERE hospital_id = NEW.hospital_id AND status = 'ACTIVE') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hospital must be active';
    END IF;
    SELECT count(*) INTO delivered FROM issue_detail d JOIN blood_issue i ON i.issue_id = d.issue_id WHERE i.request_id = NEW.request_id;
    IF (NEW.status = 'FULFILLED' AND delivered <> NEW.requested_units)
       OR (NEW.status = 'PARTIALLY_FULFILLED' AND NOT (delivered > 0 AND delivered < NEW.requested_units)) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request status does not match issued units';
    END IF;
END$$
DROP TRIGGER IF EXISTS request_delete_guard$$
CREATE TRIGGER request_delete_guard BEFORE DELETE ON blood_request FOR EACH ROW
BEGIN
    IF OLD.status <> 'PENDING' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only unverified draft requests can be deleted'; END IF;
END$$

DROP TRIGGER IF EXISTS issue_header_guard$$
CREATE TRIGGER issue_header_guard BEFORE INSERT ON blood_issue FOR EACH ROW
BEGIN
    DECLARE request_state varchar(24);
    DECLARE hospital_key int;
    SELECT status, hospital_id INTO request_state, hospital_key FROM blood_request WHERE request_id = NEW.request_id FOR UPDATE;
    IF request_state IS NULL OR request_state NOT IN ('VERIFIED', 'PARTIALLY_FULFILLED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request must be verified and unfulfilled'; END IF;
    IF NOT active_staff(NEW.processed_by) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Processor must be active'; END IF;
    IF NOT EXISTS (SELECT 1 FROM hospital WHERE hospital_id = hospital_key AND status = 'ACTIVE') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hospital must be active'; END IF;
END$$

DROP TRIGGER IF EXISTS issue_detail_guard$$
CREATE TRIGGER issue_detail_guard BEFORE INSERT ON issue_detail FOR EACH ROW
BEGIN
    DECLARE group_key int;
    DECLARE requested int;
    DECLARE request_key int;
    DECLARE request_state varchar(24);
    DECLARE unit_state varchar(15);
    DECLARE unit_group int;
    DECLARE unit_volume decimal(7,2);
    DECLARE expiry datetime(3);
    DECLARE done_count int;
    SELECT r.request_id, r.blood_group_id, r.requested_units, r.status INTO request_key, group_key, requested, request_state
    FROM blood_request r JOIN blood_issue i ON i.request_id = r.request_id WHERE i.issue_id = NEW.issue_id FOR UPDATE;
    IF request_state IS NULL OR request_state NOT IN ('VERIFIED', 'PARTIALLY_FULFILLED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request is not open for issuance'; END IF;
    SELECT status, blood_group_id, volume_ml, expires_at INTO unit_state, unit_group, unit_volume, expiry
    FROM blood_unit WHERE unit_id = NEW.unit_id FOR UPDATE;
    IF unit_state IS NULL OR unit_state <> 'AVAILABLE' OR expiry <= CURRENT_TIMESTAMP(3)
       OR unit_group <> group_key OR NEW.volume_issued_ml <> unit_volume THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unit is unavailable, expired, mismatched or not issued whole';
    END IF;
    SELECT count(*) INTO done_count FROM issue_detail d JOIN blood_issue i ON i.issue_id = d.issue_id WHERE i.request_id = request_key;
    IF done_count >= requested THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request quantity would be exceeded'; END IF;
END$$

DROP TRIGGER IF EXISTS issue_detail_finish$$
CREATE TRIGGER issue_detail_finish AFTER INSERT ON issue_detail FOR EACH ROW
BEGIN
    DECLARE request_key int;
    DECLARE done_count int;
    UPDATE blood_unit SET status = 'ISSUED' WHERE unit_id = NEW.unit_id;
    SELECT request_id INTO request_key FROM blood_issue WHERE issue_id = NEW.issue_id;
    SELECT count(*) INTO done_count FROM issue_detail d JOIN blood_issue i ON i.issue_id = d.issue_id WHERE i.request_id = request_key;
    UPDATE blood_request SET status = IF(done_count = requested_units, 'FULFILLED', 'PARTIALLY_FULFILLED') WHERE request_id = request_key;
END$$

-- This procedure OWNS its transaction. CALL it outside any caller transaction.
-- The application calls this procedure instead of inserting issue rows directly.
-- Local setup uses your own MySQL account; it does not configure restricted grants.
DROP PROCEDURE IF EXISTS issue_blood$$
CREATE PROCEDURE issue_blood(IN p_request int, IN p_count int, IN p_staff int, IN p_operation char(36))
SQL SECURITY DEFINER
issue_flow: BEGIN
    DECLARE request_state varchar(24);
    DECLARE group_key int;
    DECLARE requested int;
    DECLARE issued_count int;
    DECLARE new_issue int;
    DECLARE previous_issue int;
    DECLARE previous_request int;
    DECLARE previous_count int;
    DECLARE unit_key int;
    DECLARE selected_volume decimal(7,2);
    DECLARE fetched int DEFAULT 0;
    DECLARE finished boolean DEFAULT false;
    DECLARE candidates CURSOR FOR
        SELECT u.unit_id FROM blood_unit u
        WHERE u.status = 'AVAILABLE' AND u.blood_group_id = group_key AND u.expires_at > CURRENT_TIMESTAMP(3)
          AND EXISTS (SELECT 1 FROM storage s WHERE s.storage_id = u.storage_id AND s.status = 'ACTIVE')
        ORDER BY u.expires_at, u.unit_id LIMIT p_count FOR UPDATE SKIP LOCKED;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = true;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- Task: Lock the request, validate its remaining demand, then select eligible stock.
    START TRANSACTION;
    IF p_count IS NULL OR p_count < 1 OR p_count > 1000 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue between 1 and 1000 units per operation'; END IF;
    IF p_operation IS NULL OR NOT REGEXP_LIKE(p_operation, '^[0-9a-fA-F-]{36}$') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A UUID operation key is required'; END IF;
    SELECT status, blood_group_id, requested_units INTO request_state, group_key, requested
    FROM blood_request WHERE request_id = p_request FOR UPDATE;
    IF request_state IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request not found'; END IF;
    SELECT max(i.issue_id), max(i.request_id), count(d.issue_detail_id) INTO previous_issue, previous_request, previous_count
    FROM blood_issue i LEFT JOIN issue_detail d ON d.issue_id = i.issue_id WHERE i.operation_key = p_operation;
    IF previous_issue IS NOT NULL THEN
        IF previous_request <> p_request OR previous_count <> p_count THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operation key belongs to a different issuance'; END IF;
        COMMIT;
        SELECT previous_issue AS issue_id;
        LEAVE issue_flow;
    END IF;
    IF NOT active_staff(p_staff) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Processor must be active'; END IF;
    IF request_state NOT IN ('VERIFIED', 'PARTIALLY_FULFILLED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request is not open for issuance'; END IF;
    SELECT count(*) INTO issued_count FROM issue_detail d JOIN blood_issue i ON i.issue_id = d.issue_id WHERE i.request_id = p_request;
    IF p_count > requested - issued_count THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue quantity exceeds remaining request'; END IF;
    -- Task: Write the issue header and whole-unit details inside the same transaction.
    INSERT INTO blood_issue (request_id, processed_by, operation_key) VALUES (p_request, p_staff, p_operation);
    SET new_issue = LAST_INSERT_ID();
    SET finished = false;
    OPEN candidates;
    issue_units: LOOP
        FETCH candidates INTO unit_key;
        IF finished THEN LEAVE issue_units; END IF;
        SELECT volume_ml INTO selected_volume FROM blood_unit WHERE unit_id = unit_key;
        INSERT INTO issue_detail (issue_id, unit_id, volume_issued_ml) VALUES (new_issue, unit_key, selected_volume);
        SET fetched = fetched + 1;
    END LOOP;
    CLOSE candidates;
    -- Task: Roll back everything if the full batch could not be allocated.
    IF fetched <> p_count THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Not enough eligible unlocked stock; no units were issued. Refresh and retry.'; END IF;
    COMMIT;
    SELECT new_issue AS issue_id;
END$$

DELIMITER ;

CREATE OR REPLACE VIEW inventory AS
SELECT u.*, b.group_name, s.location_name, d.donor_id, d.collected_at, d.screening_status,
    CASE WHEN u.status IN ('AVAILABLE', 'QUARANTINED') AND u.expires_at <= CURRENT_TIMESTAMP(3)
        THEN 'EXPIRED' ELSE u.status END AS display_status
FROM blood_unit u JOIN blood_group b USING (blood_group_id)
JOIN storage s USING (storage_id) JOIN donation d USING (donation_id);

CREATE OR REPLACE VIEW available_stock AS
SELECT b.blood_group_id, b.group_name, count(u.unit_id) AS available_units, min(u.expires_at) AS next_expiry
FROM blood_group b LEFT JOIN blood_unit u ON u.blood_group_id = b.blood_group_id
    AND u.status = 'AVAILABLE' AND u.expires_at > CURRENT_TIMESTAMP(3)
    AND EXISTS (SELECT 1 FROM storage s WHERE s.storage_id = u.storage_id AND s.status = 'ACTIVE')
GROUP BY b.blood_group_id, b.group_name;

CREATE OR REPLACE VIEW request_progress AS
SELECT r.*, h.hospital_name, b.group_name, coalesce(t.issued_units, 0) AS issued_units,
    r.requested_units - coalesce(t.issued_units, 0) AS remaining_units
FROM blood_request r JOIN hospital h USING (hospital_id) JOIN blood_group b USING (blood_group_id)
LEFT JOIN (
    SELECT i.request_id, count(d.issue_detail_id) AS issued_units
    FROM blood_issue i JOIN issue_detail d USING (issue_id) GROUP BY i.request_id
) t ON t.request_id = r.request_id;

DELIMITER $$

DROP TRIGGER IF EXISTS blood_test_update_history$$
CREATE TRIGGER blood_test_update_history BEFORE UPDATE ON blood_test FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Final operational records cannot be changed or deleted';
END$$

DROP TRIGGER IF EXISTS blood_test_delete_history$$
CREATE TRIGGER blood_test_delete_history BEFORE DELETE ON blood_test FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Final operational records cannot be changed or deleted';
END$$

DROP TRIGGER IF EXISTS donation_delete_history$$
CREATE TRIGGER donation_delete_history BEFORE DELETE ON donation FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Final operational records cannot be changed or deleted';
END$$

DROP TRIGGER IF EXISTS blood_unit_delete_history$$
CREATE TRIGGER blood_unit_delete_history BEFORE DELETE ON blood_unit FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Final operational records cannot be changed or deleted';
END$$

DROP TRIGGER IF EXISTS blood_issue_update_history$$
CREATE TRIGGER blood_issue_update_history BEFORE UPDATE ON blood_issue FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Final operational records cannot be changed or deleted';
END$$

DROP TRIGGER IF EXISTS blood_issue_delete_history$$
CREATE TRIGGER blood_issue_delete_history BEFORE DELETE ON blood_issue FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Final operational records cannot be changed or deleted';
END$$

DROP TRIGGER IF EXISTS issue_detail_update_history$$
CREATE TRIGGER issue_detail_update_history BEFORE UPDATE ON issue_detail FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Final operational records cannot be changed or deleted';
END$$

DROP TRIGGER IF EXISTS issue_detail_delete_history$$
CREATE TRIGGER issue_detail_delete_history BEFORE DELETE ON issue_detail FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Final operational records cannot be changed or deleted';
END$$

DROP TRIGGER IF EXISTS audit_donation_insert$$
CREATE TRIGGER audit_donation_insert AFTER INSERT ON donation FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    VALUES ('donation', NEW.donation_id, 'INSERT', @app_staff_id, NULL, JSON_OBJECT('donation_id', NEW.donation_id, 'donor_id', NEW.donor_id, 'quantity_ml', NEW.quantity_ml, 'screening_status', NEW.screening_status, 'screening_ref', NEW.screening_ref));
END$$

DROP TRIGGER IF EXISTS audit_donation_update$$
CREATE TRIGGER audit_donation_update AFTER UPDATE ON donation FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    VALUES ('donation', NEW.donation_id, 'UPDATE', @app_staff_id, JSON_OBJECT('donation_id', OLD.donation_id, 'donor_id', OLD.donor_id, 'quantity_ml', OLD.quantity_ml, 'screening_status', OLD.screening_status, 'screening_ref', OLD.screening_ref), JSON_OBJECT('donation_id', NEW.donation_id, 'donor_id', NEW.donor_id, 'quantity_ml', NEW.quantity_ml, 'screening_status', NEW.screening_status, 'screening_ref', NEW.screening_ref));
END$$

DROP TRIGGER IF EXISTS audit_blood_unit_insert$$
CREATE TRIGGER audit_blood_unit_insert AFTER INSERT ON blood_unit FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    VALUES ('blood_unit', NEW.unit_id, 'INSERT', @app_staff_id, NULL, JSON_OBJECT('unit_id', NEW.unit_id, 'donation_id', NEW.donation_id, 'storage_id', NEW.storage_id, 'status', NEW.status));
END$$

DROP TRIGGER IF EXISTS audit_blood_unit_update$$
CREATE TRIGGER audit_blood_unit_update AFTER UPDATE ON blood_unit FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    VALUES ('blood_unit', NEW.unit_id, 'UPDATE', @app_staff_id, JSON_OBJECT('unit_id', OLD.unit_id, 'donation_id', OLD.donation_id, 'storage_id', OLD.storage_id, 'status', OLD.status), JSON_OBJECT('unit_id', NEW.unit_id, 'donation_id', NEW.donation_id, 'storage_id', NEW.storage_id, 'status', NEW.status));
END$$

DROP TRIGGER IF EXISTS audit_blood_request_insert$$
CREATE TRIGGER audit_blood_request_insert AFTER INSERT ON blood_request FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    VALUES ('blood_request', NEW.request_id, 'INSERT', @app_staff_id, NULL, JSON_OBJECT('request_id', NEW.request_id, 'hospital_id', NEW.hospital_id, 'requested_units', NEW.requested_units, 'status', NEW.status, 'verified_by', NEW.verified_by));
END$$

DROP TRIGGER IF EXISTS audit_blood_request_update$$
CREATE TRIGGER audit_blood_request_update AFTER UPDATE ON blood_request FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    VALUES ('blood_request', NEW.request_id, 'UPDATE', @app_staff_id, JSON_OBJECT('request_id', OLD.request_id, 'hospital_id', OLD.hospital_id, 'requested_units', OLD.requested_units, 'status', OLD.status, 'verified_by', OLD.verified_by), JSON_OBJECT('request_id', NEW.request_id, 'hospital_id', NEW.hospital_id, 'requested_units', NEW.requested_units, 'status', NEW.status, 'verified_by', NEW.verified_by));
END$$

DROP TRIGGER IF EXISTS audit_blood_request_delete$$
CREATE TRIGGER audit_blood_request_delete AFTER DELETE ON blood_request FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    VALUES ('blood_request', OLD.request_id, 'DELETE', @app_staff_id, JSON_OBJECT('request_id', OLD.request_id, 'hospital_id', OLD.hospital_id, 'requested_units', OLD.requested_units, 'status', OLD.status, 'verified_by', OLD.verified_by), NULL);
END$$

DROP TRIGGER IF EXISTS audit_blood_issue_insert$$
CREATE TRIGGER audit_blood_issue_insert AFTER INSERT ON blood_issue FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    VALUES ('blood_issue', NEW.issue_id, 'INSERT', @app_staff_id, NULL, JSON_OBJECT('issue_id', NEW.issue_id, 'request_id', NEW.request_id, 'processed_by', NEW.processed_by, 'operation_key', NEW.operation_key));
END$$

DELIMITER ;
