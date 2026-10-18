import { NextResponse } from 'next/server';
import { isAuthRetryableFetchError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { serverDb } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const db = await serverDb(); const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError && !isAuthSessionMissingError(authError)) throw authError;
    if (!user) return NextResponse.json({ error: 'Sign in to your workspace.' }, { status: 401 });
    const { data: workspaceId, error: bootstrapError } = await db.rpc('bootstrap_workspace');
    if (bootstrapError) throw bootstrapError;
    const { data: workspace, error } = await db.from('workspaces').select('id,name,owner_id,plan,subscription_status').eq('id', workspaceId).single();
    if (error) throw error;
    const results = await Promise.all([
      db.from('projects').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      db.from('deliverables').select('*,projects!inner(workspace_id)').eq('projects.workspace_id', workspaceId).order('created_at', { ascending: false }),
      db.from('activity').select('*,projects!inner(workspace_id)').eq('projects.workspace_id', workspaceId).order('created_at', { ascending: false }).limit(30)
    ]);
    for (const result of results) if (result.error) throw result.error;
    return NextResponse.json({ workspace, projects: results[0].data, deliverables: results[1].data, activity: results[2].data, role: workspace.owner_id === user.id ? 'owner' : 'client', email: user.email }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Workspace load failed:', error instanceof Error ? error.message : 'Database request failed');
    const message = isAuthRetryableFetchError(error)
      ? 'Unable to reach the sign-in service. Please try again shortly.'
      : 'Unable to load your workspace. Confirm the Supabase migration and email verification are complete.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
