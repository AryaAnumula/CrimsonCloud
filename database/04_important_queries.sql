-- Readable demonstration queries. Run after setup and seed in MySQL Workbench.
-- Queries are read-only except the final clearly marked, rolled-back DML example.

-- Task 1: JOIN: current stock with group, donation, donor and storage.
SELECT u.unit_id, b.group_name, d.name AS donor, s.location_name,
       u.volume_ml, u.expires_at, u.status
FROM blood_unit u
JOIN blood_group b ON b.blood_group_id = u.blood_group_id
JOIN donation n ON n.donation_id = u.donation_id
JOIN donor d ON d.donor_id = n.donor_id
JOIN storage s ON s.storage_id = u.storage_id
ORDER BY u.expires_at, u.unit_id;

-- Task 2: GROUP BY, aggregate, HAVING: groups below a demo planning threshold.
SELECT b.group_name, count(u.unit_id) AS available_units
FROM blood_group b
LEFT JOIN blood_unit u ON u.blood_group_id = b.blood_group_id
    AND u.status = 'AVAILABLE' AND u.expires_at > CURRENT_TIMESTAMP(3)
GROUP BY b.blood_group_id, b.group_name
HAVING count(u.unit_id) < 3
ORDER BY available_units, b.group_name;

-- Task 3: Subquery: verified requests with more outstanding demand than eligible stock.
SELECT r.request_id, r.hospital_name, r.group_name, r.remaining_units
FROM request_progress r
WHERE r.status IN ('VERIFIED', 'PARTIALLY_FULFILLED')
  AND r.remaining_units > (
      SELECT count(*) FROM blood_unit u
      JOIN storage s ON s.storage_id = u.storage_id
      WHERE u.blood_group_id = r.blood_group_id
        AND u.status = 'AVAILABLE' AND u.expires_at > CURRENT_TIMESTAMP(3)
        AND s.status = 'ACTIVE'
  )
ORDER BY CASE r.priority WHEN 'URGENT' THEN 0 ELSE 1 END, r.required_at;

-- Task 4: Expiry planning: only released, unexpired bags, earliest first.
SELECT unit_id, group_name, location_name, expires_at
FROM inventory
WHERE display_status = 'AVAILABLE'
  AND expires_at < DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY)
ORDER BY expires_at, unit_id;

-- Task 5: Donation frequency and volume totals (not an eligibility determination).
SELECT r.donor_id, r.name, count(d.donation_id) AS donation_count,
       coalesce(sum(d.quantity_ml), 0) AS collected_ml
FROM donor r LEFT JOIN donation d ON d.donor_id = r.donor_id
GROUP BY r.donor_id, r.name
ORDER BY donation_count DESC, r.donor_id;

-- Task 6: Issue traceability: request -> issue -> unit -> donation -> donor.
SELECT i.issue_id, r.request_id, h.hospital_name, u.unit_id,
       d.donation_id, n.name AS donor, x.volume_issued_ml, i.issued_at
FROM blood_issue i
JOIN blood_request r ON r.request_id = i.request_id
JOIN hospital h ON h.hospital_id = r.hospital_id
JOIN issue_detail x ON x.issue_id = i.issue_id
JOIN blood_unit u ON u.unit_id = x.unit_id
JOIN donation d ON d.donation_id = u.donation_id
JOIN donor n ON n.donor_id = d.donor_id
ORDER BY i.issued_at DESC;

-- Task 7: Views: stored query definitions, not separate copies of stock.
SELECT * FROM available_stock ORDER BY blood_group_id;
SELECT * FROM request_progress ORDER BY required_at;

-- Task 8: Index evidence. Small seed datasets may legitimately choose a table scan.
-- Capture EXPLAIN on realistic synthetic volume before claiming a speed-up.
EXPLAIN ANALYZE
SELECT unit_id, expires_at FROM blood_unit
WHERE status = 'AVAILABLE' AND blood_group_id = 1 AND expires_at > CURRENT_TIMESTAMP(3)
ORDER BY expires_at, unit_id LIMIT 5;
SHOW INDEX FROM blood_unit;

-- Task 9: Inspect programs. Four-plus SQL concepts: transaction, procedure, trigger,
-- view and index; MongoDB aggregation supplies the second-paradigm concept.
SHOW TRIGGERS;
SHOW CREATE PROCEDURE issue_blood;

-- Task 10: DML demo: disposable pending draft; no operational history is removed.
-- The supplied test values are selected from your actual reference rows.
START TRANSACTION;
INSERT INTO blood_request(hospital_id,blood_group_id,requested_units,priority,required_at)
SELECT h.hospital_id,b.blood_group_id,1,'NORMAL',DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 1 DAY)
FROM hospital h CROSS JOIN blood_group b ORDER BY h.hospital_id,b.blood_group_id LIMIT 1;
SET @demo_request = LAST_INSERT_ID();
SELECT * FROM blood_request WHERE request_id = @demo_request;
DELETE FROM blood_request WHERE request_id = @demo_request;
ROLLBACK;

-- Issuance is demonstrated through the application, or deliberately with:
-- SET @app_staff_id = <active staff ID>;
-- CALL issue_blood(<verified request ID>, <unit count>, <active staff ID>, UUID());
-- CALL owns START TRANSACTION/COMMIT; do not wrap it in a larger transaction.
