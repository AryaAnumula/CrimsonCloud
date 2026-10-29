import { createHash, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { pool } from './db';
export const sessionCookie = 'bbms_session';
// Hashes a session token before it is stored or looked up, so the raw token only ever exists in
// the browser cookie and never sits in MySQL (a stolen database dump cannot be replayed).
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
// 256 bits of randomness: the value handed to the browser as the session cookie.
export const newToken = () => randomBytes(32).toString('hex');
export type Actor = { staff_id: number; name: string; username: string; role: 'ADMIN' | 'STAFF' };
// An error that already knows its HTTP status, so handlers can just throw.
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
// Resolves the session cookie into the signed-in staff row: hashes the cookie, joins
// app_session to staff, and requires an unexpired session on an ACTIVE account.
// Throws 401 otherwise, so every protected route fails closed without repeating the check.
export async function authenticate(req: NextRequest): Promise<Actor> {
  const token = req.cookies.get(sessionCookie)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) throw new HttpError(401, 'Please sign in');
  const { rows } = await pool.query(`SELECT s.staff_id, s.name, s.username, s.role
    FROM app_session a JOIN staff s USING (staff_id)
    WHERE token_hash = ? AND expires_at > now() AND s.status = 'ACTIVE'`, [digest(token)]);
  if (!rows[0]) throw new HttpError(401, 'Your session expired. Please sign in again.');
  return rows[0];
}
// Role gate for Admin-only operations (creating staff, hospitals, storage; reading the audit log).
export function admin(actor: Actor) {
  if (actor.role !== 'ADMIN') throw new HttpError(403, 'Admin access required');
}
// Cheap CSRF guard: the cookie is SameSite=strict, and every state-changing request must also
// carry an Origin header equal to APP_ORIGIN. A missing or foreign origin is rejected with 403.
export function checkOrigin(req: NextRequest) {
  const expected = process.env.APP_ORIGIN || req.nextUrl.origin;
  if (req.headers.get('origin') !== expected) throw new HttpError(403, 'Request origin is not allowed');
}
