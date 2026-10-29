import { endpoint } from '@/lib/http';
import { donationsTask } from '@/lib/tasks/donations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = endpoint((req, actor, params) => donationsTask(req, actor, params.id, params.action));
