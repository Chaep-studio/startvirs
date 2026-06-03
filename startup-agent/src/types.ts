export interface ApiConfig {
  enabled: boolean;
  url: string;
  key: string;
  model: string;
}

/** 模型配置 — 支持配置多个 API 提供商/模型 */
export interface ModelConfig {
  id: string;
  /** 显示名称，如 "GPT-4o"、"DeepSeek-V3" */
  name: string;
  /** 图标，如 "ph:openai-logo"、"ph:brain" */
  icon: string;
  /** 颜色 */
  color: string;
  /** API 基础 URL */
  url: string;
  /** API Key */
  key: string;
  /** 模型 ID（传给 API 的值） */
  model: string;
  /** 是否为默认模型 */
  isDefault?: boolean;
  /** 是否启用 */
  enabled: boolean;
}

export interface Skill {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  command: string;
  paramsHint: string;
  systemPrompt: string;
  promptTemplate: string;
  /** 技能包内的引用文件（path -> content），例如 references/*.md, assets/* 等 */
  files?: Record<string, string>;
}

export interface AgentStep {
  id: string;
  type: 'thinking' | 'read_file' | 'edit_file' | 'write_file' | 'search' | 'tool_call' | 'bash' | 'list_files' | 'info';
  title: string;
  subtitle?: string;
  content?: string;
  status: 'running' | 'done' | 'error';
  duration?: string;
}

export interface Message {
  id: number;
  role: 'user' | 'agent' | 'system';
  type: 'text' | 'task';
  text?: string;
  title?: string;
  subtitle?: string;
  content?: string;
  status?: 'loading' | 'done';
  icon?: string;
  color?: string;
  expanded?: boolean;
  time: number;
  /** Agent 执行过程中的步骤列表 */
  steps?: AgentStep[];
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface SidebarAction {
  id: string;
  icon: string;
  label: string;
}

/** MCP 服务器配置 */
export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  apiKey?: string;
  enabled: boolean;
}

/** MCP 工具定义（从 MCP 服务器发现） */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** 所属 MCP 服务器 ID */
  serverId: string;
  /** 在 agent tools 中的全名，格式：mcp__{serverId}__{toolName} */
  fullName: string;
}

/** Agent 配置 — 每个Agent有独立的人格、模型和工具集 */
export interface AgentConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  /** 系统提示词（人格定义） */
  systemPrompt: string;
  /** 是否启用工具调用（Agent模式） */
  useTools: boolean;
  /** 覆盖默认模型 — 旧字段，保留兼容 */
  model?: string;
  /** 关联的 ModelConfig ID（留空则用全局默认模型） */
  modelId?: string;
  /** 温度参数（留空则用默认 0.7） */
  temperature?: number;
  /** 最大 token 数（留空则用默认 16384） */
  maxTokens?: number;
  /** 仅启用的内置工具名列表（空=全部启用） */
  enabledTools?: string[];
  /** 仅关联的 MCP 服务器 ID 列表（空=全部关联） */
  enabledMcpServers?: string[];
  /** 是否允许委托给其他 Agent（协作模式） */
  delegateToAgents?: boolean;
  /** 可委托的目标 Agent ID 列表（空=全部可委托） */
  delegateTargets?: string[];
}