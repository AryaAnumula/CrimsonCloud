import { endpoint } from '@/lib/http';
import { requestsTask } from '@/lib/tasks/requests';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = endpoint((req, actor, params) => requestsTask(req, actor, params.id, params.action));
