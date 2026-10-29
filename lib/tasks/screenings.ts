import { NextRequest } from 'next/server';
import { mongo } from '@/lib/mongo';
import { HttpError } from '@/lib/auth';
import { ok } from '@/lib/http';
import { id } from '@/lib/validation';

// Task: GET /api/screenings — read saved questionnaires straight from MongoDB; they are never
// reconstructed from SQL rows, which is what makes this the NoSQL half of the project.
// Both filters are optional: an unknown donation_id or decision is a 400 rather than an empty list,
// and the projection hides the internal _id and the payload hash from the browser.
export async function findScreenings(req: NextRequest) {
  const filter: Record<string, unknown> = {};
  const donation = req.nextUrl.searchParams.get('donation_id');
  const decision = req.nextUrl.searchParams.get('decision');
  if (donation) filter.donation_id = id.parse(donation);
  if (decision) {
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new HttpError(400, 'Invalid decision filter');
    filter.decision = decision;
  }
  const rows = await (await mongo()).collection('screening_submissions').find(filter, {
    projection: { _id: 0, payload_hash: 0 },
  }).sort({ submitted_at: -1 }).limit(100).toArray();
  return ok(rows);
}
