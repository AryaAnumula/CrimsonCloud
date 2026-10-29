import { NextRequest } from 'next/server';
import { transaction } from '@/lib/db';
import { Actor, admin } from '@/lib/auth';
import { body, ok, missing } from '@/lib/http';
import * as v from '@/lib/validation';

// Task group: storage. Each branch performs one named operation.
export async function storageTask(req: NextRequest, actor: Actor, rawId?: string, action = '') {
  const key = rawId ? v.id.parse(rawId) : 0;
  const data = req.method === 'DELETE' ? {} : await body(req);
  const result = await transaction(actor.staff_id, async db => {
    if (!key) {
      admin(actor); const d = v.storageInput.parse(data);
      const r = await db.query(`INSERT INTO storage (location_name,storage_type,temperature_c,capacity_units)
        VALUES (?,?,?,?) `, [d.location_name,d.storage_type,d.temperature_c,d.capacity_units]);
      return { storage_id: r.insertId };
    }
    return missing();
  });
  return ok(result);
}
