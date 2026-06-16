/**
 * MD 记忆系统 — 核心 store
 *
 * 设计：
 * - 4 类作用域：soul（全局灵魂）/ user（关于用户）/ agent（Agent 经验）/ memory（项目）
 * - 纯前端 localStorage 持久化
 * - 提供 list/get/save/delete/upsert 基础 CRUD
 * - 提供 buildMemoryInject() 把当前 scope 对应的记忆拼成 Markdown，注入到 system prompt
 * - 提供 detectProjectFromText() 从用户消息里推断 project key
 */
import type { MemoryEntry, MemoryFilter, MemoryCategory, AgentConfig } from '../types';
import { load, save, generateId } from '../utils';

const STORAGE_KEY = 'startup_agent_memories';

// =====================================================
// 基础 CRUD
// =====================================================

/** 读取全部记忆 */
export function loadMemories(): MemoryEntry[] {
  const list = load<MemoryEntry[]>(STORAGE_KEY);
  if (Array.isArray(list)) return list;
  return [];
}

/** 写入全部记忆 */
export function saveMemories(list: MemoryEntry[]): void {
  save(STORAGE_KEY, list);
}

/** 过滤查询（纯函数，不读 store） */
export function filterMemories(all: MemoryEntry[], filter: MemoryFilter): MemoryEntry[] {
  let out = all;
  if (filter.category && filter.category !== 'all') {
    out = out.filter((m) => m.category === filter.category);
  }
  if (filter.project) {
    out = out.filter((m) => m.category !== 'memory' || m.scopeKey === filter.project);
  }
  if (filter.tag) {
    const t = filter.tag.toLowerCase();
    out = out.filter((m) => m.tags.some((x) => x.toLowerCase().includes(t)));
  }
  if (filter.keyword) {
    const k = filter.keyword.toLowerCase();
    out = out.filter(
      (m) =>
        m.title.toLowerCase().includes(k) ||
        m.content.toLowerCase().includes(k) ||
        m.tags.some((x) => x.toLowerCase().includes(k))
    );
  }
  // 按 updatedAt 倒序
  out = out.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  if (filter.limit && filter.limit > 0) {
    out = out.slice(0, filter.limit);
  }
  return out;
}

/** 按 id 查一条 */
export function findMemoryById(all: MemoryEntry[], id: string): MemoryEntry | undefined {
  return all.find((m) => m.id === id);
}

/** 新增一条 */
export function createMemory(
  all: MemoryEntry[],
  input: {
    category: MemoryCategory;
    scopeKey: string;
    title: string;
    content: string;
    tags?: string[];
    source?: MemoryEntry['source'];
  }
): { list: MemoryEntry[]; entry: MemoryEntry } {
  const now = Date.now();
  const entry: MemoryEntry = {
    id: generateId(),
    category: input.category,
    scopeKey: input.scopeKey || (input.category === 'soul' ? 'soul' : input.category === 'user' ? 'user' : 'default'),
    title: input.title,
    content: input.content,
    tags: input.tags || [],
    source: input.source,
    createdAt: now,
    updatedAt: now,
  };
  const list = [entry, ...all];
  saveMemories(list);
  return { list, entry };
}

/** 更新一条（按 id） */
export function updateMemory(
  all: MemoryEntry[],
  id: string,
  patch: Partial<Pick<MemoryEntry, 'title' | 'content' | 'tags' | 'scopeKey' | 'category'>>
): MemoryEntry[] {
  const list = all.map((m) =>
    m.id === id ? { ...m, ...patch, updatedAt: Date.now() } : m
  );
  saveMemories(list);
  return list;
}

/** 删除一条 */
export function deleteMemoryById(all: MemoryEntry[], id: string): MemoryEntry[] {
  const list = all.filter((m) => m.id !== id);
  saveMemories(list);
  return list;
}

// =====================================================
// 项目识别
// =====================================================

/**
 * 从用户最近消息 + Agent 名里推断 project key
 *
 * 简单规则（v1）：
 * 1. 优先看 memories 里 category=memory 的 scopeKey，看有没有出现在用户文本里
 * 2. 否则扫描 "项目 xxx" / "project xxx" / "产品 xxx" 模式
 * 3. 都没有则返回空（不注入项目记忆）
 */
export function detectProjectFromText(
  userText: string,
  all: MemoryEntry[]
): string | null {
  if (!userText) return null;
  const text = userText.toLowerCase();

  // 1. 已知 project 名直接匹配
  const knownProjects = Array.from(
    new Set(all.filter((m) => m.category === 'memory').map((m) => m.scopeKey))
  );
  for (const p of knownProjects) {
    if (p && text.includes(p.toLowerCase())) return p;
  }

  // 2. 关键词模式：「项目 XXX」「Project XXX」「产品 XXX」「在做 XXX」
  const patterns: RegExp[] = [
    /项目\s*([a-z0-9][a-z0-9_\-.]+)/i,
    /project\s+([a-z0-9][a-z0-9_\-.]+)/i,
    /产品\s*([a-z0-9][a-z0-9_\-.]+)/i,
    /产品\s*[:：]\s*([\u4e00-\u9fa5a-z0-9_\-.]+)/i,
  ];
  for (const re of patterns) {
    const m = userText.match(re);
    if (m && m[1]) {
      const key = m[1].toLowerCase();
      // 过滤掉常见停用词
      if (['the', 'a', 'an', 'this', 'that', 'is', 'are'].includes(key)) continue;
      return key;
    }
  }

  return null;
}

// =====================================================
// System Prompt 注入构建器
// =====================================================

/** 把一组 memory 渲染成 Markdown 块（不含标题） */
function renderMemoriesToMarkdown(entries: MemoryEntry[], opts?: { maxChars?: number }): string {
  const max = opts?.maxChars ?? 2000;
  const blocks: string[] = [];
  let used = 0;
  for (const m of entries) {
    const head = `- **${m.title}**` + (m.tags.length ? ` _(${m.tags.join(', ')})_` : '');
    const body = m.content.trim();
    const block = `${head}\n${body}`;
    if (used + block.length > max) {
      // 超长就截断
      const remain = Math.max(0, max - used - head.length - 8);
      if (remain < 50) break;
      blocks.push(`${head}\n${body.slice(0, remain)}…\n（记忆过长已截断，用 get_memory 读取完整内容）`);
      break;
    }
    blocks.push(block);
    used += block.length + 2;
  }
  return blocks.join('\n\n');
}

export interface MemoryInject {
  soulBlock: string;
  userBlock: string;
  agentBlock: string;
  projectBlock: string;
  /** 调试用：本次注入了多少条 */
  counts: { soul: number; user: number; agent: number; project: number };
}

/**
 * 构建记忆注入块（在 system prompt 之前拼接）
 * - soul/user 始终注入
 * - agent 按当前 Agent id 注入
 * - project 按 detectProjectFromText 推断后注入
 */
export function buildMemoryInject(
  all: MemoryEntry[],
  agent: AgentConfig | undefined,
  userText: string
): MemoryInject {
  const soulEntries = filterMemories(all, { category: 'soul' });
  const userEntries = filterMemories(all, { category: 'user' });
  const agentEntries = agent
    ? filterMemories(all, { category: 'agent', project: agent.id })
    : [];
  const project = detectProjectFromText(userText, all);
  const projectEntries = project ? filterMemories(all, { category: 'memory', project }) : [];

  const prefix = '（以下来自长期记忆；仅作参考，以用户最新说法为准。如发现记忆与用户当前说法冲突，以用户为准。）';

  const soulBlock = soulEntries.length
    ? `## 灵魂（全局）\n${prefix}\n\n${renderMemoriesToMarkdown(soulEntries)}`
    : '';
  const userBlock = userEntries.length
    ? `## 关于用户\n${prefix}\n\n${renderMemoriesToMarkdown(userEntries)}`
    : '';
  const agentBlock = agentEntries.length
    ? `## 你（${agent!.name}）的经验\n${prefix}\n\n${renderMemoriesToMarkdown(agentEntries)}`
    : '';
  const projectBlock = projectEntries.length
    ? `## 项目「${project}」记忆\n${prefix}\n\n${renderMemoriesToMarkdown(projectEntries)}`
    : '';

  return {
    soulBlock,
    userBlock,
    agentBlock,
    projectBlock,
    counts: {
      soul: soulEntries.length,
      user: userEntries.length,
      agent: agentEntries.length,
      project: projectEntries.length,
    },
  };
}
