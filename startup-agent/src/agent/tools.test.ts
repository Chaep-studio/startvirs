import { describe, it, expect, afterEach, vi } from 'vitest';
import { AGENT_TOOLS, TOOL_SERVER_URL, executeTool } from './tools';

describe('AGENT_TOOLS', () => {
  it('declares the expected tool set', () => {
    const names = AGENT_TOOLS.map((t) => t.function.name).sort();
    expect(names).toEqual(
      ['bash', 'edit_file', 'list_files', 'read_file', 'write_file'].sort()
    );
  });

  it('marks every tool as a function with a non-empty description', () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.type).toBe('function');
      expect(tool.function.description.length).toBeGreaterThan(0);
      expect(tool.function.parameters).toHaveProperty('type', 'object');
    }
  });

  it('requires path + content for write_file', () => {
    const writeTool = AGENT_TOOLS.find((t) => t.function.name === 'write_file')!;
    expect(writeTool.function.parameters.required).toEqual(['path', 'content']);
  });
});

describe('executeTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs args to the default tool server and returns the parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await executeTool('read_file', { path: 'a.ts' });
    expect(out).toEqual({ result: 'ok' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${TOOL_SERVER_URL}/api/tools/read_file`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ path: 'a.ts' });
  });

  it('injects __sessionId into the body when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await executeTool('bash', { command: 'ls' }, 'http://srv', 'sess-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://srv/api/tools/bash');
    expect(JSON.parse(init.body)).toEqual({ command: 'ls', __sessionId: 'sess-1' });
  });

  it('throws an error including the status when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'bad args',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(executeTool('edit_file', {})).rejects.toThrow('422');
  });
});
