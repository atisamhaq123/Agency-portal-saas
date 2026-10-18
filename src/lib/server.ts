import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
export async function serverDb() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Supabase is not configured.');
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => jar.getAll(), setAll: (items) => { items.forEach(({ name, value, options }) => jar.set(name, value, options)); } } });
}
export function adminDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server database credentials are missing.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function ownerContext() {
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('Sign in to continue.');
  const { data: workspace } = await db.from('workspaces').select('*').eq('owner_id', user.id).single();
  if (!workspace) throw new Error('Only workspace owners can manage billing.');
  return { db, user, workspace };
}
