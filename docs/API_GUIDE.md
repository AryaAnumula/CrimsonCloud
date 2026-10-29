# Next.js API and task map

All application requests are Next.js Route Handlers, not an Express service. Each concrete route names a function in lib/tasks. lib/http.ts performs shared authentication/origin/error handling; lib/validation.ts validates input. Queries are parameterized. Database credentials stay server-side.

| Endpoint | Method | Task / storage |
| --- | --- | --- |
| /api/login | POST | Compare bcrypt hash; create MySQL session and HttpOnly cookie |
| /api/logout | POST | Delete the current MySQL session |
| /api/me | GET | Read signed-in account, without its password hash |
| /api/donors | GET / POST | List/filter donors; register donor in MySQL |
| /api/donations | GET / POST | List donations; create collection + quarantined unit transactionally |
| /api/donations/[id]/screening | POST | Store immutable Mongo questionnaire, finalize SQL decision/reference |
| /api/units | GET | Inventory view, optional status/q filters |
| /api/units/[id]/tests | POST | Insert a unit test; trigger validates state/tester |
| /api/units/[id]/release or discard or move | POST | Validated state/storage task, not an arbitrary UPDATE |
| /api/tests | GET | Test history |
| /api/requests | GET / POST | Request-progress view; create request |
| /api/requests/[id]/verify or cancel | POST | Controlled request state transition |
| /api/requests/[id]/issue | POST | CALL issue_blood outside a caller transaction |
| /api/requests/[id] | DELETE | Delete only an unverified pending draft |
| /api/groups, /api/storage, /api/hospitals | GET | Reference data |
| /api/storage, /api/hospitals, /api/staff | POST | Admin-only reference/account creation; bcrypt for new password |
| /api/staff | GET | Admin-only staff list, without hashes |
| /api/dashboard | GET | MySQL stock and operational counts |
| /api/screenings | GET | Mongo documents; optional donation_id/decision filters; at most 100 |
| /api/reports/screening | GET | Mongo $group/$sum aggregation |
| /api/reports/traceability | GET | MySQL unit-to-donor/request/hospital joins |
| /api/reports/audit | GET | Admin-only SQL audit history |

Every route except login requires a valid session. Mutation requests require the configured APP_ORIGIN. Staff can perform operational work; reference/account creation and audit are Admin-only. No endpoint accepts arbitrary SQL. Lists are bounded, not a pagination implementation.

Read this order to explain the backend: app/api/donations/route.ts → lib/tasks/donations.ts → lib/db.ts → database/01_schema.sql and 02_workflows.sql. For NoSQL: donation screening task → lib/mongo.ts → screening retrieval task/aggregation.

The issue procedure owns START TRANSACTION/COMMIT/ROLLBACK. Questionnaire persistence and SQL finalization are not a distributed transaction; see SCHEMA_DECISIONS.md and db:reconcile. Stored questionnaire reports count documents, not released stock.
