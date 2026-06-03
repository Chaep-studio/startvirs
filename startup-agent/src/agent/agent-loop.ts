/**
 * Agent 循环核心逻辑
 * 实现 ReAct 模式：LLM 调工具 → 执行 → 返回结果 → LLM 继续
 * 支持 Agent-as-Tool：当前 Agent 可委托其他 Agent 协作
 */
import type { ApiConfig, McpServerConfig, McpTool, AgentConfig, ModelConfig } from '../types';
import type { ChatCompletionTool, ChatMessage, AgentEvent } from './api';
import { streamWithTools, streamCompletion } from './api';
import { AGENT_TOOLS, executeTool, TOOL_SERVER_URL } from './tools';
import { mcpToolsToOpenAIFormat, parseMcpToolName, callMcpTool } from './mcp';
import { resolveApiConfig } from './models';

const MAX_LOOP = 20; // 最大循环次数，防止死循环

/** Agent 循环的回调 */
export interface AgentCallbacks {
  /** 收到一个文本 token */
  onToken?: (token: string) => void;
  /** 工具调用开始 */
  onToolCallStart?: (toolName: string, args: Record<string, unknown>) => void;
  /** 工具调用结束 */
  onToolCallEnd?: (toolName: string, args: Record<string, unknown>, result: unknown, duration: number) => void;
  /** Agent 思考步骤（非工具调用，仅文本生成中的 thinking 标签） */
  onThinking?: (thinking: string) => void;
}

/** 工具名称到 AgentStep type 的映射 */
function toolStepType(name: string): 'read_file' | 'write_file' | 'edit_file' | 'bash' | 'tool_call' {
  if (name === 'read_file' || name === 'write_file' || name === 'edit_file' || name === 'bash') return name;
  // Agent 委托也归类为 tool_call
  return 'tool_call';
}

/** 工具名称到中文标题的映射 */
function toolTitle(name: string, args: Record<string, unknown>): string {
  // Agent-as-Tool
  const agentId = parseAgentToolName(name);
  if (agentId) {
    const question = String(args.question || '').slice(0, 40);
    return `委托 Agent: ${question}`;
  }
  // MCP 工具
  const mcpParsed = parseMcpToolName(name);
  if (mcpParsed) {
    return `MCP: ${mcpParsed.toolName}`;
  }
  switch (name) {
    case 'read_file': return `读取文件 ${args.path || ''}`;
    case 'write_file': return `写入文件 ${args.path || ''}`;
    case 'edit_file': return `编辑文件 ${args.path || ''}`;
    case 'bash': return `执行命令 ${(args.command as string || '').slice(0, 40)}`;
    case 'list_files': return `列出目录 ${args.path || '.'}`;
    default: return `调用工具 ${name}`;
  }
}

/** Agent 名称前缀，用于标识 Agent-as-Tool 调用 */
const AGENT_TOOL_PREFIX = 'ask_agent_';

/** 从 Agent 列表生成 Agent-as-Tool 工具定义 */
function buildAgentTools(agent: AgentConfig, allAgents: AgentConfig[]): ChatCompletionTool[] {
  if (!agent.delegateToAgents) return [];

  const targets = agent.delegateTargets && agent.delegateTargets.length > 0
    ? allAgents.filter(a => agent.delegateTargets!.includes(a.id))
    : allAgents.filter(a => a.id !== agent.id);

  return targets.map(target => ({
    type: 'function' as const,
    function: {
      name: `${AGENT_TOOL_PREFIX}${target.id}`,
      description: `向「${target.name}」提问并获取回复。${target.description || ''}`,
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: `要向${target.name}请教的问题或要委托的任务`,
          },
          context: {
            type: 'string',
            description: '附加上下文信息（可选），帮助对方更好理解问题背景',
          },
        },
        required: ['question'],
      },
    },
  }));
}

/** 判断是否是 Agent-as-Tool 调用 */
function parseAgentToolName(name: string): string | null {
  if (!name.startsWith(AGENT_TOOL_PREFIX)) return null;
  return name.slice(AGENT_TOOL_PREFIX.length);
}

/** 执行 Agent-as-Tool：用目标 Agent 的 systemPrompt 和模型调用 LLM */
async function executeAgentTool(
  agentId: string,
  args: Record<string, unknown>,
  allAgents: AgentConfig[],
  apiConfig: ApiConfig,
  callbacks: AgentCallbacks,
  models: ModelConfig[],
): Promise<{ response: string; agentName: string; agentIcon: string; agentColor: string }> {
  const target = allAgents.find(a => a.id === agentId);
  if (!target) return { response: `Agent ${agentId} 未找到`, agentName: '未知', agentIcon: 'ph:warning', agentColor: '#ef4444' };

  const question = String(args.question || '');
  const context = args.context ? String(args.context) : '';
  const fullQuestion = context ? `[背景信息]\n${context}\n\n[问题]\n${question}` : question;

  // 用目标 Agent 的 systemPrompt 构造对话
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: target.systemPrompt },
    { role: 'user', content: fullQuestion },
  ];

  // 用目标 Agent 的 modelId 或旧 model 字段解析 ApiConfig
  const targetApiConfig = resolveApiConfig(models, target.modelId, target.model) || apiConfig;

  // 用流式调用目标 Agent，收集完整回复
  let fullResponse = '';
  for await (const token of streamCompletion(targetApiConfig, messages, target.maxTokens || 8192)) {
    fullResponse += token;
  }

  return {
    response: fullResponse || '（无回复）',
    agentName: target.name,
    agentIcon: target.icon,
    agentColor: target.color,
  };
}

/**
 * 构建完整的工具列表（内置 + MCP + Agent-as-Tool），支持按 Agent 配置过滤
 */
export function buildAllTools(mcpTools: McpTool[], agent?: AgentConfig, allAgents?: AgentConfig[]): ChatCompletionTool[] {
  // 内置工具过滤
  let builtinTools = AGENT_TOOLS;
  if (agent?.enabledTools && agent.enabledTools.length > 0) {
    builtinTools = AGENT_TOOLS.filter(t => agent.enabledTools!.includes(t.function.name));
  }

  // MCP 工具过滤
  let filteredMcpTools = mcpTools;
  if (agent?.enabledMcpServers && agent.enabledMcpServers.length > 0) {
    filteredMcpTools = mcpTools.filter(t => agent.enabledMcpServers!.includes(t.serverId));
  }

  // Agent-as-Tool
  const agentTools = (agent && allAgents) ? buildAgentTools(agent, allAgents) : [];

  return [...builtinTools, ...mcpToolsToOpenAIFormat(filteredMcpTools), ...agentTools];
}

/**
 * 执行一个工具调用（内置或 MCP 或 Agent-as-Tool）
 */
async function executeAnyTool(
  toolName: string,
  args: Record<string, unknown>,
  mcpServers: McpServerConfig[],
  mcpTools: McpTool[],
  serverUrl: string,
  allAgents: AgentConfig[],
  apiConfig: ApiConfig,
  callbacks: AgentCallbacks,
  models: ModelConfig[],
  sessionId?: string,
): Promise<{ result: unknown; isAgentDelegation?: boolean; agentName?: string; agentIcon?: string; agentColor?: string }> {
  // 检查是否是 Agent-as-Tool 调用
  const agentId = parseAgentToolName(toolName);
  if (agentId) {
    const agentResult = await executeAgentTool(agentId, args, allAgents, apiConfig, callbacks, models);
    return {
      result: agentResult.response,
      isAgentDelegation: true,
      agentName: agentResult.agentName,
      agentIcon: agentResult.agentIcon,
      agentColor: agentResult.agentColor,
    };
  }

  // 检查是否是 MCP 工具
  const mcpParsed = parseMcpToolName(toolName);
  if (mcpParsed) {
    const server = mcpServers.find(s => s.id === mcpParsed.serverId);
    if (!server) {
      return { result: { error: `MCP 服务器 ${mcpParsed.serverId} 未找到` } };
    }
    return { result: await callMcpTool(server.url, mcpParsed.toolName, args, server.apiKey) };
  }

  // 内置工具
  return { result: await executeTool(toolName, args, serverUrl, sessionId) };
}

/**
 * 运行 Agent 循环
 * @returns 最终的文本回复
 */
export async function runAgentLoop(
  apiConfig: ApiConfig,
  messages: ChatMessage[],
  callbacks: AgentCallbacks,
  serverUrl: string = TOOL_SERVER_URL,
  mcpServers: McpServerConfig[] = [],
  mcpTools: McpTool[] = [],
  agent?: AgentConfig,
  allAgents: AgentConfig[] = [],
  models: ModelConfig[] = [],
  sessionId?: string,
): Promise<string> {
  const conversation: ChatMessage[] = [...messages];
  const allTools = buildAllTools(mcpTools, agent, allAgents);
  const maxTokens = agent?.maxTokens || 16384;

  for (let i = 0; i < MAX_LOOP; i++) {
    // 调用 LLM（带工具定义）
    const response = await streamWithTools(
      apiConfig,
      conversation,
      allTools,
      maxTokens,
      callbacks.onToken,
      agent?.temperature
    );

    // 如果没有工具调用，直接返回文本
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return response.content || '';
    }

    // 把 assistant 的回复（含 tool_calls）加入对话
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: response.content,
      tool_calls: response.tool_calls,
    };
    conversation.push(assistantMsg);

    // 逐个执行工具调用
    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.function.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        args = {};
      }

      callbacks.onToolCallStart?.(toolName, args);

      const startTime = Date.now();
      let execResult: { result: unknown; isAgentDelegation?: boolean; agentName?: string; agentIcon?: string; agentColor?: string };
      try {
        execResult = await executeAnyTool(toolName, args, mcpServers, mcpTools, serverUrl, allAgents, apiConfig, callbacks, models, sessionId);
      } catch (e) {
        execResult = { result: { error: e instanceof Error ? e.message : String(e) } };
      }
      const duration = Date.now() - startTime;

      callbacks.onToolCallEnd?.(toolName, args, execResult.result, duration);

      // 把工具结果加入对话
      conversation.push({
        role: 'tool',
        content: JSON.stringify(execResult.result),
        tool_call_id: toolCall.id,
      });
    }

    // 继续循环，让 LLM 处理工具结果
  }

  return '（达到最大循环次数，Agent 停止）';
}

export { toolStepType, toolTitle };
