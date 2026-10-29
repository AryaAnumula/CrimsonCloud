import { NextRequest } from 'next/server';
import { transaction, withConnection } from '@/lib/db';
import { Actor } from '@/lib/auth';
import { body, ok, missing } from '@/lib/http';
import * as v from '@/lib/validation';

// Task: hospital requests and their fulfilment.
//   POST   /api/requests            — create a request in PENDING
//   POST   /api/requests/:id/verify — PENDING → VERIFIED; issuing is only allowed after this step
//   POST   /api/requests/:id/cancel — cancel the unissued balance, keeping already-issued history
//   DELETE /api/requests/:id        — delete a draft, only while it is still PENDING
//   POST   /api/requests/:id/issue  — CALL issue_blood(...), which opens and commits its own
//                                     transaction, so this branch deliberately does not wrap it again.
export async function requestsTask(req: NextRequest, actor: Actor, rawId?: string, action = '') {
  const key = rawId ? v.id.parse(rawId) : 0;
  const data = req.method === 'DELETE' ? {} : await body(req);
  // The issue procedure owns its transaction; do not wrap its CALL.
  if (action === 'issue') {
    const d = v.issueInput.parse(data);
    const r = await withConnection(actor.staff_id, db => db.query('CALL issue_blood(?,?,?,?)', [key,d.units,actor.staff_id,d.operation_key]));
    return ok(r.rows[0]);
  }
  const result = await transaction(actor.staff_id, async db => {
    if (!key) {
      const d = v.requestInput.parse(data);
      const r = await db.query(`INSERT INTO blood_request (hospital_id,blood_group_id,requested_units,priority,required_at)
        VALUES (?,?,?,?,?)`, [d.hospital_id,d.blood_group_id,d.requested_units,d.priority,new Date(d.required_at)]);
      return { request_id: r.insertId };
    }
    if (key) {
      if (req.method === 'DELETE') {
        const r = await db.query("DELETE FROM blood_request WHERE request_id = ? AND status = 'PENDING' ", [key]);
        if (!r.rowCount) return missing(); return { message: 'Unverified draft deleted' };
      }
      if (action === 'verify') {
        const r = await db.query(`UPDATE blood_request SET status = 'VERIFIED', verified_by = ?, verified_at = now()
          WHERE request_id = ? AND status = 'PENDING' `, [actor.staff_id,key]);
        if (!r.rowCount) return missing(); return { message: 'Request verified' };
      }
      if (action === 'cancel') {
        const r = await db.query(`UPDATE blood_request SET status = 'CANCELLED' WHERE request_id = ?
          AND status IN ('PENDING','VERIFIED','PARTIALLY_FULFILLED') `, [key]);
        if (!r.rowCount) return missing(); return { message: 'Unissued balance cancelled; existing issues are retained' };
      }
    }
    return missing();
  });
  return ok(result);
}
