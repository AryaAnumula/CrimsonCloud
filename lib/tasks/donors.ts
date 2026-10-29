import { NextRequest } from 'next/server';
import { transaction } from '@/lib/db';
import { Actor } from '@/lib/auth';
import { body, ok, missing } from '@/lib/http';
import * as v from '@/lib/validation';

// Task group: donors. Each branch performs one named operation.
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
