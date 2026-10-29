# Working-project verification

Verified on an isolated synthetic MySQL 8.4.10 / MongoDB 8.2.6 database, with Node.js v24.22.1. These are smoke checks, not a production security certification.

- Passed: Fresh MySQL schema/workflows and Mongo validator/index setup
- Passed: Unchanged setup rerun
- Passed: Clean initialization: no donors/stock, eight groups, two accounts with verified bcrypt-12 hashes
- Passed: Optional sample insertion respects database rules
- Passed: Data dictionary generated from actual revised schema
- Passed: Next.js production build and TypeScript
- Passed: Anonymous access and incorrect password rejected
- Passed: Admin login and all operational MySQL data endpoints
- Passed: Release rejected before approval and passing test
- Passed: Donor → donation → Mongo review → MySQL test → release
- Passed: Actual Mongo document retrieved with donation/decision filters; invalid filter rejected
- Passed: Admin creates hospitals/storage/staff; new password stored as a working bcrypt hash
- Passed: Verified request → atomic issue → ledger
- Passed: SQL traceability, Mongo aggregation and admin audit reports
- Passed: Database rejects zero request quantity
- Passed: Database rejects negative donation volume
- Passed: Database rejects unknown foreign key
- Passed: Database rejects future birth date
- Passed: Database rejects edits to test history
- Passed: Database rejects deleting issue history
- Passed: 03_ddl_demo.sql executes successfully
- Passed: 04_important_queries.sql executes successfully
- Passed: Shortage rolls back header, details and unit updates
- Passed: Unverified request cannot be issued
- Passed: Two simultaneous attempts on one request: exactly one succeeds
- Passed: Retry operation key returns original issue without duplication
- Passed: Discard workflow and counter update
- Passed: Occupancy remains consistent after failure, concurrency and discard
- Passed: Mongo aggregation works and schema rejects malformed documents
- Passed: Chen four-page PDF and relational schema PDF open correctly
- Passed: Storage counter matches retained stock
- Passed: Full desktop form workflow: donor → donation → nested Mongo screening → test → release → request → verify → issue, filtered reports, administration and logout
- Passed: Staff denied audit and Admin-only reference creation

- Passed: Configuration generates required environment fields and random bootstrap passwords without overwriting an existing file

Desktop screenshots come from the actual application using isolated synthetic test records. Follow WORKFLOW_AND_TESTS.md for your own tests. All records in these checks are fictional; no clinical validation is claimed.
