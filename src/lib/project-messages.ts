import type { ProjectMessage } from './demo';

// Inserts may arrive through both the write response and Realtime.
export function mergeProjectMessages(current: ProjectMessage[], incoming: ProjectMessage[]) {
  const messages = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
