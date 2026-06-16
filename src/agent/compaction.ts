/**
 * 上下文压缩（Compaction）— Claude Code 风格
 *
 * 触发：conversation 总 token 超过 COMPACT_THRESHOLD
 * 策略：把"前面 N 条非 system、非 user 的工具/assistant 消息"用 LLM 压缩成一段摘要
 *       摘要插入到 conversation 里"最近 8 轮"之前的位置
 *       原 messages 不动（被截掉的也保留在 chat history / sharedContext 里可查）
 * 限制：单次 runAgentLoop 最多压缩一次（避免反复重压丢信息）
 */
import type { ChatMessage } from './api';
import { estimateMessagesTokens } from './tokenizer';

/** 触发压缩的 token 阈值 */
export const COMPACT_THRESHOLD = 16_000;

/** 压缩后保留的最近轮数（按 user/assistant text 计数；tool 消息随它所属轮走） */
export const KEEP_RECENT_ROUNDS = 8;

/** 压缩结果 */
export interface CompactionResult {
  /** 压缩后替换的 conversation */
  nextConversation: ChatMessage[];
  /** 生成的摘要 Markdown（用于 UI 展示） */
  summary: string;
  /** 压缩前 token 数 */
  beforeTokens: number;
  /** 压缩后 token 数 */
  afterTokens: number;
  /** 实际被压缩的消息条数 */
  compressedCount: number;
}

/** 判断是否需要压缩（首轮刚启动时跳过，避免白白消耗） */
export function shouldCompact(conversation: ChatMessage[]): boolean {
  const tokens = estimateMessagesTokens(conversation);
  return tokens > COMPACT_THRESHOLD;
}

/**
 * 在 conversation 中找到"哪些是 user 轮（user 消息）"，
 * 返回 KEEP_RECENT_ROUNDS 轮之前的**位置索引**（即哪些消息该被压缩）。
 *
 * 规则：保留 system、user 消息、所有工具消息、最后 KEEP_RECENT_ROUNDS 轮 assistant
 *       中其余的 assistant + 它的 tool 都保留；
 *       只压缩"前面那些 assistant + tool"。
 */
function findCutIndex(conversation: ChatMessage[]): number {
  // 先找所有 user 消息的索引
  const userIdx: number[] = [];
  for (let i = 0; i < conversation.length; i++) {
    if (conversation[i].role === 'user') userIdx.push(i);
  }
  if (userIdx.length <= KEEP_RECENT_ROUNDS) return -1; // 不够轮，不压

  // 第 KEEP_RECENT_ROUNDS 个 user 消息的索引（1-based）之前的都压
  // 比如 12 个 user，KEEP=8，则第 9 个 user（idx=8）开始保留，前面到 idx=0..7 全压
  const cutAtUserIdx = userIdx[userIdx.length - KEEP_RECENT_ROUNDS];
  // 跳过 system prompt（如果 cut 之前都是 system，不压）
  let cut = cutAtUserIdx;
  for (let i = 0; i < cutAtUserIdx; i++) {
    if (conversation[i].role !== 'system') {
      cut = i;
      break;
    }
  }
  return cut;
}

/**
 * 构造"让 LLM 总结"的 prompt
 */
export function buildCompactionPrompt(toCompress: ChatMessage[]): { system: string; user: string } {
  // 把 toCompress 序列化成可读文本（限长 12k 字符，超长截断）
  const MAX_CHARS = 12_000;
  const parts: string[] = [];
  let used = 0;
  for (const m of toCompress) {
    const role = m.role;
    let body = '';
    if (typeof m.content === 'string') {
      body = m.content;
    } else if (m.content == null) {
      body = '';
    } else {
      try { body = JSON.stringify(m.content); } catch { body = ''; }
    }
    if (m.tool_calls && m.tool_calls.length) {
      body += `\n[工具调用]\n` + m.tool_calls.map(tc => {
        try { return `- ${tc.function.name}(${tc.function.arguments})`; } catch { return `- ${tc.function.name}(?)`; }
      }).join('\n');
    }
    if (m.tool_call_id) {
      body = `[tool_call_id=${m.tool_call_id}] ` + body;
    }
    const line = `<${role}>\n${body}\n</${role}>`;
    if (used + line.length > MAX_CHARS) {
      parts.push(`<truncated>…剩余 ${toCompress.length - parts.length} 条消息已省略…</truncated>`);
      break;
    }
    parts.push(line);
    used += line.length;
  }

  return {
    system: `你是一个上下文压缩助手。请把下面这段 Agent 执行的对话历史压缩成一段 Markdown 摘要。
要求：
1. 保留"已完成的发现/事实/数据/代码片段位置"（这些不能丢）
2. 保留"用户的需求/约束/偏好"（这些是 Agent 接下来要遵守的）
3. 保留"计划中的下一步"（让 Agent 知道接下来要做什么）
4. 删除"中间推理过程、错误重试、与当前目标无关的探索"
5. 关键数字/路径/标识符必须精确，不能模糊化
6. 用简洁的项目符号列表 + 必要时的小段 Markdown 标题
7. 中文输出`,
    user: `请压缩以下 Agent 对话历史：\n\n${parts.join('\n\n')}`,
  };
}

/**
 * 执行压缩（调一次 LLM，无工具，纯文本）
 * 返回生成的摘要
 */
export async function runCompaction(
  toCompress: ChatMessage[],
  apiConfig: { url: string; key: string; model: string; reasoningEffort?: string; enabled: boolean },
  streamCompletion: (apiConfig: any, messages: { role: string; content: string }[], maxTokens: number) => AsyncGenerator<string>
): Promise<string> {
  const { system, user } = buildCompactionPrompt(toCompress);
  let summary = '';
  for await (const token of streamCompletion(
    apiConfig,
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    2048
  )) {
    summary += token;
  }
  return summary.trim() || '（压缩失败：LLM 无回复）';
}

/**
 * 应用压缩结果到 conversation：
 *   - 保留 system 消息（前面可能有）
 *   - 插入"压缩摘要"作为一个 system 消息
 *   - 保留 KEEP_RECENT_ROUNDS 轮 + 之后的所有消息
 */
export function applyCompaction(
  conversation: ChatMessage[],
  cutIndex: number,
  summary: string
): ChatMessage[] {
  const head = conversation.slice(0, cutIndex);
  const tail = conversation.slice(cutIndex);

  const summaryMsg: ChatMessage = {
    role: 'system',
    content: `【早期对话已压缩为以下摘要，请基于此继续工作；忽略被截断的细节，专注于当前任务】\n\n${summary}`,
  };

  return [...head, summaryMsg, ...tail];
}

/**
 * 一步到位：判断 + 压缩 + 应用
 * 如果不需要压缩，返回 null
 */
export async function compactIfNeeded(
  conversation: ChatMessage[],
  apiConfig: any,
  streamCompletion: any,
  onProgress?: (status: 'judging' | 'compressing' | 'applied') => void
): Promise<CompactionResult | null> {
  onProgress?.('judging');
  if (!shouldCompact(conversation)) return null;

  const beforeTokens = estimateMessagesTokens(conversation);
  const cutIndex = findCutIndex(conversation);
  if (cutIndex < 0) return null;

  const toCompress = conversation.slice(0, cutIndex);
  if (toCompress.length === 0) return null;

  onProgress?.('compressing');
  const summary = await runCompaction(toCompress, apiConfig, streamCompletion);

  onProgress?.('applied');
  const nextConversation = applyCompaction(conversation, cutIndex, summary);
  const afterTokens = estimateMessagesTokens(nextConversation);

  return {
    nextConversation,
    summary,
    beforeTokens,
    afterTokens,
    compressedCount: toCompress.length,
  };
}
