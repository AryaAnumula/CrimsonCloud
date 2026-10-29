import { endpoint } from '@/lib/http';
import { getReportsTraceability } from '@/lib/tasks/queries';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = endpoint((req, actor) => getReportsTraceability(req, actor));
