import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { McpServerConfig, McpTool } from '../types';
import {
  discoverMcpTools,
  callMcpTool,
  mcpToolsToOpenAIFormat,
  parseMcpToolName,
  loadMcpServers,
  saveMcpServers,
} from './mcp';

/** Build a fake Response that streams the given SSE text as a single chunk. */
function sseResponse(text: string) {
  const encoder = new TextEncoder();
  let sent = false;
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    text: async () => '',
    body: {
      getReader() {
        return {
          read: async () => {
            if (!sent) {
              sent = true;
              return { done: false, value: encoder.encode(text) };
            }
            return { done: true, value: undefined };
          },
        };
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseMcpToolName', () => {
  it('parses a well-formed full name', () => {
    expect(parseMcpToolName('mcp__server1__search')).toEqual({
      serverId: 'server1',
      toolName: 'search',
    });
  });

  it('rejoins tool names that themselves contain the separator', () => {
    expect(parseMcpToolName('mcp__srv__a__b')).toEqual({
      serverId: 'srv',
      toolName: 'a__b',
    });
  });

  it('returns null when the prefix is missing', () => {
    expect(parseMcpToolName('search')).toBeNull();
  });

  it('returns null when there are too few segments', () => {
    expect(parseMcpToolName('mcp__server')).toBeNull();
  });
});

describe('mcpToolsToOpenAIFormat', () => {
  it('maps MCP tools to OpenAI function tool definitions', () => {
    const tools: McpTool[] = [
      {
        name: 'search',
        description: 'find things',
        inputSchema: { type: 'object', properties: { q: {} } },
        serverId: 'srv',
        fullName: 'mcp__srv__search',
      },
    ];
    const out = mcpToolsToOpenAIFormat(tools);
    expect(out).toEqual([
      {
        type: 'function',
        function: {
          name: 'mcp__srv__search',
          description: '[MCP:srv] find things',
          parameters: { type: 'object', properties: { q: {} } },
        },
      },
    ]);
  });

  it('returns an empty array for no tools', () => {
    expect(mcpToolsToOpenAIFormat([])).toEqual([]);
  });
});

describe('discoverMcpTools', () => {
  const server: McpServerConfig = {
    id: 'srv',
    name: 'My Server',
    url: 'https://mcp.test/rpc',
    enabled: true,
  };

  it('returns [] when the server is disabled', async () => {
    expect(await discoverMcpTools({ ...server, enabled: false })).toEqual([]);
  });

  it('returns [] when the url is empty', async () => {
    expect(await discoverMcpTools({ ...server, url: '' })).toEqual([]);
  });

  it('initializes, lists tools, and prefixes full names', async () => {
    const responses = [
      { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } }), text: async () => '' },
      { ok: true, headers: new Headers(), json: async () => ({}), text: async () => '' }, // initialized notification
      {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          jsonrpc: '2.0',
          id: 2,
          result: { tools: [{ name: 'echo', description: 'echoes', inputSchema: { type: 'object' } }] },
        }),
        text: async () => '',
      },
    ];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()));
    vi.stubGlobal('fetch', fetchMock);

    const tools = await discoverMcpTools(server);
    expect(tools).toHaveLength(1);
    expect(tools[0].fullName).toBe('mcp__srv__echo');
    expect(tools[0].serverId).toBe('srv');
  });

  it('returns [] and logs when initialize responds with an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -1, message: 'boom' } }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await discoverMcpTools(server)).toEqual([]);
  });

  it('returns [] when fetch throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await discoverMcpTools(server)).toEqual([]);
  });
});

describe('callMcpTool', () => {
  it('merges text content blocks into a single string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
      }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await callMcpTool('https://mcp.test', 'echo', { x: 1 })).toEqual({
      content: 'a\nb',
    });
  });

  it('returns the raw result when there is no text content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ jsonrpc: '2.0', id: 1, result: { value: 42 } }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await callMcpTool('https://mcp.test', 'calc', {})).toEqual({ value: 42 });
  });

  it('returns an error object when the RPC response is an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -1, message: 'nope' } }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await callMcpTool('https://mcp.test', 'x', {})).toEqual({ error: 'nope' });
  });

  it('surfaces an HTTP error as an error object', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => 'server down',
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = (await callMcpTool('https://mcp.test', 'x', {})) as { error: string };
    expect(res.error).toContain('500');
  });

  it('parses a Server-Sent-Events response stream', async () => {
    // rpcId is module-global and increments per request; match the next id by
    // echoing it back from the mocked transport.
    let nextId = 0;
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      nextId = body.body.id;
      return Promise.resolve(
        sseResponse(
          `event: message\ndata: ${JSON.stringify({
            jsonrpc: '2.0',
            id: nextId,
            result: { content: [{ type: 'text', text: 'via sse' }] },
          })}\n\n`
        )
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await callMcpTool('https://mcp.test', 'echo', {})).toEqual({
      content: 'via sse',
    });
  });
});

describe('loadMcpServers / saveMcpServers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty array when nothing is stored', () => {
    expect(loadMcpServers()).toEqual([]);
  });

  it('round-trips servers through localStorage', () => {
    const servers: McpServerConfig[] = [
      { id: 's', name: 'S', url: 'https://x', enabled: true },
    ];
    saveMcpServers(servers);
    expect(loadMcpServers()).toEqual(servers);
  });

  it('returns an empty array when stored JSON is corrupt', () => {
    localStorage.setItem('mcp_servers', '{not json');
    expect(loadMcpServers()).toEqual([]);
  });
});
