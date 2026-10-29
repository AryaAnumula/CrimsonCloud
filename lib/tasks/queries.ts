import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { mongo } from '@/lib/mongo';
import { Actor, admin } from '@/lib/auth';
import { ok } from '@/lib/http';

// GET /api/me — the signed-in account, already resolved by authenticate(); no password hash.
export async function getMe(req: NextRequest, actor: Actor) {
  return ok(actor);
}

// GET /api/groups — the eight blood-group reference rows that fill every group selector.
export async function getGroups(req: NextRequest, actor: Actor) {
  return ok((await pool.query('SELECT * FROM blood_group ORDER BY blood_group_id')).rows);
}

// GET /api/dashboard — three reads in parallel: per-group available stock (the available_stock
// view), headline counters, and released units expiring within 7 days (the inventory view).
export async function getDashboard(req: NextRequest, actor: Actor) {
  const [stock, stats, due] = await Promise.all([
      pool.query('SELECT * FROM available_stock ORDER BY blood_group_id'),
      pool.query(`SELECT (SELECT count(*) FROM donor) AS donors,
        (SELECT count(*) FROM blood_unit WHERE status = 'QUARANTINED' AND expires_at > now()) AS quarantined,
        (SELECT count(*) FROM blood_request WHERE status IN ('PENDING','VERIFIED','PARTIALLY_FULFILLED')) AS open_requests,
        (SELECT count(*) FROM blood_unit WHERE status = 'ISSUED') AS issued`),
      pool.query(`SELECT unit_id, group_name, expires_at, location_name FROM inventory
        WHERE display_status = 'AVAILABLE' AND expires_at < DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY) ORDER BY expires_at LIMIT 50`),
    ]);
    return ok({ stock: stock.rows, stats: stats.rows[0], due: due.rows });
}

// GET /api/donors?q= — name or phone search. Search text is bound as a parameter, never pasted into
// the SQL string, and the result is capped at 300 rows.
export async function getDonors(req: NextRequest, actor: Actor) {
  const q = (req.nextUrl.searchParams.get('q') || '').slice(0, 100);
  return ok((await pool.query(`SELECT d.*, b.group_name FROM donor d JOIN blood_group b USING (blood_group_id)
    WHERE d.name LIKE ? OR coalesce(d.phone,'') LIKE ? ORDER BY donor_id DESC LIMIT 300`, [`%${q}%`, `%${q}%`])).rows);
}

// GET /api/donations — collections with their donor, blood group and resulting unit, newest first.
export async function getDonations(req: NextRequest, actor: Actor) {
  return ok((await pool.query(`SELECT d.*, n.name AS donor_name, b.group_name,
    u.unit_id, u.status AS unit_status FROM donation d JOIN donor n USING (donor_id)
    JOIN blood_group b ON b.blood_group_id = n.blood_group_id LEFT JOIN blood_unit u USING (donation_id)
    ORDER BY d.donation_id DESC LIMIT 300`)).rows);
}

// GET /api/units?q=&status= — inventory rows with optional status and text filters; the text filter
// also matches an exact unit id, which is how staff look up one bag.
export async function getUnits(req: NextRequest, actor: Actor) {
  const q = (req.nextUrl.searchParams.get('q') || '').slice(0, 100);
  const status = req.nextUrl.searchParams.get('status') || '';
    return ok((await pool.query(`SELECT i.*, d.name AS donor_name FROM inventory i JOIN donor d USING (donor_id)
      WHERE (? = '' OR display_status = ?) AND (group_name LIKE ? OR d.name LIKE ? OR CAST(unit_id AS CHAR) = ?)
      ORDER BY expires_at, unit_id LIMIT 300`, [status, status, `%${q}%`, `%${q}%`, q])).rows);
}

// GET /api/tests — test history joined to the staff member who recorded each result.
export async function getTests(req: NextRequest, actor: Actor) {
  return ok((await pool.query(`SELECT t.*, s.name AS tester_name FROM blood_test t
    JOIN staff s ON s.staff_id = t.tested_by ORDER BY test_id DESC LIMIT 300`)).rows);
}

// GET /api/storage — locations with their capacity and occupied_units, both kept right by triggers.
export async function getStorage(req: NextRequest, actor: Actor) {
  return ok((await pool.query(`SELECT s.* FROM storage s ORDER BY storage_id`)).rows);
}

// GET /api/hospitals — hospital reference rows used when creating a request.
export async function getHospitals(req: NextRequest, actor: Actor) {
  return ok((await pool.query('SELECT * FROM hospital ORDER BY hospital_id')).rows);
}

// GET /api/requests — the request_progress view (requested vs issued vs remaining), urgent first,
// then earliest required_at.
export async function getRequests(req: NextRequest, actor: Actor) {
  return ok((await pool.query(`SELECT * FROM request_progress
    ORDER BY CASE priority WHEN 'URGENT' THEN 0 ELSE 1 END, required_at LIMIT 300`)).rows);
}

// GET /api/issues — issue headers with their units gathered by JSON_ARRAYAGG, so one row per issue
// lists every bag it contained.
export async function getIssues(req: NextRequest, actor: Actor) {
  return ok((await pool.query(`SELECT i.issue_id, i.request_id, i.issued_at, s.name AS processed_by,
    h.hospital_name, b.group_name, JSON_ARRAYAGG(d.unit_id) AS unit_ids, sum(d.volume_issued_ml) AS total_ml
    FROM blood_issue i JOIN staff s ON s.staff_id = i.processed_by JOIN blood_request r USING (request_id)
    JOIN hospital h USING (hospital_id) JOIN blood_group b USING (blood_group_id) JOIN issue_detail d USING (issue_id)
    GROUP BY i.issue_id, i.request_id, i.issued_at, s.name, h.hospital_name, b.group_name ORDER BY i.issue_id DESC LIMIT 300`)).rows);
}

// GET /api/staff — Admin only. The column list is explicit, so password_hash is never selected.
export async function getStaff(req: NextRequest, actor: Actor) {
  admin(actor);
    return ok((await pool.query('SELECT staff_id, name, username, email, phone, role, status FROM staff ORDER BY staff_id')).rows);
}

// GET /api/reports/traceability — unit → donation → donor → issue → hospital in one query: the
// answer to "where did this bag come from and where did it go", which is the demo's strongest SQL
// evidence.
export async function getReportsTraceability(req: NextRequest, actor: Actor) {
  return ok((await pool.query(`SELECT u.unit_id, b.group_name,
    n.name AS donor, d.donation_id, d.collected_at, u.expires_at, u.status,
    r.request_id, h.hospital_name, i.issued_at FROM blood_unit u JOIN blood_group b USING (blood_group_id)
    JOIN donation d USING (donation_id) JOIN donor n USING (donor_id)
    LEFT JOIN issue_detail x USING (unit_id) LEFT JOIN blood_issue i USING (issue_id)
    LEFT JOIN blood_request r USING (request_id) LEFT JOIN hospital h USING (hospital_id)
    ORDER BY u.unit_id DESC LIMIT 300`)).rows);
}

// GET /api/reports/screening — the MongoDB half: an aggregation ($group/$sum/$cond/$sort) that
// counts stored questionnaires by form version and decision, including recorded consent.
export async function getReportsScreening(req: NextRequest, actor: Actor) {
  const db = await mongo();
    const rows = await db.collection('screening_submissions').aggregate([
      { $group: { _id: { version: '$form_version', decision: '$decision' }, submissions: { $sum: 1 },
        consent_recorded: { $sum: { $cond: ['$answers.consent_recorded', 1, 0] } } } },
      { $sort: { '_id.version': 1, '_id.decision': 1 } },
    ]).toArray();
    // Submissions may precede SQL completion. This report deliberately counts stored
    // questionnaires, not released units or authoritative clinical approvals.
    return ok(rows);
}

// GET /api/reports/audit — Admin only; the last 100 rows the audit triggers wrote, i.e. who changed
// what and when.
export async function getReportsAudit(req: NextRequest, actor: Actor) {
  admin(actor);
    return ok((await pool.query('SELECT audit_id, table_name, record_id, action, actor_id, happened_at FROM audit_log ORDER BY audit_id DESC LIMIT 100')).rows);
}
