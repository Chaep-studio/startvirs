/**
 * 记忆工具：save_memory / list_memories / get_memory / delete_memory
 *
 * 通过全局注入的 memoryOps 回调执行（不直接依赖 React state，
 * 因为工具会在 agent-loop 的非 React 上下文里被调用）。
 */
import type { ChatCompletionTool } from './api';
import type { MemoryCategory, MemoryEntry, MemoryFilter } from '../types';
import { filterMemories, findMemoryById } from './memory';

/** 记忆操作器（由 App.tsx 注入） */
export interface MemoryOps {
  /** 当前全部记忆（实时引用） */
  getAll: () => MemoryEntry[];
  /** 保存新记忆 / 追加，返回新条目 */
  create: (input: {
    category: MemoryCategory;
    scopeKey: string;
    title: string;
    content: string;
    tags?: string[];
    source?: MemoryEntry['source'];
  }) => MemoryEntry;
  /** 按 id 更新 */
  update: (id: string, patch: Partial<Pick<MemoryEntry, 'title' | 'content' | 'tags' | 'scopeKey' | 'category'>>) => MemoryEntry | null;
  /** 按 id 删除，返回是否成功 */
  remove: (id: string) => boolean;
}

let currentOps: MemoryOps | null = null;

/** App.tsx 在 mount 时调用，注入真实操作器 */
export function setMemoryOps(ops: MemoryOps) {
  currentOps = ops;
}

function requireOps(): MemoryOps {
  if (!currentOps) {
    throw new Error('记忆系统未初始化（setMemoryOps 未被调用）');
  }
  return currentOps;
}

// =====================================================
// 工具定义
// =====================================================

export const MEMORY_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description:
        '保存一条重要信息到长期记忆。category 取值：soul（全局灵魂，给所有 Agent 共享）/ user（关于用户的事实）/ agent（你自己学到的经验，会按 Agent 隔离）/ memory（项目级记忆，必须传 project 字段）。当用户说"记住 XX""以后都这样做""这个挺重要"等时调用。',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['soul', 'user', 'agent', 'memory'],
            description: '记忆分类',
          },
          title: { type: 'string', description: '简短标题，便于列表展示' },
          content: { type: 'string', description: '完整 Markdown 内容' },
          project: {
            type: 'string',
            description: '仅 memory 分类需要：项目名（如 mvp-v0.1），用作 scopeKey',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '可选标签数组，便于后续搜索',
          },
        },
        required: ['category', 'title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_memories',
      description:
        '查询记忆库。可按分类、项目、标签或关键词过滤。返回摘要列表（不含完整 content），完整内容用 get_memory 读取。',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['soul', 'user', 'agent', 'memory', 'all'],
            description: '按分类过滤，all=不过滤',
          },
          project: { type: 'string', description: '按项目名过滤（仅 memory 分类生效）' },
          tag: { type: 'string', description: '按标签过滤（模糊匹配）' },
          keyword: { type: 'string', description: '在 title/content/tags 里搜索关键词' },
          limit: { type: 'number', description: '返回条数上限，默认 20' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_memory',
      description: '按 id 读取一条记忆的完整 Markdown 内容。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '记忆条目 id（list_memories 返回的 id）' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_memory',
      description: '按 id 删除一条记忆。仅删除明确不再需要的过期记忆，谨慎调用。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '记忆条目 id' },
        },
        required: ['id'],
      },
    },
  },
];

// =====================================================
// 执行器
// =====================================================

/** 把执行结果序列化成字符串（与 executeAnyTool 行为一致） */
function ok(payload: unknown) {
  return payload;
}

export async function executeMemoryTool(
  toolName: string,
  args: Record<string, unknown>,
  source?: MemoryEntry['source']
): Promise<unknown> {
  const ops = requireOps();
  switch (toolName) {
    case 'save_memory': {
      const category = String(args.category || '') as MemoryCategory;
      if (!['soul', 'user', 'agent', 'memory'].includes(category)) {
        return ok({ error: `未知 category: ${category}` });
      }
      const title = String(args.title || '').trim();
      const content = String(args.content || '').trim();
      if (!title || !content) {
        return ok({ error: 'title 和 content 都不能为空' });
      }
      // scopeKey 推断
      let scopeKey = '';
      if (category === 'soul') scopeKey = 'soul';
      else if (category === 'user') scopeKey = 'user';
      else if (category === 'agent') scopeKey = source?.agentId || 'default';
      else if (category === 'memory') {
        scopeKey = String(args.project || '').trim();
        if (!scopeKey) return ok({ error: 'memory 分类必须传 project 字段作为 scopeKey' });
      }
      const tags = Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : [];
      const entry = ops.create({ category, scopeKey, title, content, tags, source });
      return ok({
        id: entry.id,
        category: entry.category,
        scopeKey: entry.scopeKey,
        title: entry.title,
        hint: `已保存到「${category}${category === 'memory' ? '/' + scopeKey : ''}」`,
      });
    }

    case 'list_memories': {
      const filter: MemoryFilter = {
        category: (args.category as MemoryFilter['category']) || 'all',
        project: args.project ? String(args.project) : undefined,
        tag: args.tag ? String(args.tag) : undefined,
        keyword: args.keyword ? String(args.keyword) : undefined,
        limit: typeof args.limit === 'number' ? args.limit : 20,
      };
      const items = filterMemories(ops.getAll(), filter).map((m) => ({
        id: m.id,
        category: m.category,
        scopeKey: m.scopeKey,
        title: m.title,
        tags: m.tags,
        preview: m.content.slice(0, 120) + (m.content.length > 120 ? '…' : ''),
        updatedAt: m.updatedAt,
      }));
      return ok({ count: items.length, items });
    }

    case 'get_memory': {
      const id = String(args.id || '');
      if (!id) return ok({ error: 'id 不能为空' });
      const m = findMemoryById(ops.getAll(), id);
      if (!m) return ok({ error: `未找到 id=${id}` });
      return ok({
        id: m.id,
        category: m.category,
        scopeKey: m.scopeKey,
        title: m.title,
        tags: m.tags,
        content: m.content,
        updatedAt: m.updatedAt,
        createdAt: m.createdAt,
      });
    }

    case 'delete_memory': {
      const id = String(args.id || '');
      if (!id) return ok({ error: 'id 不能为空' });
      const success = ops.remove(id);
      return ok({ id, success: success, hint: success ? '已删除' : '未找到' });
    }

    default:
      return ok({ error: `未知记忆工具: ${toolName}` });
  }
}
