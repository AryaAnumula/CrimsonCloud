# CrimsonCloud - Blood Bank Management System

A functional **DBMS mini-project using MySQL + MongoDB**, with a minimal desktop website and all application APIs implemented in Next.js. Forms write actual database records; tables and reports read those records. There are no mock API responses, hard-coded inventory results, Redis or PostgreSQL dependencies.

**Start here.** This README contains the setup, passwords, first-use workflow, database explanation and troubleshooting. The default initialization creates login accounts and blood-group reference rows only. Sample donors/stock are optional.

## 1. Requirements

Install these on your computer before running npm commands:

| Requirement | Version / purpose |
| --- | --- |
| Node.js and npm | Node.js 22 or newer; npm comes with Node.js |
| MySQL Community Server | MySQL 8.0 or newer; primary relational database (verified on 8.0.46 and 8.4) |
| MongoDB Community Server | MongoDB 7 or newer; screening documents |
| Desktop browser | Chrome, Edge, Firefox or another current browser |
| Optional database tools | MySQL Workbench and MongoDB Compass / mongosh |

Download installers from nodejs.org, dev.mysql.com/downloads/mysql and mongodb.com/try/download/community. MySQL Workbench/Compass alone are clients; you need the database **servers** running too. Start MySQL and MongoDB as local services. On Windows, they may appear as MySQL84 and MongoDB in Services; actual service names depend on installation. On Linux/macOS use your installation's service manager.

**Dependency files:** `package.json` lists the application's JavaScript dependencies and commands; `package-lock.json` pins their versions. Install them with `npm ci`. There is no Python requirements.txt because running this project does not need Python. Already-generated diagrams are included; regenerating them is optional.

## 2. Install and configure

Extract the ZIP, open a terminal in the `Blood_Bank_Management_System` folder, then run:

```bash
node --version
npm --version
npm ci
npm run configure
```

The configure command creates a private `.env` file and generates initial Admin/Staff passwords. It does not overwrite an existing file. Open `.env` in a text editor and replace the MySQL username/password placeholder with your local credentials.

```dotenv
DATABASE_URL=mysql://root:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:3306/blood_bank
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=blood_bank
ADMIN_PASSWORD=keep_the_value_generated_by_configure
STAFF_PASSWORD=keep_the_value_generated_by_configure
APP_ORIGIN=http://localhost:3000
COOKIE_SECURE=false
```

Do not copy these example password strings over your generated values. If a MySQL password contains `@`, encode it as `%40`; encode other URL-special characters as appropriate. Use your MongoDB connection URI if authentication or a different port is configured. The local MySQL account must be allowed to create databases/tables, views, triggers and routines; a local root account works for this project, but is not a production service-account setup.

Keep `.env` private and out of Git. It is excluded from the ZIP and `.gitignore` prevents normal accidental commits. `.env.example` is only a template and contains no working password.

## 3. Create the databases and initial accounts

With both database servers running:

```bash
npm run db:setup
npm run db:seed
npm run dev
```

Open **http://localhost:3000** on a desktop browser. Sign in with:

| Username | Password source |
| --- | --- |
| `admin` | `ADMIN_PASSWORD` in your private `.env` |
| `staff` | `STAFF_PASSWORD` in your private `.env` |

Setup creates the MySQL database if absent, applies SQL files 01/02, and creates the MongoDB collection validator/indexes. Initialization creates the two accounts and eight blood groups. Existing accounts are preserved rather than silently resetting their passwords.

### How passwords work

- MySQL `staff.password_hash` stores **bcrypt hashes with work factor 12**, never readable passwords.
- Next.js compares entered passwords using bcrypt. MongoDB does not store passwords.
- Login generates a random session token, stores only its SHA-256 hash in `app_session`, and sends the raw token in an HttpOnly, SameSite cookie. Sessions expire after eight hours; logout removes the current session.
- The backend checks the session, active account and role before protected operations. Admin-only actions are checked in the API, not only hidden in the page.
- The initial readable passwords in `.env` are local bootstrap secrets, not database password records. Do not upload that file or show it in screenshots. Changing `.env` later does **not** change an existing account's password. No password-reset feature is included.
- HTTP and `COOKIE_SECURE=false` are for localhost only. Do not expose this local project publicly or treat it as a hardened production/clinical system.

## 4. First use — create your own project records

1. Sign in as **admin**. In Administration, select **Add storage**, enter its name/type/temperature/capacity and submit. Temperature is recorded, not monitored by equipment.
2. Select **Add hospital**, enter its details and submit. These references are now available in collection/request forms.
3. In Donors and collections, choose **Register donor** and enter donor details.
4. Choose **Record donation**, select the donor and storage, enter volume and a future expiry.
5. Choose **Save screening**. Select the donation, record identity/consent answers, review note, optional follow-up and an explicit APPROVED/REJECTED decision. The form is stored in MongoDB; the final decision/reference is stored in MySQL.
6. Choose **Record test** and record a SCREENING_PANEL result for the quarantined unit. Choose **Release unit** only after approved screening and a passing panel; failed tests block release.
7. In Hospital requests and issues, choose **Create request**, enter hospital/group/quantity/deadline, then **Verify request**.
8. Choose **Issue blood** and enter the number of whole units. The MySQL procedure locks and selects eligible stock by earliest expiry. A shortage rolls back the entire issuance batch. Several batches may partially fulfill a request.
9. In Reports, optionally filter by donation ID/decision and click **Load reports**. View the actual MongoDB questionnaire, the Mongo aggregation and MySQL traceability. Admin also sees audit history.

One page, task dropdowns and one submit button per task keep navigation small. Staff can record operational work; only Admin can add hospitals/storage/accounts or access the audit report. Existing finalized tests/issues are deliberately not editable. Delete draft removes only an unverified request; discard is a terminal inventory action.

### Optional sample data — not required

On a fresh database with an empty donor register, you may run:

```bash
npm run db:sample
```

This inserts 24 fictional donors/units, two sample hospitals/storage locations, questionnaire documents and one pending request. Sixteen units are released and eight quarantined. It uses the same database rules as entered records. It refuses to mix sample donors into an existing donor register. Use a separate fresh database pair if you want sample data after entering your own records.

## 5. What each database does

**MySQL:** the eleven original domain tables—blood_group, donor, staff, donation, blood_unit, storage, blood_test, hospital, blood_request, blood_issue, issue_detail. Relationships, constraints, transactions, functions/procedure, triggers, indexes and views demonstrate the SQL work. Supporting session/login-attempt/audit/setup tables are documented separately.

**MongoDB:** one `screening_submissions` collection containing versioned questionnaire answers and optional nested follow-up notes. The website inserts, retrieves and filters real documents; the aggregation groups them by version/decision and counts recorded consent. Validation and unique submission/donation indexes prevent malformed or duplicate submissions.

MySQL is authoritative for final screening and inventory. There is **no distributed transaction** across the databases: MongoDB may retain an orphan document if a later SQL commit fails. Retry the same submission payload/key; `npm run db:reconcile` reports missing/orphan references and storage counter mismatches without modifying data. Do not overwrite finalized questionnaire history.

## 6. Files and database tasks

```text
README.md                          Complete setup and first-use guide
PREREQUISITES.md                    Short installation checklist
.env.example                       Environment template, no secrets
package.json / package-lock.json   npm commands and pinned dependencies
app/page.tsx / globals.css         Minimal single desktop page and plain CSS
app/api/                           Concrete Next.js Route Handlers
lib/tasks/                         Named account/donor/donation/unit/request tasks
lib/http.ts                        Shared auth/error/request plumbing
lib/db.ts / mongo.ts                Database connections and SQL transaction helper
lib/auth.ts / validation.ts         Sessions, roles and input validation
database/01_schema.sql              Tables, keys, constraints and indexes
database/02_workflows.sql           Functions, procedure, triggers and views
database/03_ddl_demo.sql            DDL task: CREATE / ALTER / DROP, keys, constraints, index, view on a throwaway schema
database/04_important_queries.sql   DML, JOIN, GROUP/HAVING, subquery and index evidence
database/05_mongodb_queries.js      Document retrieval, aggregation and index examples
scripts/                           Configure, setup, initialization, optional sample data
docs/diagrams/                     Chen + relational diagrams, PDF/SVG/PNG/DOT
docs/DATA_DICTIONARY.md             Actual MySQL column/key/constraint description
docs/API_GUIDE.md                   Route-to-task map and backend explanation
docs/MONGODB_MODEL.md               Document shape, indexes, validation and retrieval
docs/SCHEMA_DECISIONS.md            Model, normalization and consistency assumptions
docs/WORKFLOW_AND_TESTS.md          Operational workflow and validation checklist
docs/VERIFICATION.md                Recorded local checks, not invented results
docs/PROJECT_REPORT_GUIDE.md        Report/contribution outline
docs/source-materials/             Supplied requirements and original ER sketch
```

Task-based SQL comments explain what each block achieves and why locking/constraints are needed. Files 01/02 are applied by setup; do not run them again over an existing installation from Workbench. In Workbench select your database and run 03/04 to inspect concepts; 03 creates and then drops its own `blood_bank_ddl_demo` schema, and the final 04 DML example rolls back a disposable draft. Run 05 in mongosh after selecting the database named by MONGODB_DB.

Useful commands:

```bash
npm run typecheck       # TypeScript check
npm run build           # Build the actual application
npm start               # Run the built version instead of npm run dev
npm run db:dictionary   # Refresh the dictionary from your MySQL database
npm run db:reconcile    # Read-only cross-database and occupancy checks
```

## 7. Troubleshooting / upgrading from an earlier ZIP

- **Connection refused:** start both server services; check ports/URIs. SQL operational screens do not depend on a successful Mongo report, but screening requires MongoDB persistence.
- **`db:setup` stops at `MongoDB is not reachable`:** the MySQL files 01/02 were already applied in that run. Start MongoDB, then run `npm run db:setup` again; applied files are skipped by checksum, so nothing is duplicated.
- **`db:setup` stops at `Cannot sign in to MySQL`:** the server is up but the login is wrong. Fix the username/password in `DATABASE_URL` (URL-encode `@` as `%40` and so on) and run it again.
- **Access denied:** check URL-encoded MySQL credentials and local account privileges.
- **SQL file changed after setup:** setup uses checksums. For this revised project use fresh names, e.g. `blood_bank_v4` in BOTH the MySQL URL path and MONGODB_DB, then run setup/seed. Old ZIP test results do not validate a changed version.
- **Partial initial DDL failure:** MySQL DDL commits implicitly. Fix the privilege/configuration issue, then use fresh database names rather than assuming the failed DDL rolled back.
- **Login fails after changing .env:** seed does not reset existing passwords. Use original passwords or a fresh project database. Do not insert readable passwords into staff.
- **Origin not allowed:** use exactly http://localhost:3000. If changing port, update APP_ORIGIN to match and restart Next.js. localhost and 127.0.0.1 are different origins.
- **Port 3000 busy, or the server prints a different port:** close the other application, or run `PORT=3000 npm run dev`. If a `PORT` variable is already set in your terminal, Next.js uses it instead of 3000, and `APP_ORIGIN` must match that port exactly.
- **No choices in forms:** add hospitals/storage first; record a donor before a donation; only pending donations and appropriately staged units/requests appear for each task.
- **Cannot release/issue:** check approved screening, passing SCREENING_PANEL, no failed test, future expiry, active storage and verified request. The database enforces these rules even if a UI request is forged.

## 8. Boundaries and academic work

The application is functional but not clinically validated. It uses whole-blood/whole-unit issuance, exact-group matching and manually recorded expiry/screening/test decisions. It does not prescribe donor eligibility, real compatibility, test panels or shelf-life rules. Use synthetic data for the course; do not enter real health information.

No mobile app, hosting, real-time equipment integration, notifications, bag splitting or reservation subsystem is included. Maintain genuine team contributions and Git history, acknowledge assistance according to course rules and explain the schema/code in your own words. Confirm which supplied requirements PDF governs the final evaluation.
