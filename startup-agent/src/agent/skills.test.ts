import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ApiConfig, Skill } from '../types';
import {
  DEFAULT_SKILLS,
  loadSkills,
  saveSkills,
  resetSkills,
  addSkill,
  updateSkill,
  deleteSkill,
  matchSkill,
  buildSkillSystemPrompt,
  appendThinkingInstruction,
  createWelcomeMessages,
  extractThinking,
  runSkill,
} from './skills';

const STORAGE_KEY = 'startup_agent_skills';

function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    id: 'k1',
    name: 'Skill One',
    icon: 'ph:x',
    color: '#000',
    description: 'a skill',
    command: '/one',
    paramsHint: '[input]',
    systemPrompt: 'system',
    promptTemplate: 'do {{input}}',
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('loadSkills / saveSkills / resetSkills', () => {
  it('seeds defaults when storage is empty', () => {
    expect(loadSkills()).toHaveLength(DEFAULT_SKILLS.length);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(
      DEFAULT_SKILLS.length
    );
  });

  it('returns stored skills when present', () => {
    saveSkills([makeSkill({ name: 'Custom' })]);
    expect(loadSkills()[0].name).toBe('Custom');
  });

  it('falls back to defaults when stored list is empty', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    expect(loadSkills()).toHaveLength(DEFAULT_SKILLS.length);
  });

  it('resetSkills restores defaults', () => {
    saveSkills([makeSkill()]);
    expect(resetSkills()).toHaveLength(DEFAULT_SKILLS.length);
  });
});

describe('addSkill / updateSkill / deleteSkill', () => {
  it('adds a skill with a generated id', () => {
    const next = addSkill([], {
      name: 'N',
      icon: 'i',
      color: '#fff',
      description: 'd',
      command: '/n',
      paramsHint: '[x]',
      systemPrompt: 's',
      promptTemplate: '{{input}}',
    });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBeTruthy();
  });

  it('updates the matching skill', () => {
    const a = makeSkill({ id: 'a', name: 'A' });
    const b = makeSkill({ id: 'b', name: 'B' });
    const next = updateSkill([a, b], { ...b, name: 'B2' });
    expect(next.find((s) => s.id === 'b')!.name).toBe('B2');
    expect(next.find((s) => s.id === 'a')!.name).toBe('A');
  });

  it('deletes the matching skill', () => {
    const a = makeSkill({ id: 'a' });
    const b = makeSkill({ id: 'b' });
    expect(deleteSkill([a, b], 'a').map((s) => s.id)).toEqual(['b']);
  });
});

describe('matchSkill', () => {
  const skills = [
    makeSkill({ id: 'a', command: '/office' }),
    makeSkill({ id: 'b', command: '/mvp' }),
  ];

  it('matches a command prefix and extracts the input', () => {
    const res = matchSkill(skills, '/mvp my product idea');
    expect(res).not.toBeNull();
    expect(res!.skill.id).toBe('b');
    expect(res!.input).toBe('my product idea');
  });

  it('returns empty input for a bare command', () => {
    const res = matchSkill(skills, '/office');
    expect(res!.input).toBe('');
  });

  it('trims leading/trailing whitespace before matching', () => {
    const res = matchSkill(skills, '   /office   hi   ');
    expect(res!.skill.id).toBe('a');
    expect(res!.input).toBe('hi');
  });

  it('returns null when no command matches', () => {
    expect(matchSkill(skills, 'just chatting')).toBeNull();
  });
});

describe('buildSkillSystemPrompt', () => {
  it('lists every skill command and name', () => {
    const prompt = buildSkillSystemPrompt([
      makeSkill({ command: '/a', name: 'Alpha' }),
      makeSkill({ command: '/b', name: 'Beta' }),
    ]);
    expect(prompt).toContain('/a — Alpha');
    expect(prompt).toContain('/b — Beta');
    expect(prompt).toContain('<thinking>');
  });
});

describe('appendThinkingInstruction', () => {
  it('keeps the original prompt and appends the thinking spec', () => {
    const out = appendThinkingInstruction('BASE');
    expect(out.startsWith('BASE')).toBe(true);
    expect(out).toContain('<thinking>');
  });
});

describe('createWelcomeMessages', () => {
  it('builds a single agent message numbering each skill', () => {
    const msgs = createWelcomeMessages([
      makeSkill({ command: '/a', name: 'Alpha', paramsHint: '[x]' }),
      makeSkill({ command: '/b', name: 'Beta', paramsHint: '[y]' }),
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('agent');
    expect(msgs[0].text).toContain('1. **/a** [x] — Alpha');
    expect(msgs[0].text).toContain('2. **/b** [y] — Beta');
    expect(msgs[0].text).toContain('**2**');
  });
});

describe('extractThinking', () => {
  it('separates thinking from content when a thinking tag exists', () => {
    const { thinking, content } = extractThinking(
      '<thinking>reasoning here</thinking>final answer'
    );
    expect(thinking).toBe('reasoning here');
    expect(content).toBe('final answer');
  });

  it('is case-insensitive on the tag', () => {
    const { thinking } = extractThinking('<THINKING>x</THINKING>y');
    expect(thinking).toBe('x');
  });

  it('returns content only when there is no thinking tag', () => {
    const res = extractThinking('plain text');
    expect(res.thinking).toBeUndefined();
    expect(res.content).toBe('plain text');
  });
});

describe('runSkill', () => {
  const apiConfig: ApiConfig = {
    enabled: true,
    url: 'https://api.test/v1',
    key: 'sk-test',
    model: 'm',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns usage help text when no input is given', async () => {
    const skill = makeSkill();
    const res = await runSkill(skill, '', apiConfig);
    expect(res.text).toContain(skill.command);
    expect(res.text).toContain(skill.description);
    expect(res.task).toBeUndefined();
  });

  it('calls the API with the templated prompt and returns a task', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: '<thinking>plan</thinking>the result' } },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const skill = makeSkill({ promptTemplate: 'build {{input}} now' });
    const res = await runSkill(skill, 'a rocket', apiConfig);

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[1].content).toBe('build a rocket now');
    expect(res.thinking).toBe('plan');
    expect(res.task).toBeDefined();
    expect(res.task!.content).toBe('the result');
    expect(res.task!.status).toBe('done');
  });

  it('truncates a long subtitle with an ellipsis', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const longInput = 'x'.repeat(50);
    const res = await runSkill(makeSkill(), longInput, apiConfig);
    expect(res.task!.subtitle!.endsWith('...')).toBe(true);
    expect(res.task!.subtitle!.length).toBe(33);
  });
});
