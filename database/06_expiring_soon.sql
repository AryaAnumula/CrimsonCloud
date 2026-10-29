-- Member 2 feature: identify released blood units expiring
-- within the next seven days.
CREATE OR REPLACE VIEW expiring_soon AS
SELECT
    bu.unit_id,
    bg.group_name AS blood_group,
    bu.storage_id,
    bu.volume_ml,
    bu.expires_at,
    DATEDIFF(bu.expires_at, CURRENT_TIMESTAMP) AS days_until_expiry
FROM blood_unit AS bu
JOIN blood_group AS bg
    ON bg.blood_group_id = bu.blood_group_id
WHERE bu.status = 'AVAILABLE'
  AND bu.expires_at > CURRENT_TIMESTAMP
  AND bu.expires_at <= CURRENT_TIMESTAMP + INTERVAL 7 DAY;