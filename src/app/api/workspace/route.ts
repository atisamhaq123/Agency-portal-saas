import { NextResponse } from 'next/server';
import { isAuthRetryableFetchError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { serverDb } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const db = await serverDb(); const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError && !isAuthSessionMissingError(authError)) throw authError;
    if (!user) return NextResponse.json({ error: 'Sign in to your workspace.' }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const target = params.get('workspace');
    // Login uses the authenticated account, never a remembered signup selection.
    // Invitation links can select an assigned client workspace, but grant no access.
    const kind = target ? 'client' : user.user_metadata.account_type === 'agency' ? 'agency' : null;
    if (target && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) return NextResponse.json({ error: 'Invalid portal link.' }, { status: 400 });
    const { data: workspaceId, error: bootstrapError } = await db.rpc('bootstrap_workspace', { account_kind: kind, target_workspace: target });
    if (bootstrapError) throw bootstrapError;
    if (!workspaceId) return NextResponse.json({ waiting: true, email: user.email, role: kind === 'agency' ? 'agency' : 'client' }, { headers: { 'Cache-Control': 'no-store' } });
    const { data: workspace, error } = await db.from('workspaces').select('id,name,owner_id,plan,subscription_status').eq('id', workspaceId).single();
    if (error) throw error;
    const results = await Promise.all([
      db.from('projects').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      db.from('deliverables').select('*,projects!inner(workspace_id)').eq('projects.workspace_id', workspaceId).order('created_at', { ascending: false }),
      db.from('activity').select('*,projects!inner(workspace_id)').eq('projects.workspace_id', workspaceId).order('created_at', { ascending: false }).limit(30)
    ]);
    for (const result of results) if (result.error) throw result.error;
    const role = kind !== 'client' && workspace.owner_id === user.id ? 'owner' : 'client';
    const projects = results[0].data!.filter(project => role === 'owner' || project.client_email === user.email?.toLowerCase());
    const projectIds = new Set(projects.map(project => project.id));
    return NextResponse.json({ workspace, projects, deliverables: results[1].data!.filter(item => projectIds.has(item.project_id)), activity: results[2].data!.filter(item => projectIds.has(item.project_id)), role, email: user.email }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Workspace load failed:', error instanceof Error ? error.message : 'Database request failed');
    const message = isAuthRetryableFetchError(error)
      ? 'Unable to reach the sign-in service. Please try again shortly.'
      : 'Unable to load your workspace. Confirm the Supabase migration and email verification are complete.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
