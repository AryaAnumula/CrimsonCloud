import { NextRequest } from 'next/server';
import { transaction } from '@/lib/db';
import { Actor, admin } from '@/lib/auth';
import { body, ok, missing } from '@/lib/http';
import * as v from '@/lib/validation';

// Task: POST /api/hospitals — Admin-only creation of a hospital record.
// admin(actor) runs before the body is parsed, so a Staff account receives 403 without reaching the
// database. Requests reference hospitals, so this data is created before the first request.
export async function hospitalsTask(req: NextRequest, actor: Actor, rawId?: string, action = '') {
  const key = rawId ? v.id.parse(rawId) : 0;
  const data = req.method === 'DELETE' ? {} : await body(req);
  const result = await transaction(actor.staff_id, async db => {
    if (!key) {
      admin(actor); const d = v.hospitalInput.parse(data);
      const r = await db.query(`INSERT INTO hospital (hospital_name,location,phone,email) VALUES (?,?,?,?) `, [d.hospital_name,d.location,d.phone,d.email]);
      return { hospital_id: r.insertId };
    }
    return missing();
  });
  return ok(result);
}
