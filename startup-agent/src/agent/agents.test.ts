import { describe, it, expect, beforeEach } from 'vitest';
import type { AgentConfig } from '../types';
import {
  DEFAULT_AGENTS,
  loadAgents,
  saveAgents,
  resetAgents,
  addAgent,
  updateAgent,
  deleteAgent,
  loadCurrentAgentId,
  saveCurrentAgentId,
} from './agents';

const STORAGE_KEY = 'startup_agent_agents';
const CURRENT_KEY = 'startup_agent_current_agent';

function makeAgent(over: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'a1',
    name: 'Agent 1',
    icon: 'ph:robot',
    color: '#000',
    description: 'desc',
    systemPrompt: 'prompt',
    useTools: false,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('loadAgents', () => {
  it('seeds defaults when storage is empty', () => {
    expect(loadAgents()).toHaveLength(DEFAULT_AGENTS.length);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(
      DEFAULT_AGENTS.length
    );
  });

  it('returns stored agents when present', () => {
    saveAgents([makeAgent({ id: 'c', name: 'Custom' })]);
    const agents = loadAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('Custom');
  });

  it('falls back to defaults when stored list is empty', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    expect(loadAgents()).toHaveLength(DEFAULT_AGENTS.length);
  });
});

describe('resetAgents', () => {
  it('restores defaults', () => {
    saveAgents([makeAgent()]);
    expect(resetAgents()).toHaveLength(DEFAULT_AGENTS.length);
    expect(loadAgents()).toHaveLength(DEFAULT_AGENTS.length);
  });
});

describe('addAgent', () => {
  it('appends an agent with a generated id and persists', () => {
    const next = addAgent([], {
      name: 'New',
      icon: 'ph:x',
      color: '#fff',
      description: 'd',
      systemPrompt: 'p',
      useTools: true,
    });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(1);
  });
});

describe('updateAgent', () => {
  it('updates only the matching agent', () => {
    const a = makeAgent({ id: 'a', name: 'A' });
    const b = makeAgent({ id: 'b', name: 'B' });
    const next = updateAgent([a, b], { ...a, name: 'A2' });
    expect(next.find((x) => x.id === 'a')!.name).toBe('A2');
    expect(next.find((x) => x.id === 'b')!.name).toBe('B');
  });
});

describe('deleteAgent', () => {
  it('removes the agent by id and persists', () => {
    const a = makeAgent({ id: 'a' });
    const b = makeAgent({ id: 'b' });
    const next = deleteAgent([a, b], 'b');
    expect(next.map((x) => x.id)).toEqual(['a']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(1);
  });
});

describe('current agent id', () => {
  it('returns the first default agent id when none stored', () => {
    expect(loadCurrentAgentId()).toBe(DEFAULT_AGENTS[0].id);
  });

  it('round-trips the saved current agent id', () => {
    saveCurrentAgentId('code-expert');
    expect(loadCurrentAgentId()).toBe('code-expert');
    expect(JSON.parse(localStorage.getItem(CURRENT_KEY)!)).toBe('code-expert');
  });
});
