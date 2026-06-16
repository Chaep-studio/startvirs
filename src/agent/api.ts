import type { ApiConfig } from '../types';
import { getAutoUrl } from '../utils';

// ============ 类型定义 ============

export interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string; // for role=tool
}

// ============ 非流式调用 ============

export async function callApi(
  apiConfig: ApiConfig,
  messagesForApi: { role: string; content: string }[],
  maxTokens: number = 16384
): Promise<string> {
  if (!apiConfig.enabled || !apiConfig.key || !apiConfig.url) {
    throw new Error('请先启用 API 配置并填写 URL 和 Key。点击右上角 ⚙️ 进行配置。');
  }
  const targetUrl = getAutoUrl(apiConfig.url);
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiConfig.key}`,
    },
    body: JSON.stringify({
      model: apiConfig.model,
      messages: messagesForApi,
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 错误 ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '（无回复）';
}

// ============ 流式调用（纯文本，无工具） ============

export async function* streamCompletion(
  apiConfig: ApiConfig,
  messagesForApi: { role: string; content: string }[],
  maxTokens: number = 16384
): AsyncGenerator<string> {
  if (!apiConfig.enabled || !apiConfig.key || !apiConfig.url) {
    throw new Error('请先启用 API 配置并填写 URL 和 Key。');
  }

  const targetUrl = getAutoUrl(apiConfig.url);
  const body: Record<string, unknown> = {
    model: apiConfig.model,
    messages: messagesForApi,
    temperature: 0.7,
    max_tokens: maxTokens,
    stream: true,
  };
  if (apiConfig.reasoningEffort && apiConfig.reasoningEffort !== 'auto') {
    body.reasoning_effort = apiConfig.reasoningEffort;
  }
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiConfig.key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 错误 ${res.status}: ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('响应流不可读');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content || '';
        if (token) yield token;
      } catch {
        // 跳过非 JSON 行
      }
    }
  }
}

// ============ 流式调用（带工具支持） ============

/**
 * 流式调用 API 并支持 tool calling。
 * 返回 assistant 的完整回复（包含可能的 tool_calls）。
 * 通过 onToken 回调实时输出文本 token。
 */
export async function streamWithTools(
  apiConfig: ApiConfig,
  messages: ChatMessage[],
  tools: ChatCompletionTool[],
  maxTokens: number = 16384,
  onToken?: (token: string) => void,
  temperature?: number
): Promise<{ content: string | null; tool_calls: ToolCall[] | null }> {
  if (!apiConfig.enabled || !apiConfig.key || !apiConfig.url) {
    throw new Error('请先启用 API 配置并填写 URL 和 Key。');
  }

  const targetUrl = getAutoUrl(apiConfig.url);
  const body: Record<string, unknown> = {
    model: apiConfig.model,
    messages,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens,
    stream: true,
    tools,
  };
  if (apiConfig.reasoningEffort && apiConfig.reasoningEffort !== 'auto') {
    body.reasoning_effort = apiConfig.reasoningEffort;
  }
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiConfig.key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 错误 ${res.status}: ${err}`);
  }

  // 流式解析：拼接 tool_calls 和 content
  let fullContent = '';
  const toolCallsMap = new Map<number, ToolCall>(); // index -> ToolCall

  const reader = res.body?.getReader();
  if (!reader) throw new Error('响应流不可读');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        // 文本内容
        if (delta.content) {
          fullContent += delta.content;
          onToken?.(delta.content);
        }

        // 工具调用（流式拼接）
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx: number = tc.index ?? 0;
            if (!toolCallsMap.has(idx)) {
              toolCallsMap.set(idx, {
                id: tc.id || '',
                type: 'function',
                function: { name: '', arguments: '' },
              });
            }
            const existing = toolCallsMap.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function.name += tc.function.name;
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
          }
        }
      } catch {
        // 跳过非 JSON 行
      }
    }
  }

  const toolCalls = toolCallsMap.size > 0
    ? Array.from(toolCallsMap.values())
    : null;

  return {
    content: fullContent || null,
    tool_calls: toolCalls,
  };
}
