import { donationsTask } from '@/lib/tasks/donations';
import { endpoint } from '@/lib/http';
import { getDonations } from '@/lib/tasks/queries';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = endpoint((req, actor) => getDonations(req, actor));

export const POST = endpoint((req, actor) => donationsTask(req, actor));
