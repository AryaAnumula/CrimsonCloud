-- Blood Bank Management System | MySQL 8.0+ (written for 8.4, verified on 8.0.46) | InnoDB
-- All application timestamps are UTC. Use synthetic data, not medical records.
-- MySQL DDL commits implicitly; the setup runner records each completed file.

-- Task: Define the eight blood groups.
CREATE TABLE IF NOT EXISTS blood_group (
    blood_group_id int AUTO_INCREMENT PRIMARY KEY,
    group_name varchar(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    CHECK (group_name IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'))
) ENGINE=InnoDB;

-- Task: Store staff roles and bcrypt password hashes.
CREATE TABLE IF NOT EXISTS staff (
    staff_id int AUTO_INCREMENT PRIMARY KEY,
    name varchar(100) NOT NULL,
    phone varchar(30),
    email varchar(160) NOT NULL UNIQUE,
    username varchar(50) COLLATE utf8mb4_0900_as_cs NOT NULL UNIQUE,
    password_hash varchar(60) NOT NULL,
    role enum('ADMIN', 'STAFF') NOT NULL,
    status enum('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    CHECK (char_length(trim(name)) > 0),
    CHECK (username = lower(username)),
    CHECK (password_hash LIKE '$2%')
) ENGINE=InnoDB;

-- Task: Register donor details and link the blood group.
CREATE TABLE IF NOT EXISTS donor (
    donor_id int AUTO_INCREMENT PRIMARY KEY,
    name varchar(100) NOT NULL,
    dob date NOT NULL,
    gender varchar(30),
    weight_kg decimal(6,2),
    phone varchar(30),
    email varchar(160) UNIQUE,
    address text,
    blood_group_id int NOT NULL,
    FOREIGN KEY (blood_group_id) REFERENCES blood_group(blood_group_id),
    CHECK (char_length(trim(name)) > 0),
    CHECK (weight_kg > 0)
) ENGINE=InnoDB;

-- Task: Track storage capacity and maintained occupancy.
CREATE TABLE IF NOT EXISTS storage (
    storage_id int AUTO_INCREMENT PRIMARY KEY,
    location_name varchar(100) NOT NULL UNIQUE,
    storage_type varchar(50) NOT NULL,
    temperature_c decimal(5,2) NOT NULL,
    capacity_units int NOT NULL,
    occupied_units int NOT NULL DEFAULT 0,
    status enum('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    CHECK (capacity_units > 0),
    CHECK (occupied_units >= 0 AND occupied_units <= capacity_units)
) ENGINE=InnoDB;

-- Task: Record collection and its final screening decision.
CREATE TABLE IF NOT EXISTS donation (
    donation_id int AUTO_INCREMENT PRIMARY KEY,
    donor_id int NOT NULL,
    collected_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    donation_type enum('WHOLE_BLOOD') NOT NULL DEFAULT 'WHOLE_BLOOD',
    quantity_ml decimal(7,2) NOT NULL,
    collected_by int NOT NULL,
    collection_status enum('COLLECTED') NOT NULL DEFAULT 'COLLECTED',
    screening_status enum('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    screening_ref char(36) UNIQUE,
    FOREIGN KEY (donor_id) REFERENCES donor(donor_id),
    FOREIGN KEY (collected_by) REFERENCES staff(staff_id),
    CHECK (quantity_ml > 0),
    CHECK ((screening_status = 'PENDING' AND screening_ref IS NULL)
        OR (screening_status <> 'PENDING' AND screening_ref IS NOT NULL)),
    INDEX donation_donor_idx (donor_id, collected_at DESC)
) ENGINE=InnoDB;

-- Task: Track one whole unit per donation.
CREATE TABLE IF NOT EXISTS blood_unit (
    unit_id int AUTO_INCREMENT PRIMARY KEY,
    donation_id int NOT NULL UNIQUE,
    blood_group_id int NOT NULL,
    storage_id int NOT NULL,
    volume_ml decimal(7,2) NOT NULL,
    expires_at datetime(3) NOT NULL,
    status enum('QUARANTINED', 'AVAILABLE', 'ISSUED', 'DISCARDED') NOT NULL DEFAULT 'QUARANTINED',
    created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (donation_id) REFERENCES donation(donation_id),
    FOREIGN KEY (blood_group_id) REFERENCES blood_group(blood_group_id),
    FOREIGN KEY (storage_id) REFERENCES storage(storage_id),
    CHECK (volume_ml > 0),
    INDEX blood_unit_available_idx (status, blood_group_id, expires_at, unit_id),
    INDEX blood_unit_storage_idx (storage_id, status)
) ENGINE=InnoDB;

-- Task: Keep immutable unit-test results.
CREATE TABLE IF NOT EXISTS blood_test (
    test_id int AUTO_INCREMENT PRIMARY KEY,
    unit_id int NOT NULL,
    tested_by int NOT NULL,
    test_type varchar(60) NOT NULL,
    result enum('PASS', 'FAIL') NOT NULL,
    tested_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (unit_id) REFERENCES blood_unit(unit_id),
    FOREIGN KEY (tested_by) REFERENCES staff(staff_id),
    UNIQUE (unit_id, test_type),
    CHECK (char_length(trim(test_type)) > 0)
) ENGINE=InnoDB;

-- Task: Store hospital reference details.
CREATE TABLE IF NOT EXISTS hospital (
    hospital_id int AUTO_INCREMENT PRIMARY KEY,
    hospital_name varchar(120) NOT NULL UNIQUE,
    phone varchar(30),
    email varchar(160),
    location text NOT NULL,
    status enum('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE'
) ENGINE=InnoDB;

-- Task: Track requested quantity and verification.
CREATE TABLE IF NOT EXISTS blood_request (
    request_id int AUTO_INCREMENT PRIMARY KEY,
    hospital_id int NOT NULL,
    blood_group_id int NOT NULL,
    requested_units int NOT NULL,
    priority enum('NORMAL', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    request_type enum('WHOLE_BLOOD') NOT NULL DEFAULT 'WHOLE_BLOOD',
    requested_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    required_at datetime(3) NOT NULL,
    status enum('PENDING', 'VERIFIED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    verified_by int,
    verified_at datetime(3),
    FOREIGN KEY (hospital_id) REFERENCES hospital(hospital_id),
    FOREIGN KEY (blood_group_id) REFERENCES blood_group(blood_group_id),
    FOREIGN KEY (verified_by) REFERENCES staff(staff_id),
    CHECK (requested_units > 0),
    CHECK (required_at >= requested_at),
    CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
    CHECK (status NOT IN ('VERIFIED', 'PARTIALLY_FULFILLED', 'FULFILLED') OR verified_by IS NOT NULL),
    INDEX blood_request_queue_idx (status, priority, required_at)
) ENGINE=InnoDB;

-- Task: Record one issuance batch per operation key.
CREATE TABLE IF NOT EXISTS blood_issue (
    issue_id int AUTO_INCREMENT PRIMARY KEY,
    request_id int NOT NULL,
    processed_by int NOT NULL,
    issued_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    issue_type enum('WHOLE_UNIT') NOT NULL DEFAULT 'WHOLE_UNIT',
    operation_key char(36) NOT NULL UNIQUE,
    FOREIGN KEY (request_id) REFERENCES blood_request(request_id),
    FOREIGN KEY (processed_by) REFERENCES staff(staff_id)
) ENGINE=InnoDB;

-- Task: Link issued units, preventing a second issue of the same bag.
CREATE TABLE IF NOT EXISTS issue_detail (
    issue_detail_id int AUTO_INCREMENT PRIMARY KEY,
    issue_id int NOT NULL,
    unit_id int NOT NULL UNIQUE,
    volume_issued_ml decimal(7,2) NOT NULL,
    issue_status enum('ISSUED') NOT NULL DEFAULT 'ISSUED',
    FOREIGN KEY (issue_id) REFERENCES blood_issue(issue_id),
    FOREIGN KEY (unit_id) REFERENCES blood_unit(unit_id),
    CHECK (volume_issued_ml > 0)
) ENGINE=InnoDB;

-- Technical tables supplement, rather than replace, the original 11 entities.
-- Task: Store hashed session tokens with expiry.
CREATE TABLE IF NOT EXISTS app_session (
    token_hash char(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    staff_id int NOT NULL,
    expires_at datetime(3) NOT NULL,
    created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (staff_id) REFERENCES staff(staff_id),
    INDEX app_session_expiry_idx (expires_at)
) ENGINE=InnoDB;

-- Task: Limit repeated failed password attempts.
CREATE TABLE IF NOT EXISTS login_attempt (
    username varchar(50) COLLATE utf8mb4_0900_as_cs PRIMARY KEY,
    failures int NOT NULL DEFAULT 0,
    window_start datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CHECK (failures >= 0)
) ENGINE=InnoDB;

-- Task: Keep a record of database changes.
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id bigint AUTO_INCREMENT PRIMARY KEY,
    table_name varchar(64) NOT NULL,
    record_id varchar(30) NOT NULL,
    action varchar(10) NOT NULL,
    actor_id int,
    old_data json,
    new_data json,
    happened_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (actor_id) REFERENCES staff(staff_id),
    INDEX audit_log_time_idx (happened_at DESC)
) ENGINE=InnoDB;
