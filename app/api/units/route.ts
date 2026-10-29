import { unitsTask } from '@/lib/tasks/units';
import { endpoint } from '@/lib/http';
import { getUnits } from '@/lib/tasks/queries';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = endpoint((req, actor) => getUnits(req, actor));

export const POST = endpoint((req, actor) => unitsTask(req, actor));
