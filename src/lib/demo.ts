export type Project = { id: string; workspace_id: string; name: string; client_name: string; client_email: string; category: string; status: string; progress: number; due_date: string; color: string; description: string; created_at?: string };
export type Deliverable = { id: string; project_id: string; name: string; status: string; feedback: string | null; file_path: string | null; created_at: string };
export type Workspace = { id: string; name: string; owner_id: string; plan: string; subscription_status: string };
export type Activity = { id: string; project_id: string; message: string; created_at: string };
export type ProjectMessage = { id: string; project_id: string; author_id: string; author_email: string; body: string; created_at: string };
export type Milestone = { id: string; project_id: string; title: string; due_date: string | null; completed: boolean; created_at: string };
export type PortalNotification = { id: string; project_id: string; recipient_email?: string | null; recipient_id?: string | null; title: string; body: string; created_at: string; read_at: string | null };
export type PortalData = { workspace: Workspace; projects: Project[]; deliverables: Deliverable[]; activity: Activity[]; notifications?: PortalNotification[]; messages?: ProjectMessage[]; milestones?: Milestone[]; role: 'owner' | 'client'; email: string };
export const demoData: PortalData = {
  workspace: { id: 'studio-north', name: 'Studio North', owner_id: 'demo-owner', plan: 'pro', subscription_status: 'active' }, role: 'owner', email: 'alex@studionorth.demo',
  notifications: [
    { id: 'n1', project_id: 'p1', recipient_email: 'jordan@acme.demo', title: 'New file ready for review', body: 'Visual identity exploration.pdf in A fresh start for Acme', created_at: '2026-10-16T10:30:00Z', read_at: null },
    { id: 'n2', project_id: 'p3', recipient_email: 'alex@studionorth.demo', title: 'Deliverable approved', body: 'Campaign moodboard.pdf in A little room to bloom', created_at: '2026-10-14T10:00:00Z', read_at: null }
  ],
  projects: [
    { id: 'p1', workspace_id: 'studio-north', name: 'A fresh start for Acme', client_name: 'Acme Studio', client_email: 'jordan@acme.demo', category: 'Brand identity', status: 'In progress', progress: 72, due_date: '2026-10-28', color: 'peach', description: 'A thoughtful new identity for a team doing things differently. Brand strategy, visual identity, and a complete set of guidelines.' },
    { id: 'p2', workspace_id: 'studio-north', name: 'Good things, online', client_name: 'Goodkind', client_email: 'hello@goodkind.demo', category: 'Web design', status: 'In review', progress: 90, due_date: '2026-10-23', color: 'lavender', description: 'A welcoming digital home for a sustainable everyday essentials brand. Website design and responsive development.' },
    { id: 'p3', workspace_id: 'studio-north', name: 'Room to grow', client_name: 'Bloom & Co.', client_email: 'sara@bloom.demo', category: 'Marketing', status: 'In progress', progress: 45, due_date: '2026-11-06', color: 'sage', description: 'A seasonal campaign that brings a little more green into everyday life. Social templates, campaign creative, and art direction.' },
    { id: 'p4', workspace_id: 'studio-north', name: 'Made for the everyday', client_name: 'Forma', client_email: 'leo@forma.demo', category: 'Brand identity', status: 'Completed', progress: 100, due_date: '2026-10-12', color: 'sand', description: 'Packaging and brand guidelines for beautifully useful objects. All final assets delivered and approved.' },
    { id: 'p5', workspace_id: 'second-studio', name: 'Coastal stories', client_name: 'Tide House', client_email: 'mia@tide.demo', category: 'Web design', status: 'In progress', progress: 30, due_date: '2026-11-15', color: 'sage', description: 'An editorial website for a coastal retreat.' }
  ],
  deliverables: [
    { id: 'd1', project_id: 'p1', name: 'Visual identity · Round 02.pdf', status: 'Pending', feedback: null, file_path: null, created_at: '2026-10-16T10:30:00Z' },
    { id: 'd2', project_id: 'p2', name: 'Homepage & mobile concepts.pdf', status: 'Pending', feedback: null, file_path: null, created_at: '2026-10-16T08:00:00Z' },
    { id: 'd3', project_id: 'p3', name: 'Campaign moodboard.pdf', status: 'Approved', feedback: 'Love this direction!', file_path: null, created_at: '2026-10-14T10:00:00Z' }
  ],
  activity: [
    { id: 'a1', project_id: 'p1', message: 'Alex uploaded a new visual identity for review', created_at: '2026-10-16T10:30:00Z' },
    { id: 'a2', project_id: 'p3', message: 'Sara approved the campaign moodboard', created_at: '2026-10-14T10:00:00Z' },
    { id: 'a3', project_id: 'p4', message: 'Made for the everyday was completed', created_at: '2026-10-12T12:00:00Z' }
  ]
};
