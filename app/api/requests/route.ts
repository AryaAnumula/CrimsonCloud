import { requestsTask } from '@/lib/tasks/requests';
import { endpoint } from '@/lib/http';
import { getRequests } from '@/lib/tasks/queries';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = endpoint((req, actor) => getRequests(req, actor));

export const POST = endpoint((req, actor) => requestsTask(req, actor));
