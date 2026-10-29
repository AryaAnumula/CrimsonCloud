import { endpoint } from '@/lib/http';
import { getReportsScreening } from '@/lib/tasks/queries';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = endpoint((req, actor) => getReportsScreening(req, actor));
