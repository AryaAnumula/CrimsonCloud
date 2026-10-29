import { staffTask } from '@/lib/tasks/staff';
import { endpoint } from '@/lib/http';
import { getStaff } from '@/lib/tasks/queries';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = endpoint((req, actor) => getStaff(req, actor));

export const POST = endpoint((req, actor) => staffTask(req, actor));
