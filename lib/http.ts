import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Actor, HttpError, authenticate, checkOrigin } from './auth';

export const ok = (data: unknown, status = 200) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
});
export function missing(): never {
  throw new HttpError(404, 'Record not found or this action is not valid in its current state');
}
export async function body(req: NextRequest) {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 16384) throw new HttpError(413, 'Request is too large');
  try { return JSON.parse(raw); }
  catch { throw new HttpError(400, 'Send a valid JSON body'); }
}
type Params = Record<string, string>;
type Task = (req: NextRequest, actor: Actor, params: Params) => Promise<NextResponse>;

// Shared API plumbing only. Named task files contain the actual database work.
export function endpoint(task: Task, publicLogin = false) {
  return async (req: NextRequest, context: { params: Promise<Params> }) => {
    try {
      if (req.method !== 'GET') checkOrigin(req);
      const actor = publicLogin ? null : await authenticate(req);
      return await task(req, actor as Actor, await context.params || {});
    } catch (err: unknown) {
    if (err instanceof HttpError) return ok({ error: err.message },err.status);
    if (err instanceof z.ZodError) return ok({ error: err.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') },400);
    const e = err as { code?: string; message?: string; name?: string };
    if (e.code === 'ER_SIGNAL_EXCEPTION') return ok({ error: e.message },409);
    if (e.code === 'ER_DUP_ENTRY' || e.code === '11000' || (e as unknown as {code: number}).code === 11000) return ok({ error: 'This record or submission already exists' },409);
    if (['ER_NO_REFERENCED_ROW_2','ER_ROW_IS_REFERENCED_2'].includes(e.code || '')) return ok({ error: 'A linked record is missing or still in use' },409);
    if (['ER_CHECK_CONSTRAINT_VIOLATED','ER_BAD_NULL_ERROR','ER_WARN_DATA_OUT_OF_RANGE','ER_TRUNCATED_WRONG_VALUE','WARN_DATA_TRUNCATED'].includes(e.code || '')) return ok({ error: 'Database validation failed. Check required values, dates, quantities and statuses.' },400);
    if (['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','ER_QUERY_TIMEOUT'].includes(e.code || '')) return ok({ error: 'The record is busy. Refresh and retry the same operation key.' },409);
    console.error('API failure:', e.name, e.code, e.message);
    return ok({ error: 'A database service is unavailable or the operation failed. Nothing was marked complete. Check server logs and retry.' },503);
    }
  };
}
