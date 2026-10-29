import { endpoint } from '@/lib/http';
import { signIn } from '@/lib/tasks/accounts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = endpoint((req) => signIn(req), true);
