import { NextRequest } from 'next/server';
import { compare } from 'bcryptjs';
import { transaction, pool } from '@/lib/db';
import { body, ok } from '@/lib/http';
import { HttpError, digest, newToken, sessionCookie } from '@/lib/auth';
import * as v from '@/lib/validation';

// Task: sign in — check a bcrypt hash and create a MySQL session.
// Rate limited per username (5 failures inside 15 minutes → 429) with the counter kept in the
// login_attempt table, so it survives a restart. An unknown username still pays the bcrypt cost,
// so response time does not reveal whether the account exists.
export async function signIn(req: NextRequest) {
  const data = v.loginInput.parse(await body(req));
  // An unknown user still pays the bcrypt cost. Attempts persist across restarts.
  const fallback = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
  const result = await transaction(null, async db => {
    await db.query(`INSERT IGNORE INTO login_attempt (username) VALUES (?)`, [data.username]);
    const attempt = (await db.query('SELECT * FROM login_attempt WHERE username = ? FOR UPDATE', [data.username])).rows[0];
    const inWindow = new Date(attempt.window_start).getTime() > Date.now() - 15 * 60 * 1000;
    if (inWindow && attempt.failures >= 5) return { blocked: true };
    const user = (await db.query('SELECT * FROM staff WHERE username = ?', [data.username])).rows[0];
    const valid = await compare(data.password, user?.password_hash || fallback);
    if (!user || !valid || user.status !== 'ACTIVE') {
      await db.query(`UPDATE login_attempt SET failures = ?, window_start = ? WHERE username = ?`,
        [inWindow ? attempt.failures + 1 : 1, inWindow ? attempt.window_start : new Date(), data.username]);
      return { invalid: true };
    }
    await db.query('DELETE FROM login_attempt WHERE username = ?', [data.username]);
    await db.query('DELETE FROM app_session WHERE expires_at <= now()');
    const token = newToken();
    await db.query(`INSERT INTO app_session (token_hash, staff_id, expires_at) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 8 HOUR))`, [digest(token), user.staff_id]);
    return { token };
  });
  if (result.blocked) throw new HttpError(429, 'Too many attempts for this username. Try again after 15 minutes.');
  if (result.invalid || !result.token) throw new HttpError(401, 'Invalid username or password');
  const response = ok({ message: 'Signed in' });
  response.cookies.set(sessionCookie, result.token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 28800,
    secure: process.env.COOKIE_SECURE === 'true' });
  return response;
}


// Task: sign out — delete only this session row and clear the cookie. Other users, and this user's
// other sessions, are untouched.
export async function signOut(req: NextRequest) {
  const token = req.cookies.get(sessionCookie)?.value || '';
  await pool.query('DELETE FROM app_session WHERE token_hash = ?', [digest(token)]);
  const response = ok({ message: 'Signed out' });
  response.cookies.delete(sessionCookie);
  return response;
}
