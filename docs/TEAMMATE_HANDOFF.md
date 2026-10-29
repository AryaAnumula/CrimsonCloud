# Teammate handoff — Blood Bank Management System

Read this first, then `README.md`. This note says where the project stands, what is already
verified, and exactly what is left for the second half of the team.

## Where we are

- Repository: `main` with three commits — the shared base, the rewritten DDL demonstration, and
  setup hardening.
- Database layer is **finished and verified** on MySQL 8.0.46 and MongoDB 8.0.34.
- The application runs locally and both roles can sign in.
- Nothing here is a promise: everything listed under "verified" was executed against a real
  server, and `docs/VERIFICATION.md` records it with the date.

## What is done (first half — database and setup)

| Area | State |
| --- | --- |
| Schema | 15 tables, primary/foreign keys, `CHECK` and `UNIQUE` constraints, indexes — `database/01_schema.sql` |
| Workflows | 30 triggers, 1 function, 1 procedure (atomic `issue_blood`), 3 views — `database/02_workflows.sql` |
| DDL task | CREATE / ALTER / DROP with keys, constraints, index and view on a throwaway schema — `database/03_ddl_demo.sql` |
| DML task | JOIN, GROUP BY/HAVING, subquery, ORDER BY, aggregates, `EXPLAIN`, index evidence — `database/04_important_queries.sql` |
| NoSQL | `screening_submissions` with `$jsonSchema` validator, unique `submission_id`/`donation_id`, compound index; aggregation report — `docs/MONGODB_MODEL.md` |
| Setup tooling | `configure`, `db:setup`, `db:seed`, `db:sample`, `db:dictionary`, `db:reconcile` |
| Design docs | Chen ER (4 pages + poster), relational schema, data dictionary, schema decisions, API guide |

Verified on this machine: fresh `db:setup` + `db:seed`, admin and staff login, 401/403 paths,
Mongo validator rejecting a malformed document, aggregation, reconcile, DDL demo (24/24
statements), and 22 negative database checks that are correctly refused.

## What is left (second half — your part)

### 1. Run the project and record the executed tests

Follow `docs/WORKFLOW_AND_TESTS.md` end to end in the browser, then fill the table at the bottom
with **actual** results. Include at least one case you deliberately broke and fixed. A blank
"actual result" cell is better than an invented one.

### 2. Take your own screenshots

`docs/screenshots/` currently holds two images from the author's machine. Add yours: sign-in,
stock table, request → verify → issue, and the MongoDB screening report. Name them clearly, for
example `02_stock_table.png`.

### 3. Write the report

Create `docs/REPORT.md` following the outline in `docs/PROJECT_REPORT_GUIDE.md`: objectives,
functional requirements, scope, database choice and justification, system architecture
(browser → Next.js page → route handlers → MySQL; screening documents → MongoDB), important
queries with explained output, testing, conclusion and future work.

### 4. One database-facing feature of your own

Pick one, implement it, and keep it small:

- **Expiring soon:** a SQL view `expiring_soon` (released, unexpired, `expires_at` within 7 days),
  a `GET /api/reports/expiring` route, and a small panel in the UI.
- **Screening search:** a MongoDB text index on `answers.review_note` plus a search endpoint and
  a UI filter. This gives the project a seventh advanced feature.

This matters for the mark scheme: the requirements ask both members to contribute to database
*and* application work, so your commits should touch both.

### 5. Contribution table

Fill the table in `docs/PROJECT_REPORT_GUIDE.md` with real commit hashes once your work is pushed.

## How to run it on your machine

```bash
npm ci
npm run configure          # creates .env once; keep it private
# edit .env: DATABASE_URL with your own MySQL user/password
npm run db:setup           # creates the schema, triggers, views, procedure, Mongo validator
npm run db:seed            # creates admin/staff logins and the 8 blood groups
PORT=3000 npm run dev      # http://localhost:3000
```

`PORT=3000` matters: if `PORT` is already set in your shell, Next.js binds a different port.

## Ground rules

- Commit from your own machine with your own git identity, in small commits. Explain *why* in the
  message, not just what changed.
- Never commit `.env`. Never paste a password into a commit, a screenshot or the chat.
- Do not invent test results or screenshots. Failed cases stay in the table with a short note.
- `db:setup` is safe to re-run: applied files are checksum-recorded and skipped. If you edit
  `01_schema.sql` or `02_workflows.sql` after running it, use a fresh database name.
