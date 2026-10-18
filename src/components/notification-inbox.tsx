'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, RefreshCw, X } from 'lucide-react';
import type { PortalData, PortalNotification } from '@/lib/demo';

export default function NotificationInbox({ data, live, update, openProject }: { data: PortalData; live: boolean; update: (next: PortalData) => void; openProject: (id: string) => void }) {
  const [open, setOpen] = useState(false), [items, setItems] = useState<PortalNotification[]>([]), [unread, setUnread] = useState(0), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const panel = useRef<HTMLDivElement>(null), requestId = useRef(0);
  const demoItems = (data.notifications || []).filter(n => (n.recipient_email === data.email || (data.role === 'owner' && n.recipient_id === data.workspace.owner_id)) && data.projects.some(p => p.id === n.project_id && p.workspace_id === data.workspace.id && (data.role === 'owner' || p.client_email === data.email))).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const visible = live ? items : demoItems;
  const count = live ? unread : demoItems.filter(n => !n.read_at).length;
  const refresh = useCallback(async () => {
    if (!live || !data.workspace.id) return;
    const sequence = ++requestId.current; setLoading(true); setError('');
    try {
      const response = await fetch(`/api/notifications?workspace=${encodeURIComponent(data.workspace.id)}`, { cache: 'no-store' }); const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load notifications.');
      if (sequence === requestId.current) { setItems(result.notifications); setUnread(result.unread); }
    } catch (e) { if (sequence === requestId.current) setError(e instanceof Error ? e.message : 'Unable to load notifications.'); }
    finally { if (sequence === requestId.current) setLoading(false); }
  }, [live, data.workspace.id, data.email]);
  useEffect(() => {
    setItems([]); setUnread(0); setLoading(false); setError(''); setOpen(false); void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    const focus = () => { void refresh(); }; window.addEventListener('focus', focus);
    return () => { requestId.current++; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  async function markRead(item?: PortalNotification) {
    if (saving) return false; setSaving(true); setError('');
    try {
      if (live) {
        requestId.current++;
        const response = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item ? { id: item.id } : { workspace: data.workspace.id }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to mark notifications read.');
        await refresh();
      } else {
        const ids = new Set((item ? [item] : demoItems).map(n => n.id));
        update({ ...data, notifications: (data.notifications || []).map(n => ids.has(n.id) ? { ...n, read_at: new Date().toISOString() } : n) });
      }
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update notifications.'); return false; }
    finally { setSaving(false); setLoading(false); }
  }
  return <div className="notification-inbox" ref={panel}>
    <button className="icon-button inbox-toggle" aria-label={`Notifications${count ? `, ${count} unread` : ''}`} aria-expanded={open} aria-controls="notification-panel" onClick={() => { setOpen(!open); if (!open) void refresh(); }}><Bell size={19} />{count > 0 && <span className="inbox-count">{count > 99 ? '99+' : count}</span>}</button>
    {open && <section id="notification-panel" className="inbox-panel" aria-label="Notification inbox"><header><div><h2>Notifications</h2><small>{count} unread</small></div><button className="icon-button" aria-label="Close notifications" onClick={() => setOpen(false)}><X size={17} /></button></header><div className="inbox-actions"><button className="text-button" disabled={!count || saving || loading} onClick={() => markRead()}><CheckCheck size={14} />Mark all read</button>{live && <button className="text-button" disabled={loading || saving} onClick={() => refresh()}><RefreshCw size={13} />Refresh</button>}</div>
      {loading && <p className="inbox-status" role="status"><span className="action-spinner" />Loading notifications...</p>}{error && <p className="inbox-status" role="alert">{error}</p>}
      {!loading && !error && !visible.length && <div className="inbox-empty"><Bell size={25} /><strong>You're all caught up.</strong><p>Project updates will appear here.</p></div>}
      <div className="inbox-list">{visible.map(item => <article key={item.id} className={item.read_at ? '' : 'inbox-unread'}><button className="inbox-item" disabled={saving} onClick={async () => { if (item.read_at || await markRead(item)) { setOpen(false); openProject(item.project_id); } }}><strong>{!item.read_at && <i />}{item.title}</strong><p>{item.body}</p><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' })}</time></button>{!item.read_at && <button className="text-button inbox-read" disabled={saving} aria-label={`Mark read: ${item.title}`} onClick={() => markRead(item)}>Mark read</button>}</article>)}</div>
    </section>}
  </div>;
}
