/**
 * OpenAI Function Calling 格式的工具定义
 * 告诉 LLM 它可以调用哪些工具
 *
 * 工具实现支持两种文件 I/O 模式：
 * - cloud（默认）：HTTP 调用 server.mjs（Daytona 沙箱）
 * - local：浏览器 File System Access API
 */
import type { ChatCompletionTool } from './api';
import type { FileMode } from './file-runtime';
import {
  localReadFile,
  localWriteFile,
  localEditFile,
  localListFiles,
  localGrep,
  localGlob,
  getLocalDirHandle,
} from './file-runtime';

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        '读取指定路径的文件内容。路径相对于项目根目录（本地模式是用户授权的目录，云端模式是 Daytona 沙箱）。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要读取的文件路径，相对于项目根目录',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '创建或覆盖一个文件。会自动创建所需的父目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '要写入的完整文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        '精确编辑文件中的一部分内容。通过 old_str 查找唯一匹配并替换为 new_str。old_str 必须在文件中唯一。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          old_str: { type: 'string', description: '要被替换的原文本（必须精确匹配）' },
          new_str: { type: 'string', description: '替换后的新文本' },
        },
        required: ['path', 'old_str', 'new_str'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description:
        '在项目目录中执行 shell 命令（构建、测试、安装依赖等）。云端/测试模式可用，本地模式不可用。测试模式下命令会在 server 本机真实执行。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的 shell 命令' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出指定目录下的文件和子目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，默认为项目根目录' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description:
        '在项目文件中搜索正则表达式，返回匹配行（带文件名和行号）。比 read_file 更适合"在某处找到 XX"的场景。会自动跳过 node_modules/.git/dist 等大目录。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '搜索的起始目录，相对于项目根目录，默认为 .',
          },
          pattern: {
            type: 'string',
            description: '正则表达式（POSIX 扩展正则 / 浏览器 JavaScript 语法）',
          },
          include: {
            type: 'string',
            description: '可选文件过滤 glob，如 "*.ts" "src/**/*.tsx"',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description:
        '用 glob 模式查找文件路径。** 支持递归（如 "src/**/*.ts"），* 匹配单层，? 匹配单字符。返回文件路径列表（相对项目根）。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '搜索的起始目录，相对于项目根目录，默认为 .',
          },
          pattern: {
            type: 'string',
            description: 'glob 模式，如 "**/*.json" "src/components/*.tsx"',
          },
        },
        required: ['pattern'],
      },
    },
  },
];

/** 工具服务器的默认地址（被 sandbox-config 中的 URL 覆盖） */
export const DEFAULT_TOOL_SERVER_URL = 'http://localhost:3456';

/** 当前生效的工具服务器地址（可通过 setToolServerUrl 在运行时覆盖） */
let currentToolServerUrl: string = DEFAULT_TOOL_SERVER_URL;

/** 设置工具服务器 URL（通常由 App.tsx 在加载 sandbox-config 时调用） */
export function setToolServerUrl(url: string) {
  const cleaned = url.trim().replace(/\/+$/, '');
  currentToolServerUrl = cleaned || DEFAULT_TOOL_SERVER_URL;
}

/** 获取当前工具服务器 URL */
export function getToolServerUrl(): string {
  return currentToolServerUrl;
}

/** 当前 file mode（由 App.tsx 通过 setFileMode 设置） */
let currentFileMode: FileMode = 'cloud';

export function setFileMode(mode: FileMode) {
  currentFileMode = mode;
}

export function getFileMode(): FileMode {
  return currentFileMode;
}

// =====================================================
// Diff 确认（写文件前弹窗）
// =====================================================

/** 本轮 ReAct 内"是否已弹过一次 diff"。每次新轮次（App.tsx 调）重置成 true */
let pendingArmed = true;

export function armPendingWrite() {
  pendingArmed = true;
}

export function consumePendingWrite() {
  pendingArmed = false;
}

/** 标记一个"待用户确认的写操作" */
export interface PendingWrite {
  __pendingWrite: true;
  toolName: 'write_file' | 'edit_file';
  path: string;
  /** write_file：要写入的完整新内容；edit_file：new_str */
  newContent: string;
  /** edit_file 时附带 old_str，用于 UI 展示"替换前"片段 */
  oldStr?: string;
  /** edit_file 时文件原内容（来自 localReadFile 提前拉取） */
  oldContent?: string;
  /** 原始参数（用于 confirm 后真正调 executeTool） */
  args: Record<string, unknown>;
}

/**
 * 执行内置文件工具（自动根据 fileMode 路由到云端 / 本地 / 测试）
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  serverUrl: string = getToolServerUrl(),
  sessionId?: string
): Promise<unknown> {
  // 无后端模式：完全不暴露文件工具
  if (currentFileMode === 'none') {
    throw new Error('当前是无后端模式（纯对话），文件工具不可用。请在右上角切换到云端/本地/测试模式。');
  }

  // ⚠️ Diff 确认拦截：write_file / edit_file 第一次需要 UI 弹窗确认
  if ((toolName === 'write_file' || toolName === 'edit_file') && pendingArmed) {
    const confirmOn = typeof window !== 'undefined' &&
      localStorage.getItem('startup_agent_diff_confirm') === '1';
    if (confirmOn) {
      pendingArmed = false; // 本轮后续写操作不再拦截
      const path = String(args.path || '');
      if (toolName === 'write_file') {
        return {
          __pendingWrite: true,
          toolName: 'write_file',
          path,
          newContent: String(args.content || ''),
          args,
        } satisfies PendingWrite;
      } else {
        // edit_file：尝试读原文（仅 local 模式能直接读；其他模式让 server 端拦截时再读）
        let oldContent: string | undefined;
        if (currentFileMode === 'local' && getLocalDirHandle()) {
          try {
            const r = await localReadFile(path);
            oldContent = r.content;
          } catch { /* 文件可能不存在 */ }
        }
        return {
          __pendingWrite: true,
          toolName: 'edit_file',
          path,
          newContent: String(args.new_str || ''),
          oldStr: String(args.old_str || ''),
          oldContent,
          args,
        } satisfies PendingWrite;
      }
    }
  }

  // ⚠️ 本地模式的 bash 工具：默认禁用，必须用户在设置里开启
  // 风险：命令直接跑在 server.mjs 所在机器上，无任何沙箱
  if (currentFileMode === 'local' && toolName === 'bash') {
    const enabled = typeof window !== 'undefined' &&
      localStorage.getItem('startup_agent_local_bash_enabled') === '1';
    if (!enabled) {
      throw new Error('本地 bash 未启用。请到 设置 → 高级 勾选「允许本地 bash 工具（⚠️ 高危）」。');
    }
    // 走专门的本地 bash 端点（不走 Daytona、不走 TEST_WORKSPACE）
    console.warn('[local-bash] ⚠️ 即将在 server 本机执行无沙箱命令');
    const res = await fetch(`${serverUrl}/api/local/bash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`本地 bash 错误 ${res.status}: ${err}`);
    }
    return res.json();
  }

  // 本地模式：走浏览器 File System Access API
  if (currentFileMode === 'local') {
    switch (toolName) {
      case 'read_file':
        return await localReadFile(String(args.path || ''));
      case 'write_file':
        return await localWriteFile(String(args.path || ''), String(args.content || ''));
      case 'edit_file':
        return await localEditFile(
          String(args.path || ''),
          String(args.old_str || ''),
          String(args.new_str || '')
        );
      case 'list_files':
        return { entries: await localListFiles(String(args.path || '.')) };
      case 'grep':
        return await localGrep(
          String(args.path || '.'),
          String(args.pattern || ''),
          args.include ? String(args.include) : undefined
        );
      case 'glob':
        return await localGlob(
          String(args.path || '.'),
          String(args.pattern || '')
        );
      default:
        throw new Error(`本地模式不支持工具: ${toolName}`);
    }
  }

  // 测试模式：HTTP 调用工具服务器的 /api/test/* 端点（不走 Daytona）
  if (currentFileMode === 'test') {
    const res = await fetch(`${serverUrl}/api/test/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`测试模式工具错误 ${res.status}: ${err}`);
    }
    return res.json();
  }

  // 云端模式：HTTP 调用工具服务器（Daytona 沙箱）
  const body = sessionId ? { ...args, __sessionId: sessionId } : args;
  const res = await fetch(`${serverUrl}/api/tools/${toolName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`工具服务器错误 ${res.status}: ${err}`);
  }
  return res.json();
}
