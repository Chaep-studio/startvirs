/**
 * OpenAI Function Calling 格式的工具定义
 * 告诉 LLM 它可以调用哪些工具
 */
import type { ChatCompletionTool } from './api';

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取指定路径的文件内容。路径相对于项目根目录。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要读取的文件路径，相对于项目根目录，例如 "src/App.tsx"',
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
          path: {
            type: 'string',
            description: '文件路径，相对于项目根目录',
          },
          content: {
            type: 'string',
            description: '要写入的完整文件内容',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: '精确编辑文件中的一部分内容。通过 old_str 查找唯一匹配并替换为 new_str。old_str 必须在文件中唯一。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件路径，相对于项目根目录',
          },
          old_str: {
            type: 'string',
            description: '要被替换的原文本（必须精确匹配，包括缩进和空行）',
          },
          new_str: {
            type: 'string',
            description: '替换后的新文本',
          },
        },
        required: ['path', 'old_str', 'new_str'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description: '在项目目录中执行 shell 命令。可以运行构建、测试、安装依赖等。命令执行有 30 秒超时限制。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的 shell 命令',
          },
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
          path: {
            type: 'string',
            description: '目录路径，默认为项目根目录',
          },
        },
        required: [],
      },
    },
  },
];

/** 工具服务器的默认地址 */
export const TOOL_SERVER_URL = 'http://localhost:3456';

/**
 * 调用工具服务器执行一个工具
 * sessionId 用于在 Daytona 云端沙箱中标识用户隔离环境
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  serverUrl: string = TOOL_SERVER_URL,
  sessionId?: string,
): Promise<unknown> {
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
