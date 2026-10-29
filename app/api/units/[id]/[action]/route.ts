import { endpoint } from '@/lib/http';
import { unitsTask } from '@/lib/tasks/units';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = endpoint((req, actor, params) => unitsTask(req, actor, params.id, params.action));
