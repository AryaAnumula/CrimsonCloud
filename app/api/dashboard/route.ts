import { endpoint } from '@/lib/http';
import { getDashboard } from '@/lib/tasks/queries';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = endpoint((req, actor) => getDashboard(req, actor));
