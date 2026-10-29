# Working-project workflow and validation

Complete README.md setup. Start from empty databases and add hospitals/storage as Admin, or load the separate optional sample dataset. All page forms use real database APIs; use fictional records for course testing.

## Full workflow

1. Register donor → record donation with future expiry and storage.
2. Save a MongoDB questionnaire and its linked SQL screening decision.
3. Record PASS for SCREENING_PANEL → release the unit.
4. Create hospital request → verify → issue whole units.
5. Inspect inventory, request progress and issue records.
6. Filter Reports by donation ID and retrieve the same MongoDB document; show nested answers and the aggregation.
7. Inspect SQL traceability, keys, constraints, views, triggers, function/procedure and indexes.
8. Run 03_ddl_demo.sql and selected 04_important_queries.sql tasks in Workbench. The DDL file creates its own demo schema, shows CREATE/ALTER/DROP with keys, constraints, an index and a view, then removes everything (MySQL commits DDL, so there is nothing to roll back). The final draft DML example in the queries file rolls back.
9. Show Staff denial of Admin-only operations. Explain genuine team contributions and limits.

## Record your own expected/actual results

| Case | Expected result | Actual result |
| --- | --- | --- |
| Valid collection → screening → passing panel → release | Unit AVAILABLE | |
| Release before approval/test or with failed test | Rejected | |
| Negative volume or zero requested units | Database rejects | |
| Invalid foreign key / future donor birth date | Database rejects | |
| Issue an unverified request | Rejected; no issue created | |
| Batch larger than eligible stock | Whole batch rolls back, including header/details/status/counters | |
| Two simultaneous issue attempts for one request | Request lock prevents over-issue | |
| Replay the same successful operation key | Original issue returned; no duplicate | |
| Attempt to edit/delete test or issue history | Rejected | |
| Discard retained unit | Occupancy decreases once | |
| Delete pending draft | Allowed; historical issues untouched | |
| Mongo donation/decision filter | Correct saved document and answers | |
| Malformed Mongo document | Validator rejects | |
| Wrong password / anonymous API request | Rejected | |
| Staff creates storage or reads audit | Forbidden | |
| Default initialization | Accounts/groups only; no fabricated stock | |

Compare counts before/after failed issuance, not only the error message. Do not run destructive tests against important records. npm run db:reconcile is read-only. This checklist is a test plan, not evidence that every item passed on your computer; VERIFICATION.md records the actual isolated checks performed for this handoff.
