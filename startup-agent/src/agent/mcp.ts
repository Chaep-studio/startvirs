/**
 * MCP (Model Context Protocol) 客户端
 * 支持连接 MCP 服务器、发现工具、调用工具
 * 使用 Streamable HTTP 传输（SSE）
 */
import type { McpServerConfig, McpTool } from '../types';
import type { ChatCompletionTool } from './api';
import { load, save } from '../utils';
import { collectSseJsonRpcResponse } from './sse';

// ============ MCP 协议类型 ============

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

let rpcId = 0;

// ============ MCP 客户端 ============

/**
 * 连接 MCP 服务器并发现可用工具
 */
export async function discoverMcpTools(server: McpServerConfig): Promise<McpTool[]> {
  if (!server.enabled || !server.url) return [];

  try {
    // 1. Initialize
    const initResp = await sendMcpRequest(server.url, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'startup-agent', version: '1.0.0' },
    }, server.apiKey);

    if (initResp.error) {
      console.error(`MCP ${server.name} initialize error:`, initResp.error.message);
      return [];
    }

    // 2. Send initialized notification
    await sendMcpNotification(server.url, 'notifications/initialized', server.apiKey);

    // 3. List tools
    const toolsResp = await sendMcpRequest(server.url, 'tools/list', {}, server.apiKey);

    if (toolsResp.error) {
      console.error(`MCP ${server.name} tools/list error:`, toolsResp.error.message);
      return [];
    }

    const toolsData = toolsResp.result as { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> };
    if (!toolsData?.tools) return [];

    return toolsData.tools.map((t) => {
      const fullName = `mcp__${server.id}__${t.name}`;
      return {
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
        serverId: server.id,
        fullName,
      };
    });
  } catch (e) {
    console.error(`MCP ${server.name} discover error:`, e);
    return [];
  }
}

/**
 * 调用 MCP 工具
 */
export async function callMcpTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  const resp = await sendMcpRequest(serverUrl, 'tools/call', {
    name: toolName,
    arguments: args,
  }, apiKey);

  if (resp.error) {
    return { error: resp.error.message };
  }

  // MCP tools/call 返回 { content: [{ type: "text", text: "..." }] }
  const result = resp.result as { content?: Array<{ type: string; text?: string }> };
  if (result?.content) {
    // 合并所有 text 类型的内容
    const texts = result.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text);
    if (texts.length > 0) {
      return { content: texts.join('\n') };
    }
  }

  return result;
}

/**
 * 将 MCP 工具转换为 OpenAI Function Calling 格式
 */
export function mcpToolsToOpenAIFormat(mcpTools: McpTool[]): ChatCompletionTool[] {
  return mcpTools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.fullName,
      description: `[MCP:${t.serverId}] ${t.description}`,
      parameters: t.inputSchema,
    },
  }));
}

/**
 * 从 fullName 中解析出 serverId 和原始 toolName
 */
export function parseMcpToolName(fullName: string): { serverId: string; toolName: string } | null {
  if (!fullName.startsWith('mcp__')) return null;
  const parts = fullName.split('__');
  if (parts.length < 3) return null;
  return { serverId: parts[1], toolName: parts.slice(2).join('__') };
}

// ============ MCP 传输层（通过后端代理绕过 CORS） ============

const MCP_PROXY = 'http://localhost:3456/api/mcp/proxy';

async function sendMcpRequest(url: string, method: string, params: Record<string, unknown>, apiKey?: string): Promise<JsonRpcResponse> {
  const req: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: ++rpcId,
    method,
    params,
  };

  // 通过后端代理转发，绕过浏览器 CORS 限制
  const res = await fetch(MCP_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, body: req, apiKey }),
  });

  if (!res.ok) {
    return { jsonrpc: '2.0', id: req.id, error: { code: res.status, message: `HTTP ${res.status}: ${await res.text().catch(() => '')}` } };
  }

  const contentType = res.headers.get('content-type') || '';

  // SSE response — read events until we get the result for our request ID
  if (contentType.includes('text/event-stream') && res.body) {
    const result = await collectSseJsonRpcResponse<JsonRpcResponse>(res.body, req.id);
    if (result) return result;
    return { jsonrpc: '2.0', id: req.id, error: { code: -1, message: 'SSE stream ended without response' } };
  }

  // Direct JSON response
  const data = await res.json();
  return data as JsonRpcResponse;
}

async function sendMcpNotification(url: string, method: string, apiKey?: string): Promise<void> {
  await fetch(MCP_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, body: { jsonrpc: '2.0', method }, apiKey }),
  });
}

// ============ MCP 配置持久化 ============

const MCP_STORAGE_KEY = 'mcp_servers';

export function loadMcpServers(): McpServerConfig[] {
  return load<McpServerConfig[]>(MCP_STORAGE_KEY) || [];
}

export function saveMcpServers(servers: McpServerConfig[]) {
  save(MCP_STORAGE_KEY, servers);
}
