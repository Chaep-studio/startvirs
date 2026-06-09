import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ApiConfig } from '../types';
import type { ChatCompletionTool, ChatMessage } from './api';
import { callApi, streamCompletion, streamWithTools } from './api';

const apiConfig: ApiConfig = {
  enabled: true,
  url: 'https://api.test/v1',
  key: 'sk-test',
  model: 'm',
};

/** Build a fake fetch Response whose body streams the given SSE text chunks. */
function sseResponse(chunks: string[], ok = true, status = 200) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok,
    status,
    text: async () => 'error body',
    body: {
      getReader() {
        return {
          read: async () => {
            if (i < chunks.length) {
              return { done: false, value: encoder.encode(chunks[i++]) };
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

describe('callApi', () => {
  it('throws when the config is disabled or incomplete', async () => {
    await expect(callApi({ ...apiConfig, enabled: false }, [])).rejects.toThrow();
    await expect(callApi({ ...apiConfig, key: '' }, [])).rejects.toThrow();
    await expect(callApi({ ...apiConfig, url: '' }, [])).rejects.toThrow();
  });

  it('returns the assistant message content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await callApi(apiConfig, [{ role: 'user', content: 'hi' }])).toBe('hello');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('m');
    expect(body.max_tokens).toBe(16384);
  });

  it('returns a placeholder when content is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) })
    );
    expect(await callApi(apiConfig, [])).toBe('（无回复）');
  });

  it('throws including the status on an error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'no' })
    );
    await expect(callApi(apiConfig, [])).rejects.toThrow('401');
  });
});

describe('streamCompletion', () => {
  it('throws when config is incomplete', async () => {
    const gen = streamCompletion({ ...apiConfig, key: '' }, []);
    await expect(gen.next()).rejects.toThrow();
  });

  it('yields content tokens and stops at [DONE]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
          'data: [DONE]\n',
          'data: {"choices":[{"delta":{"content":"ignored"}}]}\n',
        ])
      )
    );
    const tokens: string[] = [];
    for await (const t of streamCompletion(apiConfig, [{ role: 'user', content: 'hi' }])) {
      tokens.push(t);
    }
    expect(tokens.join('')).toBe('Hello');
  });

  it('skips malformed JSON lines without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          'data: not-json\n',
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n',
        ])
      )
    );
    const tokens: string[] = [];
    for await (const t of streamCompletion(apiConfig, [])) tokens.push(t);
    expect(tokens.join('')).toBe('ok');
  });

  it('throws including the status on an error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    );
    const gen = streamCompletion(apiConfig, []);
    await expect(gen.next()).rejects.toThrow('500');
  });
});

describe('streamWithTools', () => {
  const tools: ChatCompletionTool[] = [];
  const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

  it('throws when config is incomplete', async () => {
    await expect(
      streamWithTools({ ...apiConfig, url: '' }, messages, tools)
    ).rejects.toThrow();
  });

  it('accumulates content and invokes the onToken callback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hi "}}]}\n',
          'data: {"choices":[{"delta":{"content":"there"}}]}\n',
          'data: [DONE]\n',
        ])
      )
    );
    const seen: string[] = [];
    const res = await streamWithTools(apiConfig, messages, tools, 16384, (t) =>
      seen.push(t)
    );
    expect(res.content).toBe('Hi there');
    expect(res.tool_calls).toBeNull();
    expect(seen.join('')).toBe('Hi there');
  });

  it('assembles streamed tool_calls across deltas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_","arguments":"{\\"p"}}]}}]}\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"file","arguments":"\\":1}"}}]}}]}\n',
          'data: [DONE]\n',
        ])
      )
    );
    const res = await streamWithTools(apiConfig, messages, tools);
    expect(res.content).toBeNull();
    expect(res.tool_calls).toHaveLength(1);
    expect(res.tool_calls![0].id).toBe('call_1');
    expect(res.tool_calls![0].function.name).toBe('read_file');
    expect(res.tool_calls![0].function.arguments).toBe('{"p":1}');
  });

  it('passes the custom temperature through to the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n']));
    vi.stubGlobal('fetch', fetchMock);
    await streamWithTools(apiConfig, messages, tools, 100, undefined, 0.2);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(100);
    expect(body.stream).toBe(true);
  });

  it('throws including the status on an error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'x' })
    );
    await expect(streamWithTools(apiConfig, messages, tools)).rejects.toThrow('503');
  });
});
