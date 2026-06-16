export interface ApiConfig {
  enabled: boolean;
  url: string;
  key: string;
  model: string;
  /** 透传给 API 的 reasoning_effort（OpenAI o-series / gpt-5 / Claude 等） */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'auto';
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
  /** 推理强度（OpenAI o-series / gpt-5 / Claude extended thinking 等）
   *  - low：少想一点，更快更省
   *  - medium：默认
   *  - high：多想一点，适合复杂任务
   *  - auto：让 API 自己决定（部分 provider 支持）
   */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'auto';
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
  type: 'thinking' | 'read_file' | 'edit_file' | 'write_file' | 'search' | 'tool_call' | 'bash' | 'list_files' | 'info' | 'agent_delegate';
  title: string;
  subtitle?: string;
  content?: string;
  status: 'running' | 'done' | 'error';
  duration?: string;
  /** 执行此步骤的 Agent ID（多 Agent 并行时区分来源） */
  agentId?: string;
  /** 执行此步骤的 Agent 名称 */
  agentName?: string;
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
  /** 产生此消息的 Agent ID（多 Agent 场景） */
  agentId?: string;
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
  /** 被委派时是否允许使用工具（子 Agent 完整能力） */
  delegateTools?: boolean;
  /** 最大委派嵌套深度（防止无限递归，默认 2） */
  maxDepth?: number;
}

/** 文件 I/O 模式：
 *  - cloud：云端（Daytona 沙箱）
 *  - local：本地（浏览器 File System Access API）
 *  - test：测试（server.mjs 本机文件，不走 Daytona）
 *  - none：无后端（纯对话，不暴露任何文件工具，适用于 Netlify 静态部署 / 移动端 / 后端不可用）
 */
export type FileMode = 'cloud' | 'local' | 'test' | 'none';

/** Todo 工具数据结构 */
export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

/** AI 自动生成的 Agent 配置 */
export interface GeneratedAgent {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  lifecycle: 'ephemeral' | 'session' | 'persistent';
  generatedBy: string;        // 触发的 session ID
  parentAgentId?: string;     // 演化的源 Agent
  createdAt: number;
  usageCount: number;
  avgScore?: number;
}

// =====================================================
// MD 记忆系统
// =====================================================

/** 记忆分类（4 类作用域）：
 *  - soul：全局灵魂宣言，注入到所有 Agent 的 system prompt
 *  - user：关于用户的事实，注入到所有 Agent 的 system prompt
 *  - agent：单个 Agent 自己的经验/教训（按 agentId 隔离）
 *  - memory：项目/产品记忆（按 project 字段匹配当前对话上下文）
 */
export type MemoryCategory = 'soul' | 'user' | 'agent' | 'memory';

export interface MemorySource {
  sessionId?: string;
  agentId?: string;
  messageId?: number;
}

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  /** 作用域 key：
   *  - soul/user：固定为 'soul' / 'user'
   *  - agent：agentId（如 'code-expert'）
   *  - memory：project 名称（如 'mvp-v0.1'）
   */
  scopeKey: string;
  title: string;
  content: string;
  tags: string[];
  source?: MemorySource;
  createdAt: number;
  updatedAt: number;
}

/** 记忆查询过滤条件 */
export interface MemoryFilter {
  category?: MemoryCategory | 'all';
  project?: string;
  tag?: string;
  keyword?: string;
  limit?: number;
}