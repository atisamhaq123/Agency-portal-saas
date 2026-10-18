import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const db = await serverDb(); const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    const workspace = new URL(request.url).searchParams.get('workspace');
    if (!workspace || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspace)) return NextResponse.json({ error: 'Invalid workspace.' }, { status: 400 });
    const [inbox, count] = await Promise.all([
      db.from('notifications').select('*,projects!inner(workspace_id)').eq('projects.workspace_id', workspace).order('created_at', { ascending: false }).limit(100),
      db.from('notifications').select('id,projects!inner(workspace_id)', { count: 'exact', head: true }).eq('projects.workspace_id', workspace).is('read_at', null)
    ]);
    if (inbox.error || count.error) throw inbox.error || count.error;
    return NextResponse.json({ notifications: inbox.data, unread: count.count || 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Unable to load notifications.' }, { status: 503 }); }
}
export async function PATCH(request: Request) {
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL;
    if (!origin || request.headers.get('origin') !== new URL(origin).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    const db = await serverDb(); const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    const { id, workspace } = await request.json();
    if (id && (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return NextResponse.json({ error: 'Invalid notification.' }, { status: 400 });
    if (id) {
      const result = await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).select('id');
      if (result.error) throw result.error;
      if (!result.data?.length) return NextResponse.json({ error: 'Notification not found.' }, { status: 404 });
    } else {
      if (typeof workspace !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspace)) return NextResponse.json({ error: 'Invalid workspace.' }, { status: 400 });
      const projects = await db.from('projects').select('id').eq('workspace_id', workspace);
      if (projects.error) throw projects.error;
      if (projects.data?.length) {
        const result = await db.from('notifications').update({ read_at: new Date().toISOString() }).in('project_id', projects.data.map(p => p.id)).is('read_at', null);
        if (result.error) throw result.error;
      }
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Unable to update notifications.' }, { status: 503 }); }
}
