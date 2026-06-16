import type { Session, Message, Skill } from '../types';
import { load, save, generateId } from '../utils';
import { createWelcomeMessages } from './skills';

const SESSIONS_KEY = 'startup_agent_sessions';
const CURRENT_KEY = 'startup_agent_current_session';

export function loadSessions(): Session[] {
  return load<Session[]>(SESSIONS_KEY) || [];
}

export function saveSessions(sessions: Session[]) {
  save(SESSIONS_KEY, sessions);
}

export function loadCurrentSessionId(): string {
  return load<string>(CURRENT_KEY) || '';
}

export function saveCurrentSessionId(id: string) {
  save(CURRENT_KEY, id);
}

export function createSession(skills: Skill[], title = '新对话'): Session {
  const id = generateId();
  return {
    id,
    title,
    messages: createWelcomeMessages(skills),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function addSession(sessions: Session[], session: Session): Session[] {
  const next = [session, ...sessions];
  saveSessions(next);
  return next;
}

export function updateSessionMessages(
  sessions: Session[],
  sessionId: string,
  messages: Message[],
  title?: string
): Session[] {
  const next = sessions.map((s) =>
    s.id === sessionId
      ? { ...s, messages, updatedAt: Date.now(), ...(title ? { title } : {}) }
      : s
  );
  saveSessions(next);
  return next;
}

export function removeSession(sessions: Session[], id: string): { sessions: Session[]; fallback?: Session } {
  const filtered = sessions.filter((s) => s.id !== id);
  if (filtered.length === 0) {
    return { sessions: filtered };
  }
  saveSessions(filtered);
  return { sessions: filtered };
}