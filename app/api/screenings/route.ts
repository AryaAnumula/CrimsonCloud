import { endpoint } from '@/lib/http';
import { findScreenings } from '@/lib/tasks/screenings';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = endpoint((req) => findScreenings(req));
