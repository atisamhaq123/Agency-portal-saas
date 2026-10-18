import type { PortalData, PortalNotification, Project } from './demo';
export function demoNotification(data: PortalData, project: Project, title: string, body: string): PortalNotification {
  return { id: crypto.randomUUID(), project_id: project.id, ...(data.role === 'owner' ? { recipient_email: project.client_email } : { recipient_id: data.workspace.owner_id }), title, body, created_at: new Date().toISOString(), read_at: null };
}
