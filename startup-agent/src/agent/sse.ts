/**
 * Shared SSE (Server-Sent Events) stream parsing utilities.
 * Eliminates duplicated buffer/line-split/data-prefix logic
 * across api.ts and mcp.ts.
 */

export interface SseEvent {
  data: string;
}

/**
 * Async generator that yields parsed SSE `data:` payloads from a
 * ReadableStream (e.g. `response.body`). Handles buffering, line
 * splitting, and the `[DONE]` sentinel automatically.
 */
export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
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

      yield data;
    }
  }
}

/**
 * Collects SSE events until a JSON-RPC response matching `requestId` is
 * received. Used by the MCP transport layer.
 */
export async function collectSseJsonRpcResponse<T>(
  body: ReadableStream<Uint8Array>,
  requestId: number,
): Promise<T | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventData = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        eventData += trimmed.slice(6);
      } else if (trimmed === '' && eventData) {
        try {
          const parsed = JSON.parse(eventData);
          if (parsed.id === requestId) {
            return parsed as T;
          }
        } catch {
          // skip invalid JSON
        }
        eventData = '';
      }
    }
  }

  return null;
}
