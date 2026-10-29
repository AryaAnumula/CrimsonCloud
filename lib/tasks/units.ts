import { NextRequest } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/lib/db';
import { Actor } from '@/lib/auth';
import { body, ok, missing } from '@/lib/http';
import * as v from '@/lib/validation';

// Task group: units. Each branch performs one named operation.
export async function unitsTask(req: NextRequest, actor: Actor, rawId?: string, action = '') {
  const key = rawId ? v.id.parse(rawId) : 0;
  const data = req.method === 'DELETE' ? {} : await body(req);
  const result = await transaction(actor.staff_id, async db => {
    if (action === 'tests') {
      const d = v.testInput.parse(data);
      const r = await db.query(`INSERT INTO blood_test (unit_id,tested_by,test_type,result) VALUES (?,?,?,?)`, [key,actor.staff_id,d.test_type,d.result]);
      return { test_id: r.insertId };
    }
    if (['release','discard','move'].includes(action)) {
      let r;
      if (action === 'move') {
        const d = z.object({ storage_id: v.id }).parse(data);
        r = await db.query(`UPDATE blood_unit SET storage_id = ? WHERE unit_id = ? AND status IN ('QUARANTINED','AVAILABLE') `, [d.storage_id,key]);
      } else r = await db.query(`UPDATE blood_unit SET status = ? WHERE unit_id = ? AND status IN ('QUARANTINED','AVAILABLE') `, [action === 'release' ? 'AVAILABLE' : 'DISCARDED',key]);
      if (!r.rowCount) return missing();
      return { message: action === 'release' ? 'Unit released' : action === 'move' ? 'Unit moved' : 'Unit discarded' };
    }
    return missing();
  });
  return ok(result);
}
