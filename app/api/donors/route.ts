import { donorsTask } from '@/lib/tasks/donors';
import { endpoint } from '@/lib/http';
import { getDonors } from '@/lib/tasks/queries';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = endpoint((req, actor) => getDonors(req, actor));

export const POST = endpoint((req, actor) => donorsTask(req, actor));
