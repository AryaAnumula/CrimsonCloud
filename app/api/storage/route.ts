import { storageTask } from '@/lib/tasks/storage';
import { endpoint } from '@/lib/http';
import { getStorage } from '@/lib/tasks/queries';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = endpoint((req, actor) => getStorage(req, actor));

export const POST = endpoint((req, actor) => storageTask(req, actor));
