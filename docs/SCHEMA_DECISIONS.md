# Schema decisions — DBMS mini-project

## Retained model

The eleven domain tables follow the supplied handwritten ER sketch: blood_group, donor, staff, donation, blood_unit, storage, blood_test, hospital, blood_request, blood_issue and issue_detail. The accidentally supplied university schema is not used.

## Small completions and clarifications

- Explicit foreign keys complete donor–donation, donation–unit, unit–test, request–issue and issue–detail links. Staff collect donations, perform tests, verify requests and process issues.
- Donor 0..N donations; each donation has exactly one donor and collector. A donation generates 0..1 unit; each unit has exactly one donation. UNIQUE(donation_id) enforces this mini-project assumption.
- Each donor, unit and request has one blood group. A group may classify many rows. Unit group must agree with the donation's donor group; group reassignment after collection is blocked.
- One storage location holds many units. Each unit retains its location reference, even after issue/discard, for traceability. Only physically retained units count toward occupancy.
- A unit has 0..N test records, each performed by one staff member. Test history is immutable.
- Each request belongs to one hospital and may have 0..N issues. Each completed issue has 1..N details. Each detail refers to one unit, and UNIQUE(unit_id) prevents issuing the same bag twice.
- Request verification is optional until performed; verified_by and verified_at are paired.
- Added requested_units, explicit timestamps, screening_ref and operation_key close gaps in quantity tracking, document linkage and retry handling.
- Phone/email are single-valued for this version, instead of adding contact child tables. Email may be absent for a donor; non-null donor emails and staff emails are case-insensitively unique using MySQL collation.
- Staff credentials remain on staff, with a password hash, not a plaintext password. Technical app_session, login_attempt, audit_log and setup checksum tables support the application; they are not extra blood-bank domain entities.

## Database choice and normalization

**MySQL 8.4 / InnoDB** stores structured operational data: joins, referential integrity and atomic issuance belong here. Use int AUTO_INCREMENT keys, decimal quantities, enum states and UTC datetime(3) timestamps. Logical dependencies are separated into their own tables rather than copying donor/hospital details into every transaction. Blood group names and staff details are referenced by keys.

Document normalization through 1NF, 2NF and 3NF using the actual functional dependencies. Note two deliberate redundancies rather than claiming every column is perfectly normalized: unit blood_group_id supports direct stock filtering and is guarded against inconsistency; storage occupied_units is a maintained counter with capacity guards, not independent user input. Request status is also maintained with fulfillment rules. Diagram attributes and the SQL data dictionary describe the physical implementation.

**MongoDB** stores versioned, nested screening questionnaire answers, including optional follow-up data. Collection screening_submissions has unique submission_id and donation_id indexes, a validation schema and a form_version/decision index. Retrieval is by donation/submission ID; aggregation groups documents by version and recorded decision. SQL stores the final screening decision plus the document reference. This is the only NoSQL feature needed; vector search is not added without a reason.

## Workflow rules

1. Record donation and quarantined unit together in a SQL transaction.
2. Store the reviewed questionnaire in MongoDB and record the final decision in MySQL. No clinical eligibility is automatically inferred.
3. A unit can become AVAILABLE only after approved screening and a passing SCREENING_PANEL test; a failure blocks release.
4. Verify a hospital request before issuance. Call issue_blood outside a surrounding transaction: the procedure owns START TRANSACTION, COMMIT and rollback handling.
5. Lock the request, select unexpired AVAILABLE exact-group units from active storage in expiry order, and write header/details atomically. A shortage rolls back the batch. Separate batches may partially fulfill a request.
6. Issue details and historical tests cannot be edited/deleted. Cancellation preserves earlier issues. Only pending draft requests can be deleted.
7. Expiry is checked against time at retrieval/issue; expired bags still occupy storage until discarded.

The local setup uses the user's MySQL account. Application routes validate input and call controlled workflows, but a privileged SQL administrator can bypass application checks. This is not a hardened production security boundary. MongoDB and MySQL do not share a distributed transaction; reconciliation identifies orphan questionnaire documents after a partial failure.
