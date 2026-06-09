import { describe, it, expect, beforeEach } from 'vitest';
import type { Session, Message, Skill } from '../types';
import {
  loadSessions,
  saveSessions,
  loadCurrentSessionId,
  saveCurrentSessionId,
  createSession,
  addSession,
  updateSessionMessages,
  removeSession,
} from './sessions';

const SESSIONS_KEY = 'startup_agent_sessions';
const CURRENT_KEY = 'startup_agent_current_session';

const skills: Skill[] = [
  {
    id: 's1',
    name: 'Skill',
    icon: 'ph:x',
    color: '#000',
    description: 'd',
    command: '/s',
    paramsHint: '[x]',
    systemPrompt: 'sp',
    promptTemplate: '{{input}}',
  },
];

function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: 'sess1',
    title: 'Title',
    messages: [],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('loadSessions / saveSessions', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(loadSessions()).toEqual([]);
  });

  it('round-trips sessions through storage', () => {
    const s = makeSession();
    saveSessions([s]);
    expect(loadSessions()).toEqual([s]);
  });
});

describe('current session id', () => {
  it('returns empty string when none stored', () => {
    expect(loadCurrentSessionId()).toBe('');
  });

  it('round-trips the saved id', () => {
    saveCurrentSessionId('abc');
    expect(loadCurrentSessionId()).toBe('abc');
    expect(JSON.parse(localStorage.getItem(CURRENT_KEY)!)).toBe('abc');
  });
});

describe('createSession', () => {
  it('creates a session with welcome messages and timestamps', () => {
    const s = createSession(skills);
    expect(s.id).toBeTruthy();
    expect(s.messages.length).toBeGreaterThan(0);
    expect(s.createdAt).toBeGreaterThan(0);
    expect(s.updatedAt).toBeGreaterThan(0);
  });

  it('uses the provided title', () => {
    expect(createSession(skills, 'My Title').title).toBe('My Title');
  });
});

describe('addSession', () => {
  it('prepends the new session and persists', () => {
    const existing = makeSession({ id: 'old' });
    const fresh = makeSession({ id: 'new' });
    const next = addSession([existing], fresh);
    expect(next.map((s) => s.id)).toEqual(['new', 'old']);
    expect(JSON.parse(localStorage.getItem(SESSIONS_KEY)!)).toHaveLength(2);
  });
});

describe('updateSessionMessages', () => {
  const messages: Message[] = [
    { id: 1, role: 'user', type: 'text', text: 'hi', time: 1 },
  ];

  it('updates messages and bumps updatedAt for the matching session', () => {
    const s = makeSession({ id: 's', updatedAt: 1 });
    const next = updateSessionMessages([s], 's', messages);
    expect(next[0].messages).toEqual(messages);
    expect(next[0].updatedAt).toBeGreaterThanOrEqual(1);
  });

  it('updates the title when provided', () => {
    const s = makeSession({ id: 's', title: 'old' });
    const next = updateSessionMessages([s], 's', messages, 'new title');
    expect(next[0].title).toBe('new title');
  });

  it('leaves the title unchanged when not provided', () => {
    const s = makeSession({ id: 's', title: 'keep' });
    const next = updateSessionMessages([s], 's', messages);
    expect(next[0].title).toBe('keep');
  });

  it('does not modify non-matching sessions', () => {
    const a = makeSession({ id: 'a', messages: [] });
    const b = makeSession({ id: 'b', messages: [] });
    const next = updateSessionMessages([a, b], 'a', messages);
    expect(next.find((s) => s.id === 'b')!.messages).toEqual([]);
  });
});

describe('removeSession', () => {
  it('removes the session by id and persists when others remain', () => {
    const a = makeSession({ id: 'a' });
    const b = makeSession({ id: 'b' });
    const { sessions } = removeSession([a, b], 'a');
    expect(sessions.map((s) => s.id)).toEqual(['b']);
    expect(JSON.parse(localStorage.getItem(SESSIONS_KEY)!)).toHaveLength(1);
  });

  it('returns an empty list without persisting when removing the last session', () => {
    const a = makeSession({ id: 'a' });
    const { sessions } = removeSession([a], 'a');
    expect(sessions).toEqual([]);
    expect(localStorage.getItem(SESSIONS_KEY)).toBeNull();
  });
});
