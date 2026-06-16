/**
 * AI 自定义 Agent — 让 LLM 按需动态生成 Agent
 *
 * 工作流：
 * 1. 当前 Agent 调 generate_agent 工具 → 提供角色描述
 * 2. LLM 合成完整 Agent 配置（系统 prompt + 工具集 + 生命周期）
 * 3. 当前会话获得新 Agent 的能力，可立即 ask_agent_xxx 委派任务
 *
 * 3 种生命周期：
 * - ephemeral: 任务结束丢弃（默认）
 * - session: 当前 session 内有效
 * - persistent: 跨 session 永久保存
 */
import type { ChatCompletionTool } from './api';
import type { AgentConfig, GeneratedAgent } from '../types';
import { executeTodoWrite } from './todo';

const AGENT_GENERATION_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'generate_agent',
    description: `为某个子任务动态创建一个专用的 Agent。

【何时使用】
- 用户问题涉及你当前 Agent 不擅长的专业领域
- 需要多个专家协作完成一个复杂任务
- 发现需要"专人专事"才能更好地服务用户

【生命周期选择】
- ephemeral（默认）：仅在当前任务中使用，结束即丢
- session：在当前 session 中复用，session 结束清理
- persistent：用户显式要求"留下这个 Agent"时才用

【重要】调完本工具后，你应该用 ask_agent_xxx 立即调用它完成任务。`,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent 名字（简短，如"跨境税务专家"）' },
        icon: {
          type: 'string',
          description: 'Phosphor 图标名（ph: 开头），如 ph:scales、ph:briefcase',
        },
        color: {
          type: 'string',
          description: '代表色（HEX），如 #7c3aed',
        },
        description: { type: 'string', description: '一句话角色描述' },
        systemPrompt: {
          type: 'string',
          description: '完整的系统提示词（200-500 字），定义人格、风格、专业范围',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: '需要的工具列表（从 read_file/write_file/edit_file/bash/list_files 中选，可选：todowrite）',
        },
        lifecycle: {
          type: 'string',
          enum: ['ephemeral', 'session', 'persistent'],
          description: '生命周期',
        },
        task: {
          type: 'string',
          description: '这个 Agent 要完成的具体任务（合成后自动执行）',
        },
      },
      required: ['name', 'icon', 'color', 'description', 'systemPrompt', 'task'],
    },
  },
};

export { AGENT_GENERATION_TOOL };

/** 当前 session 的临时 Agent 池 */
const sessionAgents = new Map<string, GeneratedAgent>();
/** 持久 Agent 池（由调用方提供持久化） */
const persistentAgents = new Map<string, GeneratedAgent>();

export function executeGenerateAgent(
  args: {
    name: string;
    icon: string;
    color: string;
    description: string;
    systemPrompt: string;
    tools?: string[];
    lifecycle?: 'ephemeral' | 'session' | 'persistent';
    task: string;
  },
  sessionId: string,
  parentAgentId?: string
): { ok: boolean; agentId: string; agentName: string; message: string } {
  const lifecycle = args.lifecycle || 'ephemeral';
  const agent: GeneratedAgent = {
    id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: args.name,
    icon: args.icon,
    color: args.color,
    description: args.description,
    systemPrompt: args.systemPrompt,
    tools: args.tools || ['read_file', 'list_files'],
    lifecycle,
    generatedBy: sessionId,
    parentAgentId,
    createdAt: Date.now(),
    usageCount: 0,
  };

  if (lifecycle === 'persistent') {
    persistentAgents.set(agent.id, agent);
  } else {
    sessionAgents.set(agent.id, agent);
  }

  return {
    ok: true,
    agentId: agent.id,
    agentName: agent.name,
    message: `已生成 Agent「${args.name}」（${lifecycle}）`,
  };
}

export function getSessionAgent(id: string): GeneratedAgent | undefined {
  return sessionAgents.get(id) || persistentAgents.get(id);
}

export function getAllSessionAgents(): GeneratedAgent[] {
  return Array.from(sessionAgents.values());
}

export function getAllPersistentAgents(): GeneratedAgent[] {
  return Array.from(persistentAgents.values());
}

export function clearSessionAgents() {
  sessionAgents.clear();
}

export function promoteToPersistent(agentId: string) {
  const agent = sessionAgents.get(agentId);
  if (agent) {
    agent.lifecycle = 'persistent';
    persistentAgents.set(agent.id, agent);
    sessionAgents.delete(agent.id);
  }
  return persistentAgents.get(agentId);
}

export function discardAgent(agentId: string) {
  sessionAgents.delete(agentId);
  persistentAgents.delete(agentId);
}

/** 把 GeneratedAgent 转换为可用的 AgentConfig（用于 ask_agent_xxx 委派） */
export function generatedToConfig(agent: GeneratedAgent): AgentConfig {
  return {
    id: `ask_agent_gen_${agent.id}`,
    name: agent.name,
    icon: agent.icon,
    color: agent.color,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    useTools: true,
    enabledTools: agent.tools,
    delegateToAgents: false,
  };
}

/** 把所有 session agent 转成 AgentConfig 列表（用于 buildAgentTools） */
export function getSessionAgentConfigs(): AgentConfig[] {
  return Array.from(sessionAgents.values()).map(generatedToConfig);
}
