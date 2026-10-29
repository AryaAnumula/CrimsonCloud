import { NextRequest } from 'next/server';
import { hash } from 'bcryptjs';
import { transaction } from '@/lib/db';
import { Actor, admin } from '@/lib/auth';
import { body, ok, missing } from '@/lib/http';
import * as v from '@/lib/validation';

// Task group: staff. Each branch performs one named operation.
export async function staffTask(req: NextRequest, actor: Actor, rawId?: string, action = '') {
  const key = rawId ? v.id.parse(rawId) : 0;
  const data = req.method === 'DELETE' ? {} : await body(req);
  const result = await transaction(actor.staff_id, async db => {
    if (!key) {
      admin(actor); const d = v.staffInput.parse(data); const passwordHash = await hash(d.password,12);
      const r = await db.query(`INSERT INTO staff (name,username,email,phone,role,password_hash) VALUES (?,?,?,?,?,?) `, [d.name,d.username,d.email,d.phone,d.role,passwordHash]);
      return { staff_id: r.insertId };
    }
    return missing();
  });
  return ok(result);
}
