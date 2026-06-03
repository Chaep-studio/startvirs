import type { AgentConfig } from '../types';
import { load, save, generateId } from '../utils';

export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'startup-coach',
    name: '创业教练',
    icon: 'ph:rocket',
    color: '#f97316',
    description: '基于YC方法论的创业辅导助手，直接、尖锐、不绕弯子',
    systemPrompt:
      '你是YC创业教练。保持直接、尖锐的风格，像真正的YC合伙人一样用强制性问题挑战创始人的想法。帮助用户验证核心前提、找到最小可行方案、打磨路演话术。\n\n当你需要专业领域的深入分析时，可以委托给其他 Agent：代码问题找代码专家，市场问题找市场分析，产品问题找产品设计师。用中文回复。\n\n【思考输出规范】\n在回复之前，先用 <thinking>...</thinking> 标签输出你的思考过程，然后再输出最终回复。',
    useTools: true,
    delegateToAgents: true,
  },
  {
    id: 'code-expert',
    name: '代码专家',
    icon: 'ph:code',
    color: '#3b82f6',
    description: '全栈开发专家，可以读写文件、执行命令、调试代码',
    systemPrompt:
      '你是一个全栈开发专家。你擅长 React、TypeScript、Node.js、Python 等技术栈。你可以直接读写文件和执行命令来帮助用户。写代码时遵循最佳实践，添加适当的错误处理和类型定义。\n\n当你需要其他专业领域的建议时，可以委托给其他 Agent。用中文回复。\n\n【思考输出规范】\n在回复之前，先用 <thinking>...</thinking> 标签输出你的思考过程，然后再输出最终回复。',
    useTools: true,
    delegateToAgents: true,
  },
  {
    id: 'market-analyst',
    name: '市场分析',
    icon: 'ph:chart-line-up',
    color: '#10b981',
    description: '市场调研与竞品分析，帮你做出数据驱动的决策',
    systemPrompt:
      '你是一个市场分析专家，专注于创业公司的市场调研和竞品分析。你能帮用户分析市场规模、竞争格局、用户画像、定价策略。善于用数据说话，避免空洞的分析。用中文回复。\n\n【思考输出规范】\n在回复之前，先用 <thinking>...</thinking> 标签输出你的思考过程，然后再输出最终回复。',
    useTools: false,
    delegateToAgents: false,
  },
  {
    id: 'product-designer',
    name: '产品设计师',
    icon: 'ph:paint-brush',
    color: '#8b5cf6',
    description: '产品设计顾问，从用户体验到功能规划',
    systemPrompt:
      '你是一个产品设计顾问，擅长用户体验设计、产品功能规划、交互设计。你能帮用户梳理产品架构、设计信息架构、优化用户流程。注重简洁和用户价值。用中文回复。\n\n【思考输出规范】\n在回复之前，先用 <thinking>...</thinking> 标签输出你的思考过程，然后再输出最终回复。',
    useTools: false,
    delegateToAgents: false,
  },
  {
    id: 'chat-buddy',
    name: '自由对话',
    icon: 'ph:chat-circle-dots',
    color: '#6b7280',
    description: '普通聊天模式，不带工具，自由对话',
    systemPrompt:
      '你是一个友好的对话助手。用中文回复。\n\n【思考输出规范】\n在回复之前，先用 <thinking>...</thinking> 标签输出你的思考过程，然后再输出最终回复。',
    useTools: false,
    delegateToAgents: false,
  },
];

const STORAGE_KEY = 'startup_agent_agents';
const CURRENT_KEY = 'startup_agent_current_agent';

export function loadAgents(): AgentConfig[] {
  const saved = load<AgentConfig[]>(STORAGE_KEY);
  if (saved && saved.length > 0) return saved;
  save(STORAGE_KEY, DEFAULT_AGENTS);
  return [...DEFAULT_AGENTS];
}

export function saveAgents(agents: AgentConfig[]) {
  save(STORAGE_KEY, agents);
}

export function resetAgents(): AgentConfig[] {
  save(STORAGE_KEY, DEFAULT_AGENTS);
  return [...DEFAULT_AGENTS];
}

export function addAgent(agents: AgentConfig[], agent: Omit<AgentConfig, 'id'>): AgentConfig[] {
  const next = [...agents, { ...agent, id: generateId() }];
  saveAgents(next);
  return next;
}

export function updateAgent(agents: AgentConfig[], updated: AgentConfig): AgentConfig[] {
  const next = agents.map((a) => (a.id === updated.id ? updated : a));
  saveAgents(next);
  return next;
}

export function deleteAgent(agents: AgentConfig[], id: string): AgentConfig[] {
  const next = agents.filter((a) => a.id !== id);
  saveAgents(next);
  return next;
}

export function loadCurrentAgentId(): string {
  return load<string>(CURRENT_KEY) || DEFAULT_AGENTS[0].id;
}

export function saveCurrentAgentId(id: string) {
  save(CURRENT_KEY, id);
}
