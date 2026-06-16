/**
 * Agent 循环核心逻辑 — 多 Agent 并行协作版
 *
 * 实现 ReAct 模式：LLM 调工具 → 执行 → 返回结果 → LLM 继续
 * 支持：
 *  - 并行工具执行（Promise.all）
 *  - 递归委派（子 Agent 拥有完整工具循环）
 *  - orchestrate 编排器（一次分发多个子任务并行执行）
 *  - 动态工具列表刷新（generate_agent 后立即可用）
 *  - 共享上下文（多 Agent 共享进度和文件状态）
 */
import type { ApiConfig, McpServerConfig, McpTool, AgentConfig, ModelConfig } from '../types';
import type { ChatCompletionTool, ChatMessage } from './api';
import { streamWithTools, streamCompletion } from './api';
import { AGENT_TOOLS, executeTool, getToolServerUrl, getFileMode } from './tools';
import { mcpToolsToOpenAIFormat, parseMcpToolName, callMcpTool } from './mcp';
import { resolveApiConfig } from './models';
import { TODO_TOOL, executeTodoWrite } from './todo';
import {
  AGENT_GENERATION_TOOL,
  executeGenerateAgent,
  getSessionAgent,
  generatedToConfig,
  getAllSessionAgents,
} from './agent-generator';
import { SharedContext } from './shared-context';
import { MEMORY_TOOLS, executeMemoryTool } from './memory-tools';

const MAX_LOOP = 30;           // 最大循环次数，防止死循环（v0.1: 20 → 30）
const LOOP_TIMEOUT = 300_000;  // 总超时 5 分钟

/** 上下文压缩：单次 runAgentLoop 最多触发 1 次；触发时给出 4 阶段状态 */
export interface CompactionStats {
  beforeTokens: number;
  afterTokens: number;
  compressedCount: number;
  summary: string;
}

/** Agent 循环的回调（扩展支持 agentId 区分来源） */
export interface AgentCallbacks {
  /** 收到一个文本 token */
  onToken?: (token: string) => void;
  /** 工具调用开始（callerAgentId=调用方父 Agent，meta=此步骤主体 Agent，用于 UI 区分委派来源） */
  onToolCallStart?: (toolName: string, args: Record<string, unknown>, callerAgentId?: string, meta?: ToolStepMeta) => void;
  /** 工具调用结束 */
  onToolCallEnd?: (toolName: string, args: Record<string, unknown>, result: unknown, duration: number, callerAgentId?: string, meta?: ToolStepMeta) => void;
  /** 循环进度（i 从 0 开始；i === MAX_LOOP-1 表示最后一轮） */
  onLoopProgress?: (current: number, max: number) => void;
  /** 压缩阶段：judging（判断中）/ compressing（LLM 在总结）/ applied（已应用） */
  onCompaction?: (status: 'judging' | 'compressing' | 'applied') => void;
  /** 压缩完成：拿到完整统计 + 摘要 */
  onCompactionApplied?: (stats: CompactionStats) => void;
  /** 写文件需要用户确认（弹 diff 弹窗）。resolve('confirm' | 'cancel') 必须被调一次以解除 await。 */
  onDiffRequest?: (pending: import('./tools').PendingWrite, resolve: (decision: 'confirm' | 'cancel') => void) => void;
}

// ============ 写操作互斥锁 ============

/** 写操作工具名集合 — 并行执行时需串行化防止冲突 */
const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'bash']);

class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) { this.locked = true; return; }
    return new Promise<void>(resolve => this.queue.push(resolve));
  }

  release(): void {
    if (this.queue.length > 0) {
      this.queue.shift()!();
    } else {
      this.locked = false;
    }
  }
}

// ============ 工具名映射 ============

/** Agent 名称前缀，用于标识 Agent-as-Tool 调用 */
const AGENT_TOOL_PREFIX = 'ask_agent_';
/** Generated Agent 名称前缀（AI 动态生成的） */
const GEN_AGENT_TOOL_PREFIX = 'ask_agent_gen_';

/** 工具名称到 AgentStep type 的映射 */
function toolStepType(name: string): 'read_file' | 'write_file' | 'edit_file' | 'bash' | 'tool_call' | 'agent_delegate' {
  if (name === 'read_file' || name === 'write_file' || name === 'edit_file' || name === 'bash') return name;
  if (name.startsWith(AGENT_TOOL_PREFIX) || name.startsWith(GEN_AGENT_TOOL_PREFIX) || name === 'generate_agent') return 'agent_delegate';
  if (name === 'orchestrate') return 'agent_delegate';
  return 'tool_call';
}

/** 工具步骤元数据 — 给 UI 用，包含执行此步骤的"主体 Agent"信息 */
export interface ToolStepMeta {
  /** 步骤主体的 Agent ID（agent_delegate 时是"被委派的目标"，普通工具时是"调用方父 Agent"） */
  agentId?: string;
  agentName?: string;
  agentIcon?: string;
  agentColor?: string;
}

/** 解析工具调用对应的"主体 Agent"元数据 */
function toolStepMeta(name: string, allAgents: AgentConfig[] = []): ToolStepMeta {
  // generate_agent: 主体是"将要生成的 Agent"，用 args.name 占位
  if (name === 'generate_agent') {
    return {};
  }
  // 动态生成的 Agent: ask_agent_gen_xxx
  if (name.startsWith(GEN_AGENT_TOOL_PREFIX)) {
    const id = name.slice(GEN_AGENT_TOOL_PREFIX.length);
    const generated = getSessionAgent(id);
    if (generated) {
      return {
        agentId: id,
        agentName: generated.name,
        agentIcon: generated.icon,
        agentColor: generated.color,
      };
    }
    return { agentId: id, agentName: id.slice(0, 12) };
  }
  // 预定义 Agent: ask_agent_xxx
  const agentId = parseAgentToolName(name);
  if (agentId) {
    const target = allAgents.find(a => a.id === agentId);
    if (target) {
      return {
        agentId: target.id,
        agentName: target.name,
        agentIcon: target.icon,
        agentColor: target.color,
      };
    }
    return { agentId, agentName: agentId };
  }
  // orchestrate: 主体是协调者（暂用固定标识）
  if (name === 'orchestrate') {
    return { agentName: 'Orchestrator', agentIcon: 'ph:flow-arrow', agentColor: '#8b5cf6' };
  }
  return {};
}

/** 工具名称到中文标题的映射 */
function toolTitle(name: string, args: Record<string, unknown>, allAgents: AgentConfig[] = []): string {
  if (name === 'generate_agent') {
    return `✨ 生成 Agent：${args.name || '未命名'}`;
  }
  if (name.startsWith(GEN_AGENT_TOOL_PREFIX)) {
    const id = name.slice(GEN_AGENT_TOOL_PREFIX.length);
    const generated = getSessionAgent(id);
    const agentName = generated?.name || id.slice(0, 12);
    return `委派 → ${agentName}`;
  }
  const targetId = parseAgentToolName(name);
  if (targetId) {
    const target = allAgents.find(a => a.id === targetId);
    const agentName = target?.name || targetId;
    return `委派 → ${agentName}`;
  }
  if (name === 'orchestrate') {
    const tasks = (args.tasks as Array<{ agentId?: string }>) || [];
    return `🎯 编排 ${tasks.length} 个并行任务`;
  }
  const mcpParsed = parseMcpToolName(name);
  if (mcpParsed) return `MCP: ${mcpParsed.toolName}`;
  switch (name) {
    case 'read_file': return `读取文件 ${args.path || ''}`;
    case 'write_file': return `写入文件 ${args.path || ''}`;
    case 'edit_file': return `编辑文件 ${args.path || ''}`;
    case 'bash': return `执行命令 ${(args.command as string || '').slice(0, 40)}`;
    case 'list_files': return `列出目录 ${args.path || '.'}`;
    case 'grep': {
      const pat = (args.pattern as string || '').slice(0, 30);
      const where = args.path && args.path !== '.' ? ` in ${args.path}` : '';
      const inc = args.include ? ` (${args.include})` : '';
      return `搜索 ${pat}${where}${inc}`;
    }
    case 'glob': {
      const pat = (args.pattern as string || '').slice(0, 30);
      const where = args.path && args.path !== '.' ? ` in ${args.path}` : '';
      return `查找文件 ${pat}${where}`;
    }
    case 'todowrite': {
      const todos = (args.todos as { status: string }[] | undefined) || [];
      const total = todos.length;
      const done = todos.filter(t => t.status === 'completed').length;
      return `更新任务计划 (${done}/${total})`;
    }
    case 'save_memory': {
      const cat = String(args.category || '');
      const proj = args.project ? ` / ${args.project}` : '';
      return `💾 保存记忆 → ${cat}${proj}`;
    }
    case 'list_memories': {
      const filter = [args.category && String(args.category), args.project && `项目=${args.project}`, args.keyword && `关键词=${args.keyword}`].filter(Boolean).join(' ');
      return `🔍 查询记忆${filter ? '（' + filter + '）' : ''}`;
    }
    case 'get_memory': return `📖 读取记忆 ${args.id || ''}`;
    case 'delete_memory': return `🗑 删除记忆 ${args.id || ''}`;
    default: return `调用工具 ${name}`;
  }
}

// ============ Agent-as-Tool 定义 ============

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
      description: `向「${target.name}」提问并获取回复。${target.description || ''}${target.delegateTools ? '（该 Agent 可使用工具）' : ''}`,
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
  // 排除 generated agent 前缀
  if (name.startsWith(GEN_AGENT_TOOL_PREFIX)) return null;
  return name.slice(AGENT_TOOL_PREFIX.length);
}

// ============ 编排器工具定义 ============

/** orchestrate 工具：Coordinator 一次分发多个并行子任务 */
const ORCHESTRATE_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'orchestrate',
    description: '编排多个 Agent 并行执行子任务。适用于需要将一个大任务拆分给多个专业 Agent 同时处理的场景。每个子 Agent 独立运行、可使用工具（如果配置允许），结果会汇总返回。',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: '要并行执行的子任务列表',
          items: {
            type: 'object',
            properties: {
              agentId: {
                type: 'string',
                description: '执行该任务的 Agent ID',
              },
              task: {
                type: 'string',
                description: '具体的任务描述',
              },
              context: {
                type: 'string',
                description: '附加上下文（可选）',
              },
            },
            required: ['agentId', 'task'],
          },
        },
      },
      required: ['tasks'],
    },
  },
};

// ============ 执行委派（递归 ReAct 循环） ============

/**
 * 执行 Agent-as-Tool：递归调用 runAgentLoop（子 Agent 拥有完整工具能力）
 * 或单轮流式调用（delegateTools=false 时走轻量路径）
 */
async function executeAgentTool(
  agentId: string,
  args: Record<string, unknown>,
  allAgents: AgentConfig[],
  apiConfig: ApiConfig,
  callbacks: AgentCallbacks,
  models: ModelConfig[],
  mcpServers: McpServerConfig[],
  mcpTools: McpTool[],
  serverUrl: string,
  sessionId?: string,
  depth: number = 0,
  sharedContext?: SharedContext,
): Promise<{ response: string; agentName: string; agentIcon: string; agentColor: string }> {
  const target = allAgents.find(a => a.id === agentId);
  if (!target) return { response: `Agent ${agentId} 未找到`, agentName: '未知', agentIcon: 'ph:warning', agentColor: '#ef4444' };

  const question = String(args.question || '');
  const context = args.context ? String(args.context) : '';
  const fullQuestion = context ? `[背景信息]\n${context}\n\n[问题]\n${question}` : question;

  // 用目标 Agent 的 systemPrompt 构造对话
  const messages: ChatMessage[] = [
    { role: 'system', content: target.systemPrompt },
    { role: 'user', content: fullQuestion },
  ];

  // 用目标 Agent 的 modelId 解析 ApiConfig
  const targetApiConfig = resolveApiConfig(models, target.modelId, target.model) || apiConfig;

  // 注册到共享上下文
  sharedContext?.registerAgent(target.id, target.name, target.icon, target.color);

  // 判断子 Agent 是否可以使用工具（完整 ReAct 循环）
  const canUseTools = target.useTools && target.delegateTools;
  const maxDepth = target.maxDepth ?? 2;

  if (canUseTools && depth < maxDepth) {
    // 递归：子 Agent 跑完整的 agent loop
    try {
      const response = await runAgentLoop(
        targetApiConfig,
        messages,
        callbacks,
        serverUrl,
        mcpServers,
        mcpTools,
        target,
        allAgents,
        models,
        sessionId,
        depth + 1,
        sharedContext,
      );
      sharedContext?.setStatus(target.id, 'done');
      sharedContext?.addFinding(target.id, response.slice(0, 200));
      return { response: response || '（无回复）', agentName: target.name, agentIcon: target.icon, agentColor: target.color };
    } catch (e) {
      sharedContext?.setStatus(target.id, 'error');
      return { response: `Agent ${target.name} 执行出错: ${e instanceof Error ? e.message : String(e)}`, agentName: target.name, agentIcon: target.icon, agentColor: target.color };
    }
  } else if (canUseTools && depth >= maxDepth) {
    // 超过嵌套深度限制，降级为纯文本
    const response = `[深度限制] 当前委派嵌套已达最大深度 (${maxDepth})，无法使用工具。以下是纯文本回复：\n`;
    let text = '';
    for await (const token of streamCompletion(targetApiConfig, messages as { role: string; content: string }[], target.maxTokens || 8192)) {
      text += token;
    }
    sharedContext?.setStatus(target.id, 'done');
    return { response: response + (text || '（无回复）'), agentName: target.name, agentIcon: target.icon, agentColor: target.color };
  } else {
    // 轻量路径：纯文本单轮调用（无工具）
    let fullResponse = '';
    for await (const token of streamCompletion(targetApiConfig, messages as { role: string; content: string }[], target.maxTokens || 8192)) {
      fullResponse += token;
    }
    sharedContext?.setStatus(target.id, 'done');
    sharedContext?.addFinding(target.id, fullResponse.slice(0, 200));
    return { response: fullResponse || '（无回复）', agentName: target.name, agentIcon: target.icon, agentColor: target.color };
  }
}

// ============ 执行编排器 ============

/**
 * 执行 orchestrate 工具：并行分发多个子任务给不同 Agent
 */
async function executeOrchestrate(
  tasks: Array<{ agentId: string; task: string; context?: string }>,
  allAgents: AgentConfig[],
  apiConfig: ApiConfig,
  callbacks: AgentCallbacks,
  models: ModelConfig[],
  mcpServers: McpServerConfig[],
  mcpTools: McpTool[],
  serverUrl: string,
  sessionId?: string,
  depth: number = 0,
  sharedContext?: SharedContext,
): Promise<string> {
  const results = await Promise.allSettled(
    tasks.map(async (t) => {
      const target = allAgents.find(a => a.id === t.agentId);
      if (!target) return { agentId: t.agentId, response: `Agent ${t.agentId} 未找到`, error: true };

      const args = { question: t.task, context: t.context || '' };
      const r = await executeAgentTool(
        t.agentId, args, allAgents, apiConfig, callbacks, models,
        mcpServers, mcpTools, serverUrl, sessionId, depth, sharedContext,
      );
      return { agentId: t.agentId, agentName: r.agentName, response: r.response, error: false };
    })
  );

  // 汇总结果
  const lines: string[] = ['## 编排执行结果\n'];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const r = result.value;
      lines.push(`### ${r.agentName || r.agentId}${r.error ? ' [错误]' : ''}`);
      lines.push(r.response);
      lines.push('');
    } else {
      lines.push(`### 未知 Agent [失败]`);
      lines.push(result.reason?.message || '未知错误');
      lines.push('');
    }
  }

  // 附加共享上下文摘要
  if (sharedContext) {
    lines.push('---');
    lines.push('### 共享上下文摘要');
    lines.push(sharedContext.getSummary());
  }

  return lines.join('\n');
}

// ============ 构建完整工具列表 ============

/**
 * 构建完整的工具列表（内置 + MCP + Agent-as-Tool + Todo + GenerateAgent + Orchestrate）
 * 支持按 Agent 配置过滤
 */
export function buildAllTools(
  mcpTools: McpTool[],
  agent?: AgentConfig,
  allAgents?: AgentConfig[]
): ChatCompletionTool[] {
  // 无后端模式：完全不暴露文件工具
  const fileMode = getFileMode();
  let builtinTools = fileMode === 'none' ? [] : AGENT_TOOLS;
  if (agent?.enabledTools && agent.enabledTools.length > 0) {
    builtinTools = builtinTools.filter(t => agent.enabledTools!.includes(t.function.name));
  }

  // MCP 工具过滤
  let filteredMcpTools = mcpTools;
  if (agent?.enabledMcpServers && agent.enabledMcpServers.length > 0) {
    filteredMcpTools = mcpTools.filter(t => agent.enabledMcpServers!.includes(t.serverId));
  }

  // Agent-as-Tool（用户预定义 + AI 动态生成）
  const presetAgentTools = (agent && allAgents) ? buildAgentTools(agent, allAgents) : [];
  const generatedAgentTools = buildGeneratedAgentTools();

  // TodoWrite 工具
  const todoTool: ChatCompletionTool[] = agent?.useTools ? [TODO_TOOL] : [];

  // Generate Agent 工具
  const generateTool: ChatCompletionTool[] = agent?.useTools ? [AGENT_GENERATION_TOOL] : [];

  // Orchestrate 编排器工具（仅当 Agent 开启 delegate 时可用）
  const orchestrateTool: ChatCompletionTool[] = agent?.delegateToAgents ? [ORCHESTRATE_TOOL] : [];

  // 记忆工具（MD 长期记忆）：对所有 useTools=true 的 Agent 开放
  const memoryToolList: ChatCompletionTool[] = agent?.useTools ? MEMORY_TOOLS : [];

  return [
    ...builtinTools,
    ...mcpToolsToOpenAIFormat(filteredMcpTools),
    ...presetAgentTools,
    ...generatedAgentTools,
    ...todoTool,
    ...generateTool,
    ...orchestrateTool,
    ...memoryToolList,
  ];
}

/** 把当前 session 内已生成的 Agent 转成 ask_agent 工具 */
function buildGeneratedAgentTools(): ChatCompletionTool[] {
  const generated = getAllSessionAgents();
  return generated.map((g: { id: string; name: string; description: string }) => ({
    type: 'function' as const,
    function: {
      name: `${GEN_AGENT_TOOL_PREFIX}${g.id}`,
      description: `向 AI 动态生成的「${g.name}」提问。${g.description}`,
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: `要向${g.name}请教的问题`,
          },
          context: {
            type: 'string',
            description: '附加上下文（可选）',
          },
        },
        required: ['question'],
      },
    },
  }));
}

// ============ 执行单个工具 ============

/**
 * 执行一个工具调用（内置/MCP/Agent-as-Tool/TodoWrite/GenerateAgent/Orchestrate）
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
  depth: number = 0,
  sharedContext?: SharedContext,
  writeMutex?: Mutex,
  agent?: AgentConfig,
): Promise<{ result: unknown; isAgentDelegation?: boolean; agentName?: string; agentIcon?: string; agentColor?: string }> {
  // 写操作加互斥锁
  const needsLock = WRITE_TOOLS.has(toolName);
  if (needsLock && writeMutex) await writeMutex.acquire();

  try {
    // 0. 记忆工具（MD 长期记忆）
    if (toolName === 'save_memory' || toolName === 'list_memories' || toolName === 'get_memory' || toolName === 'delete_memory') {
      const result = await executeMemoryTool(toolName, args, {
        sessionId,
        agentId: agent?.id,
      });
      return { result };
    }

    // 1. todowrite
    if (toolName === 'todowrite') {
      return { result: executeTodoWrite(args as { todos: { id: string; content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string }[] }) };
    }

    // 2. generate_agent
    if (toolName === 'generate_agent') {
      const a = args as { name: string; icon: string; color: string; description: string; systemPrompt: string; tools?: string[]; lifecycle?: 'ephemeral' | 'session' | 'persistent'; task: string };
      const result = executeGenerateAgent(a, sessionId || 'unknown');
      return {
        result: {
          ...result,
          hint: `已生成 Agent「${a.name}」，id=${result.agentId}。现在可以调用 ask_agent_gen_${result.agentId} 来委派任务。`,
        },
      };
    }

    // 3. orchestrate（编排器）
    if (toolName === 'orchestrate') {
      const tasks = (args.tasks as Array<{ agentId: string; task: string; context?: string }>) || [];
      if (tasks.length === 0) return { result: { error: '没有提供子任务' } };
      const response = await executeOrchestrate(
        tasks, allAgents, apiConfig, callbacks, models,
        mcpServers, mcpTools, serverUrl, sessionId, depth, sharedContext,
      );
      return { result: response, isAgentDelegation: true, agentName: 'Orchestrator', agentIcon: 'ph:flow-arrow', agentColor: '#8b5cf6' };
    }

    // 4. 动态生成的 Agent 调用（ask_agent_gen_xxx）
    if (toolName.startsWith(GEN_AGENT_TOOL_PREFIX)) {
      const generatedId = toolName.slice(GEN_AGENT_TOOL_PREFIX.length);
      const generated = getSessionAgent(generatedId);
      if (!generated) return { result: { error: `动态 Agent ${generatedId} 未找到或已过期` } };
      const targetConfig = generatedToConfig(generated);
      const question = String(args.question || '');
      const context = args.context ? String(args.context) : '';
      const fullQuestion = context ? `[背景信息]\n${context}\n\n[问题]\n${question}` : question;
      const mergedAgents = [...allAgents, targetConfig];
      const r = await executeAgentTool(
        targetConfig.id, { question: fullQuestion }, mergedAgents, apiConfig, callbacks, models,
        mcpServers, mcpTools, serverUrl, sessionId, depth, sharedContext,
      );
      return { result: r.response, isAgentDelegation: true, agentName: r.agentName, agentIcon: r.agentIcon, agentColor: r.agentColor };
    }

    // 5. 预定义 Agent 调用（ask_agent_xxx）
    const agentId = parseAgentToolName(toolName);
    if (agentId) {
      const agentResult = await executeAgentTool(
        agentId, args, allAgents, apiConfig, callbacks, models,
        mcpServers, mcpTools, serverUrl, sessionId, depth, sharedContext,
      );
      return { result: agentResult.response, isAgentDelegation: true, agentName: agentResult.agentName, agentIcon: agentResult.agentIcon, agentColor: agentResult.agentColor };
    }

    // 6. MCP 工具
    const mcpParsed = parseMcpToolName(toolName);
    if (mcpParsed) {
      const server = mcpServers.find(s => s.id === mcpParsed.serverId);
      if (!server) return { result: { error: `MCP 服务器 ${mcpParsed.serverId} 未找到` } };
      return { result: await callMcpTool(server.url, mcpParsed.toolName, args, server.apiKey) };
    }

    // 7. 内置工具 — 记录文件修改到共享上下文
    const result = await executeTool(toolName, args, serverUrl, sessionId);
    if (sharedContext && (toolName === 'write_file' || toolName === 'edit_file') && args.path) {
      sharedContext.addModifiedFile(String(args.path));
    }
    return { result };
  } finally {
    if (needsLock && writeMutex) writeMutex.release();
  }
}

// ============ 主循环 ============

/**
 * 运行 Agent 循环
 * @param depth 当前委派嵌套深度（内部使用）
 * @param sharedContext 多 Agent 共享上下文（可选）
 * @returns 最终的文本回复
 */
export async function runAgentLoop(
  apiConfig: ApiConfig,
  messages: ChatMessage[],
  callbacks: AgentCallbacks,
  serverUrl: string = getToolServerUrl(),
  mcpServers: McpServerConfig[] = [],
  mcpTools: McpTool[] = [],
  agent?: AgentConfig,
  allAgents: AgentConfig[] = [],
  models: ModelConfig[] = [],
  sessionId?: string,
  depth: number = 0,
  sharedContext?: SharedContext,
): Promise<string> {
  const conversation: ChatMessage[] = [...messages];
  const maxTokens = agent?.maxTokens || 16384;
  const writeMutex = new Mutex();
  const loopStart = Date.now();
  // 上下文压缩：单次 runAgentLoop 最多触发一次
  let compactedOnce = false;

  for (let i = 0; i < MAX_LOOP; i++) {
    // 超时检查
    if (Date.now() - loopStart > LOOP_TIMEOUT) {
      return '（执行超时，Agent 停止。已运行超过 5 分钟。）';
    }

    // 通知 UI 当前循环进度
    callbacks.onLoopProgress?.(i, MAX_LOOP);

    // 上下文压缩：i=0 跳过（首轮没必要），每个 runAgentLoop 最多触发 1 次
    if (!compactedOnce && i >= 1) {
      const { compactIfNeeded } = await import('./compaction');
      const result = await compactIfNeeded(
        conversation,
        apiConfig,
        streamCompletion,
        (status) => callbacks.onCompaction?.(status)
      );
      if (result) {
        compactedOnce = true;
        // 替换 conversation
        conversation.length = 0;
        conversation.push(...result.nextConversation);
        // 通知 UI 完整结果
        callbacks.onCompactionApplied?.({
          beforeTokens: result.beforeTokens,
          afterTokens: result.afterTokens,
          compressedCount: result.compressedCount,
          summary: result.summary,
        });
        // 把原压缩掉的内容摘要存到 sharedContext，方便后续 Agent 查
        sharedContext?.addFinding('__compaction__', `压缩了 ${result.compressedCount} 条消息，${result.beforeTokens}→${result.afterTokens} tokens。摘要前 200 字：${result.summary.slice(0, 200)}`);
      }
    }

    // 动态重建工具列表（每次迭代刷新，确保 generate_agent 后新工具可见）
    const allTools = buildAllTools(mcpTools, agent, allAgents);

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

    // ====== 并行执行工具调用 ======
    // 先用 Promise.allSettled 并行执行所有工具
    const toolExecutions = response.tool_calls.map(async (toolCall) => {
      const toolName = toolCall.function.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        args = {};
      }

      const stepMeta = toolStepMeta(toolName, allAgents);
      callbacks.onToolCallStart?.(toolName, args, agent?.id, stepMeta);

      const startTime = Date.now();
      let execResult: { result: unknown; isAgentDelegation?: boolean; agentName?: string; agentIcon?: string; agentColor?: string };
      try {
        execResult = await executeAnyTool(
          toolName, args, mcpServers, mcpTools, serverUrl, allAgents,
          apiConfig, callbacks, models, sessionId, depth, sharedContext, writeMutex,
          agent,
        );
      } catch (e) {
        execResult = { result: { error: e instanceof Error ? e.message : String(e) } };
      }
      const duration = Date.now() - startTime;

      callbacks.onToolCallEnd?.(toolName, args, execResult.result, duration, agent?.id, stepMeta);

      return {
        toolCall,
        execResult,
      };
    });

    // 等待所有工具执行完成（allSettled 确保一个失败不影响其他）
    const settled = await Promise.allSettled(toolExecutions);

    // 检测是否有"待用户确认的写操作"——有则中断本轮，让 UI 接管
    let pendingHit: any = null;
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        const r = result.value.execResult.result;
        if (r && typeof r === 'object' && (r as any).__pendingWrite) {
          pendingHit = { toolCall: result.value.toolCall, result: r };
          break;
        }
      }
    }
    if (pendingHit) {
      // ⚠️ 关键修复：不再 return。改为 await 用户确认后，把真实 tool_result 塞回
      // conversation，然后 continue 进入下一轮 loop，让 LLM 自然看到结果并继续执行剩余 todo。
      const pending: import('./tools').PendingWrite = pendingHit.result;

      // 1. 等待 UI 端调 resolve（用户点确认/取消）
      const decision: 'confirm' | 'cancel' = await new Promise((resolve) => {
        if (callbacks.onDiffRequest) {
          callbacks.onDiffRequest(pending, resolve);
        } else {
          // 没有回调时默认确认（避免永久 hang）
          resolve('confirm');
        }
      });

      // 2. 真正调一次 executeTool（此时 pendingArmed 已被 tools.ts 设为 false，不会再触发拦截）
      let toolResult: unknown;
      try {
        toolResult = await executeTool(pending.toolName, pending.args);
      } catch (e) {
        toolResult = { error: e instanceof Error ? e.message : String(e) };
      }

      // 3. 把真实 tool_result 塞回 conversation（让 LLM 看到）
      conversation.push({
        role: 'tool',
        content: typeof toolResult === 'string'
          ? toolResult
          : JSON.stringify(decision === 'cancel'
              ? { status: 'cancelled', message: '用户取消了本次写入。' }
              : { status: 'success', ...(toolResult as Record<string, unknown> | undefined) }),
        tool_call_id: pendingHit.toolCall.id,
      });

      // 4. 继续下一轮 loop（不 return，不 break）
      continue;
    }

    // 按原始顺序将结果加入对话（tool_call_id 对应）
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        const { toolCall, execResult } = result.value;
        conversation.push({
          role: 'tool',
          content: JSON.stringify(execResult.result),
          tool_call_id: toolCall.id,
        });
      } else {
        // 不应该到这里（executeAnyTool 内部 catch 了），但兜底
        conversation.push({
          role: 'tool',
          content: JSON.stringify({ error: result.reason?.message || '工具执行失败' }),
          tool_call_id: '',
        });
      }
    }

    // 继续循环，让 LLM 处理工具结果
  }

  return '（达到最大循环次数，Agent 停止）';
}

export { toolStepType, toolTitle, toolStepMeta };
export type { ToolStepMeta };
export type { SharedContext };
