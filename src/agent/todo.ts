/**
 * TodoWrite 工具 — Agent 维护任务计划的工具
 *
 * 强制使用规则（注入到 system prompt）：
 * 1. 收到任何非平凡任务（多步骤）时，第一步必须调用 todowrite 创建完整 todo list
 * 2. 开始新 todo 时，把它标记 in_progress、其余 pending
 * 3. 完成 todo 时立即标记 completed
 * 4. 同一时刻只能有 1 个 in_progress
 * 5. 全部完成后保留 todo list（让用户看到全过程）
 */
import type { ChatCompletionTool } from './api';
import type { TodoItem } from '../types';

/** 工具定义（OpenAI Function Calling 格式） */
export const TODO_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'todowrite',
    description: `维护一个结构化任务列表，跟踪当前任务的进度。

【强制规则】
1. 收到任何非平凡任务（多步骤）时，第一步必须调用本工具创建完整 todo list
2. 开始执行某个 todo 时，立即把它标记为 in_progress
3. 完成一个 todo 时，立即标记为 completed
4. 同一时刻只能有 1 个 todo 处于 in_progress 状态
5. 全部完成后保留 todo list（不要清空），让用户看到全过程
6. 简单问答不需要调用本工具

每个 todo 包含：
- content: 简洁描述（祈使句，如"读取项目根目录"）
- activeForm: 进行时描述（用于 UI 显示在"正在…"之后）`,
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: '完整的 todo 列表（包含所有状态）。每次调用都传完整列表，不是 delta。',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '唯一 ID，使用序号如 t1、t2、t3' },
              content: { type: 'string', description: 'todo 内容的简洁描述（祈使句）' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'todo 的当前状态',
              },
              activeForm: {
                type: 'string',
                description: '进行时描述，显示在"正在…"之后，如"正在读取项目根目录"',
              },
            },
            required: ['id', 'content', 'status', 'activeForm'],
          },
        },
      },
      required: ['todos'],
    },
  },
};

/** 工具执行器 — 内存中维护当前 todo list（session 级别） */
const todoStore: { current: TodoItem[]; listeners: Set<(todos: TodoItem[]) => void> } = {
  current: [],
  listeners: new Set(),
};

export function executeTodoWrite(args: { todos: TodoItem[] }): { ok: boolean; todos: TodoItem[]; message: string } {
  // 验证
  if (!Array.isArray(args.todos)) {
    return { ok: false, todos: todoStore.current, message: 'todos 必须是数组' };
  }

  // 规范化
  const normalized: TodoItem[] = args.todos.map((t, idx) => ({
    id: t.id || `t${idx + 1}`,
    content: t.content || '',
    status: t.status || 'pending',
    activeForm: t.activeForm || t.content || '',
  }));

  // 验证：in_progress 数量
  const inProgressCount = normalized.filter(t => t.status === 'in_progress').length;
  if (inProgressCount > 1) {
    return {
      ok: false,
      todos: todoStore.current,
      message: '同一时刻只能有 1 个 in_progress 的 todo',
    };
  }

  todoStore.current = normalized;
  notifyListeners();
  return {
    ok: true,
    todos: normalized,
    message: `已更新 todo 列表（${normalized.filter(t => t.status === 'completed').length}/${normalized.length} 完成）`,
  };
}

function notifyListeners() {
  for (const fn of todoStore.listeners) {
    fn(todoStore.current);
  }
}

export function getTodos(): TodoItem[] {
  return todoStore.current;
}

export function clearTodos() {
  todoStore.current = [];
  notifyListeners();
}

export function subscribeTodos(fn: (todos: TodoItem[]) => void): () => void {
  todoStore.listeners.add(fn);
  return () => todoStore.listeners.delete(fn);
}

/** 渲染当前 todo 进度文本（用于 UI 展示） */
export function formatTodoProgress(todos: TodoItem[]): string {
  if (todos.length === 0) return '';
  const completed = todos.filter(t => t.status === 'completed').length;
  const total = todos.length;
  const inProgress = todos.find(t => t.status === 'in_progress');
  const parts = [`[${completed}/${total}]`];
  if (inProgress) parts.push(`正在 ${inProgress.activeForm}`);
  return parts.join(' · ');
}
