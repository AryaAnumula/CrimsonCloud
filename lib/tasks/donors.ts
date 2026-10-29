import { NextRequest } from 'next/server';
import { transaction } from '@/lib/db';
import { Actor } from '@/lib/auth';
import { body, ok, missing } from '@/lib/http';
import * as v from '@/lib/validation';

// Task: donor registration.
//   POST /api/donors — insert one donor. The blood group must exist (foreign key), and the database
//   itself refuses impossible values such as a future birth date or an out-of-range weight through
//   its CHECK constraints and triggers, so a bad form cannot create a row even if the API is bypassed.
// A donor has no other operation, so a URL id falls through to the shared 404.
export async function donorsTask(req: NextRequest, actor: Actor, rawId?: string, action = '') {
  const key = rawId ? v.id.parse(rawId) : 0;
  const data = req.method === 'DELETE' ? {} : await body(req);
  const result = await transaction(actor.staff_id, async db => {
    if (!key) {
      const d = v.donorInput.parse(data);
      const r = await db.query(`INSERT INTO donor (name,dob,gender,weight_kg,phone,email,address,blood_group_id)
        VALUES (?,?,?,?,?,?,?,?) `, [d.name,d.dob,d.gender,d.weight_kg ?? null,d.phone,d.email,d.address,d.blood_group_id]);
      return { donor_id: r.insertId };
    }
    return missing();
  });
  return ok(result);
}
