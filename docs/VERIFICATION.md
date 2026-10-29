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

## 29 October 2026 — real local install (MySQL 8.0.46, MongoDB 8.0.34, Windows)

First run of the project against the machine's own database servers, replacing the earlier isolated test instance.

- Passed: `npm run db:setup` created `blood_bank` from nothing — 15 tables, 3 views, 30 triggers, 2 routines
- Passed: MongoDB `screening_submissions` created with schema validator and 4 indexes (`_id_`, unique `submission_id_1`, unique `donation_id_1`, `form_version_1_decision_1`)
- Passed: Malformed document rejected by the validator (strict)
- Passed: Aggregation pipeline executes on the live collection
- Passed: `npm run db:reconcile` returns three empty result lists on the freshly seeded database
- Passed: `npm run db:seed` — 8 blood groups, 2 accounts, both bcrypt `$2b$12$` hashes
- Passed: `GET /` returns 200 with the sign-in page; wrong password returns 401
- Passed: `admin` and `staff` both sign in; `/api/me` returns the session identity; `/api/dashboard` returns 200
- Passed: `/api/me` without a session cookie returns 401
- Passed: Rewritten `database/03_ddl_demo.sql` — 24 statements (CREATE DATABASE/TABLE, ALTER add/unique/modify/drop, CREATE VIEW, DROP INDEX/COLUMN/FK/VIEW/TABLE/DATABASE) all execute; demo schema removed afterwards; the 15 project tables remain intact
- Passed: `database/04_important_queries.sql` — 18 statements execute on this install; the tables are still empty, so the demonstrations return no rows, and the final DML example rolls back
- Passed: Login flow against the real database — `POST /api/login` 200 with a session cookie, `/api/me` returns `admin`/`ADMIN`, `/api/dashboard` and `/api/units` 200, anonymous `/api/me` 401
- Passed: A POST whose `Origin` is `http://127.0.0.1:3000` is refused 403 because `APP_ORIGIN` is `http://localhost:3000`
- Not yet run on this machine: full click-through workflow, `database/05_mongodb_queries.js` (needs `mongosh`), operator-supplied screenshots

Desktop screenshots come from the actual application using isolated synthetic test records. Follow WORKFLOW_AND_TESTS.md for your own tests. All records in these checks are fictional; no clinical validation is claimed.

## Re-check on the student laptop (26 October 2026)

Environment: Windows 11, Node.js 22.19.0, npm 10.9.3, MySQL 8.0.46. Because the installed MySQL 8.0 root password was not yet available and MongoDB Community Server was not installed, the SQL checks used a throwaway MySQL instance (separate data directory inside the project, port 3307) created only for this run. That instance has since been deleted.

Passed on this machine:

- `npm ci`, `npm run typecheck` and `npm run build` (production build of all 23 routes)
- Fresh schema/workflows: 15 base tables, 3 views, 30 triggers, 1 function and 1 procedure
- `npm run db:seed`: two accounts stored as bcrypt `$2b$12$` hashes, eight blood groups
- Full SQL workflow: donor → donation → quarantined unit → test → approved screening → release → request → verify → `issue_blood` → unit ISSUED, request FULFILLED, storage counter returned to 0
- 22 of 22 negative checks refused as intended: shortage rolls back the whole batch, over-issue, release without approval or passing panel, duplicate test type, unit group mismatch, replaying an operation key (no duplicate), reusing a key with a different count, edits to issued units/tests/donations, deleting a verified request, future birth date, invalid blood group, overfull storage
- `database/03_ddl_demo.sql` and `database/04_important_queries.sql` execute on 8.0
- `npm run db:dictionary` regenerates `docs/DATA_DICTIONARY.md` byte-for-byte
- API over HTTP: login, session cookie, `/api/me`, dashboard, storage/hospital/donor/donation/request creation, request verification, draft deletion, traceability and audit reports, logout
- Anonymous request 401, cross-origin POST 403, wrong password 401, staff blocked from Admin-only routes with 403
- Screening save with MongoDB absent returns a clean 503 and leaves the donation unchanged
- `npm run db:setup` with MongoDB absent reports the missing server instead of a driver stack trace

Not verified on this machine (blocked on installs): MongoDB collection/validator creation, screening document storage, Mongo aggregation report, `npm run db:reconcile`, `database/05_mongodb_queries.js`, and the manual browser walkthrough. Repeat those once MongoDB Community Server and the MySQL login are in place.
