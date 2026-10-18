'use client';
import { useEffect, useRef, useState } from 'react';
import { browserDb } from '@/lib/supabase';
import type { ProjectMessage } from '@/lib/demo';

export function useProjectMessages(projectId: string, live: boolean, receive: (messages: ProjectMessage[]) => void) {
  const callback = useRef(receive); callback.current = receive;
  const [status, setStatus] = useState('Connecting...');
  useEffect(() => {
    if (!live) return;
    const db = browserDb(); let active = true, connected = false, syncing = false, again = false;
    setStatus('Connecting...');
    // Subscribe first, then fetch history to close the initial connection gap.
    async function sync() {
      if (!active) return;
      if (syncing) { again = true; return; }
      syncing = true;
      try {
        do {
          again = false;
          const { data, error } = await db.from('project_messages').select('*').eq('project_id', projectId).order('created_at', { ascending: true }).order('id', { ascending: true });
          if (!active) return;
          if (error) { setStatus('Connection interrupted. Retrying...'); break; }
          callback.current(data as ProjectMessage[]);
          setStatus(connected ? 'Live' : 'Reconnecting...');
        } while (again && active);
      } catch { if (active) setStatus('Connection interrupted. Retrying...'); }
      finally { syncing = false; }
    }
    const channel = db.channel(`project-messages:${projectId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_messages', filter: `project_id=eq.${projectId}` }, () => { void sync(); })
      .subscribe(state => {
        if (!active) return;
        connected = state === 'SUBSCRIBED';
        setStatus(connected ? 'Live' : 'Reconnecting...');
        if (connected) void sync();
      });
    const resume = () => { if (document.visibilityState === 'visible') void sync(); };
    const timer = setInterval(resume, 15000);
    window.addEventListener('focus', resume); window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume);
    return () => {
      active = false; clearInterval(timer);
      window.removeEventListener('focus', resume); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume);
      void db.removeChannel(channel);
    };
  }, [projectId, live]);
  return live ? status : 'Demo conversation';
}
