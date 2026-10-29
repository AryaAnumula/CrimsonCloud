# MySQL data dictionary

Exported from the actual MySQL schema. PK/UNI/MUL are MySQL key indicators; MUL can be a foreign-key or non-unique index. See explicit foreign keys below. Nullable unique email columns allow multiple NULLs. DATETIME(3) values are UTC by application convention. ENUM definitions show every supported option.

## app_session

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| token_hash | `char(64)` | NO | PRI | — | — |
| staff_id | `int` | NO | MUL | — | — |
| expires_at | `datetime(3)` | NO | MUL | — | — |
| created_at | `datetime(3)` | NO | — | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED |

## audit_log

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| audit_id | `bigint` | NO | PRI | — | auto_increment |
| table_name | `varchar(64)` | NO | — | — | — |
| record_id | `varchar(30)` | NO | — | — | — |
| action | `varchar(10)` | NO | — | — | — |
| actor_id | `int` | YES | MUL | — | — |
| old_data | `json` | YES | — | — | — |
| new_data | `json` | YES | — | — | — |
| happened_at | `datetime(3)` | NO | MUL | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED |

## blood_group

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| blood_group_id | `int` | NO | PRI | — | auto_increment |
| group_name | `varchar(3)` | NO | UNI | — | — |

## blood_issue

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| issue_id | `int` | NO | PRI | — | auto_increment |
| request_id | `int` | NO | MUL | — | — |
| processed_by | `int` | NO | MUL | — | — |
| issued_at | `datetime(3)` | NO | — | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED |
| issue_type | `enum('WHOLE_UNIT')` | NO | — | WHOLE_UNIT | — |
| operation_key | `char(36)` | NO | UNI | — | — |

## blood_request

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| request_id | `int` | NO | PRI | — | auto_increment |
| hospital_id | `int` | NO | MUL | — | — |
| blood_group_id | `int` | NO | MUL | — | — |
| requested_units | `int` | NO | — | — | — |
| priority | `enum('NORMAL','URGENT')` | NO | — | NORMAL | — |
| request_type | `enum('WHOLE_BLOOD')` | NO | — | WHOLE_BLOOD | — |
| requested_at | `datetime(3)` | NO | — | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED |
| required_at | `datetime(3)` | NO | — | — | — |
| status | `enum('PENDING','VERIFIED','PARTIALLY_FULFILLED','FULFILLED','CANCELLED')` | NO | MUL | PENDING | — |
| verified_by | `int` | YES | MUL | — | — |
| verified_at | `datetime(3)` | YES | — | — | — |

## blood_test

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| test_id | `int` | NO | PRI | — | auto_increment |
| unit_id | `int` | NO | MUL | — | — |
| tested_by | `int` | NO | MUL | — | — |
| test_type | `varchar(60)` | NO | — | — | — |
| result | `enum('PASS','FAIL')` | NO | — | — | — |
| tested_at | `datetime(3)` | NO | — | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED |

## blood_unit

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| unit_id | `int` | NO | PRI | — | auto_increment |
| donation_id | `int` | NO | UNI | — | — |
| blood_group_id | `int` | NO | MUL | — | — |
| storage_id | `int` | NO | MUL | — | — |
| volume_ml | `decimal(7,2)` | NO | — | — | — |
| expires_at | `datetime(3)` | NO | — | — | — |
| status | `enum('QUARANTINED','AVAILABLE','ISSUED','DISCARDED')` | NO | MUL | QUARANTINED | — |
| created_at | `datetime(3)` | NO | — | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED |

## donation

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| donation_id | `int` | NO | PRI | — | auto_increment |
| donor_id | `int` | NO | MUL | — | — |
| collected_at | `datetime(3)` | NO | — | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED |
| donation_type | `enum('WHOLE_BLOOD')` | NO | — | WHOLE_BLOOD | — |
| quantity_ml | `decimal(7,2)` | NO | — | — | — |
| collected_by | `int` | NO | MUL | — | — |
| collection_status | `enum('COLLECTED')` | NO | — | COLLECTED | — |
| screening_status | `enum('PENDING','APPROVED','REJECTED')` | NO | — | PENDING | — |
| screening_ref | `char(36)` | YES | UNI | — | — |

## donor

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| donor_id | `int` | NO | PRI | — | auto_increment |
| name | `varchar(100)` | NO | — | — | — |
| dob | `date` | NO | — | — | — |
| gender | `varchar(30)` | YES | — | — | — |
| weight_kg | `decimal(6,2)` | YES | — | — | — |
| phone | `varchar(30)` | YES | — | — | — |
| email | `varchar(160)` | YES | UNI | — | — |
| address | `text` | YES | — | — | — |
| blood_group_id | `int` | NO | MUL | — | — |

## hospital

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| hospital_id | `int` | NO | PRI | — | auto_increment |
| hospital_name | `varchar(120)` | NO | UNI | — | — |
| phone | `varchar(30)` | YES | — | — | — |
| email | `varchar(160)` | YES | — | — | — |
| location | `text` | NO | — | — | — |
| status | `enum('ACTIVE','INACTIVE')` | NO | — | ACTIVE | — |

## issue_detail

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| issue_detail_id | `int` | NO | PRI | — | auto_increment |
| issue_id | `int` | NO | MUL | — | — |
| unit_id | `int` | NO | UNI | — | — |
| volume_issued_ml | `decimal(7,2)` | NO | — | — | — |
| issue_status | `enum('ISSUED')` | NO | — | ISSUED | — |

## login_attempt

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| username | `varchar(50)` | NO | PRI | — | — |
| failures | `int` | NO | — | 0 | — |
| window_start | `datetime(3)` | NO | — | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED |

## schema_migration

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| filename | `varchar(100)` | NO | PRI | — | — |
| checksum | `char(64)` | NO | — | — | — |
| applied_at | `datetime(3)` | NO | — | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED |

## staff

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| staff_id | `int` | NO | PRI | — | auto_increment |
| name | `varchar(100)` | NO | — | — | — |
| phone | `varchar(30)` | YES | — | — | — |
| email | `varchar(160)` | NO | UNI | — | — |
| username | `varchar(50)` | NO | UNI | — | — |
| password_hash | `varchar(60)` | NO | — | — | — |
| role | `enum('ADMIN','STAFF')` | NO | — | — | — |
| status | `enum('ACTIVE','INACTIVE')` | NO | — | ACTIVE | — |

## storage

| Column | MySQL type | Nullable | Key | Default | Extra |
| --- | --- | --- | --- | --- | --- |
| storage_id | `int` | NO | PRI | — | auto_increment |
| location_name | `varchar(100)` | NO | UNI | — | — |
| storage_type | `varchar(50)` | NO | — | — | — |
| temperature_c | `decimal(5,2)` | NO | — | — | — |
| capacity_units | `int` | NO | — | — | — |
| occupied_units | `int` | NO | — | 0 | — |
| status | `enum('ACTIVE','INACTIVE')` | NO | — | ACTIVE | — |

## Foreign keys

| Foreign key | References |
| --- | --- |
| app_session.staff_id | staff.staff_id |
| audit_log.actor_id | staff.staff_id |
| blood_issue.processed_by | staff.staff_id |
| blood_issue.request_id | blood_request.request_id |
| blood_request.blood_group_id | blood_group.blood_group_id |
| blood_request.hospital_id | hospital.hospital_id |
| blood_request.verified_by | staff.staff_id |
| blood_test.tested_by | staff.staff_id |
| blood_test.unit_id | blood_unit.unit_id |
| blood_unit.blood_group_id | blood_group.blood_group_id |
| blood_unit.donation_id | donation.donation_id |
| blood_unit.storage_id | storage.storage_id |
| donation.collected_by | staff.staff_id |
| donation.donor_id | donor.donor_id |
| donor.blood_group_id | blood_group.blood_group_id |
| issue_detail.issue_id | blood_issue.issue_id |
| issue_detail.unit_id | blood_unit.unit_id |

Other constraints, indexes, views, triggers and the issuance procedure are defined in database/01_schema.sql and database/02_workflows.sql.
