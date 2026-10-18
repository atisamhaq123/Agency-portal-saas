'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCheck, MessageSquare, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { useProjectMessages } from '@/components/use-project-messages';
import { mergeProjectMessages } from '@/lib/project-messages';
import { demoNotification } from '@/lib/demo-notifications';
import { browserDb } from '@/lib/supabase';
import type { Milestone, PortalData, Project, ProjectMessage } from '@/lib/demo';

export default function ProjectCollaboration({ project, data, live, update, refresh, onPending }: { project: Project; data: PortalData; live: boolean; update: (next: PortalData | ((current: PortalData) => PortalData)) => void; refresh: () => Promise<void>; onPending: (label: string) => void }) {
  const [pending, setPending] = useState(''), [notice, setNotice] = useState(''), [body, setBody] = useState(''), [title, setTitle] = useState(''), [due, setDue] = useState('');
  const milestones = (data.milestones || []).filter(item => item.project_id === project.id);
  const messages = (data.messages || []).filter(item => item.project_id === project.id);
  const owner = data.role === 'owner';
  const messageList = useRef<HTMLDivElement>(null), followMessages = useRef(true);
  const connection = useProjectMessages(project.id, live, incoming => {
    update(current => ({ ...current, messages: mergeProjectMessages(current.messages || [], incoming.filter(message => message.project_id === project.id)) }));
  });
  useEffect(() => {
    const list = messageList.current;
    if (list && followMessages.current) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  async function run(label: string, action: () => Promise<void>) {
    if (pending) return; setPending(label); onPending(label); setNotice('');
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save. Please try again.'); }
    finally { setPending(''); onPending(''); }
  }
  async function postMessage(event: React.FormEvent) {
    event.preventDefault(); if (!body.trim()) return;
    await run('Sending message...', async () => {
      let message: ProjectMessage = { id: crypto.randomUUID(), project_id: project.id, author_id: 'demo-user', author_email: data.email, body: body.trim(), created_at: new Date().toISOString() };
      if (live) { const result = await browserDb().from('project_messages').insert({ project_id: project.id, body: message.body }).select().single(); if (result.error) throw result.error; message = result.data; }
      followMessages.current = true; update(current => ({ ...current, ...(!live ? { notifications: [...(current.notifications || []), demoNotification(current, project, 'New project message', message.body.slice(0,200))] } : {}), messages: mergeProjectMessages(current.messages || [], [message]) })); setBody(''); setNotice('Message sent.');
    });
  }
  async function addMilestone(event: React.FormEvent) {
    event.preventDefault(); if (!title.trim()) return;
    await run('Adding milestone...', async () => {
      let milestone: Milestone = { id: crypto.randomUUID(), project_id: project.id, title: title.trim(), due_date: due || null, completed: false, created_at: new Date().toISOString() };
      if (live) { const result = await browserDb().from('milestones').insert({ project_id: project.id, title: milestone.title, due_date: milestone.due_date }).select().single(); if (result.error) throw result.error; milestone = result.data; }
      update(current => ({ ...current, ...(!live ? { notifications: [...(current.notifications || []), demoNotification(current, project, 'New milestone', milestone.title)] } : {}), milestones: [...(current.milestones || []), milestone] })); setTitle(''); setDue(''); setNotice('Milestone added.');
    });
  }
  async function toggle(item: Milestone) {
    await run('Updating milestone...', async () => {
      if (live) { const { data: saved, error } = await browserDb().from('milestones').update({ completed: !item.completed }).eq('id', item.id).select('id').single(); if (error || !saved) throw error || new Error('Milestone is no longer available.'); }
      update(current => ({ ...current, ...(!live ? { notifications: [...(current.notifications || []), demoNotification(current, project, item.completed ? 'Milestone reopened' : 'Milestone completed', item.title)] } : {}), milestones: (current.milestones || []).map(m => m.id === item.id ? { ...m, completed: !m.completed } : m) }));
    });
  }
  async function remove(item: Milestone) {
    await run('Removing milestone...', async () => {
      if (live) { const { error } = await browserDb().from('milestones').delete().eq('id', item.id); if (error) throw error; }
      update(current => ({ ...current, milestones: (current.milestones || []).filter(m => m.id !== item.id) }));
    });
  }
  return <div className="project-collaboration">
    <div className="collaboration-heading"><div><p className="eyebrow">KEEP THE WHOLE PROJECT CONNECTED</p><h2>Plan it. Talk it through.</h2></div>{live && <button className="button secondary" disabled={!!pending} onClick={() => run('Refreshing project...', refresh)}><RefreshCw size={14} />Refresh updates</button>}</div>
    {(pending || notice) && <p className="inline-notice collaboration-notice" role="status">{pending && <span className="action-spinner" aria-hidden="true" />}{pending || notice}</p>}
    <section className="collaboration-section" aria-label="Project milestones"><div className="section-heading"><h3><CheckCheck size={18} />Milestones</h3><span className="muted">{milestones.filter(m => m.completed).length} / {milestones.length} complete</span></div>
      {!milestones.length && <p className="muted">{owner ? 'Break the project into clear steps. Add your first milestone below.' : 'Your agency will share project milestones here.'}</p>}
      <ul className="milestone-list">{milestones.map(item => <li key={item.id}><label className={item.completed ? 'milestone-done' : ''}><input type="checkbox" checked={item.completed} disabled={!owner || !!pending} onChange={() => toggle(item)} /><span>{item.title}{item.due_date && <small>Due {new Date(`${item.due_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Karachi' })}</small>}</span></label>{owner && <button className="icon-button" disabled={!!pending} aria-label={`Remove milestone ${item.title}`} onClick={() => remove(item)}><Trash2 size={15} /></button>}</li>)}</ul>
      {owner && <form className="milestone-form" onSubmit={addMilestone}><fieldset disabled={!!pending}><label>Milestone title<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={120} placeholder="e.g. Creative direction approved" /></label><label>Milestone due date<input type="date" value={due} onChange={e => setDue(e.target.value)} /></label><button className="button secondary"><Plus size={15} />Add milestone</button></fieldset></form>}
    </section>
    <section className="collaboration-section" aria-label="Project conversation"><div className="section-heading"><h3><MessageSquare size={18} />Conversation</h3><span className="conversation-connection" role="status"><i className={connection === 'Live' ? 'connected' : ''} />{connection}<small>{messages.length} messages</small></span></div><p className="muted">Shared with this project's agency and assigned client.</p>
      <div className="project-message-list" ref={messageList} aria-live="polite" aria-relevant="additions" onScroll={() => { const list = messageList.current; if (list) followMessages.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80; }}>{!messages.length && <p className="muted conversation-empty">Start the conversation. Keep questions and decisions beside the work.</p>}{messages.map(message => <article key={message.id} className={`project-message ${message.author_email === data.email ? 'own-message' : ''}`}><div><strong>{message.author_email === data.email ? 'You' : message.author_email}</strong><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' })}</time></div><p>{message.body}</p></article>)}</div>
      <form onSubmit={postMessage}><fieldset disabled={!!pending}><label>Project message<textarea aria-label="Project message" value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={3000} required placeholder="Ask a question, share context, or confirm the next step..." /></label><div className="message-compose-footer"><small>{body.length} / 3000</small><button className="button primary" disabled={!body.trim() || !!pending}><Send size={15} />Send message</button></div></fieldset></form>
    </section>
  </div>;
}
