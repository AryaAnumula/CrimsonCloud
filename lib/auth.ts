import { createHash, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { pool } from './db';
export const sessionCookie = 'bbms_session';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export type Actor = { staff_id: number; name: string; username: string; role: 'ADMIN' | 'STAFF' };
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function authenticate(req: NextRequest): Promise<Actor> {
  const token = req.cookies.get(sessionCookie)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) throw new HttpError(401, 'Please sign in');
  const { rows } = await pool.query(`SELECT s.staff_id, s.name, s.username, s.role
    FROM app_session a JOIN staff s USING (staff_id)
    WHERE token_hash = ? AND expires_at > now() AND s.status = 'ACTIVE'`, [digest(token)]);
  if (!rows[0]) throw new HttpError(401, 'Your session expired. Please sign in again.');
  return rows[0];
}
export function admin(actor: Actor) {
  if (actor.role !== 'ADMIN') throw new HttpError(403, 'Admin access required');
}
export function checkOrigin(req: NextRequest) {
  const expected = process.env.APP_ORIGIN || req.nextUrl.origin;
  if (req.headers.get('origin') !== expected) throw new HttpError(403, 'Request origin is not allowed');
}
