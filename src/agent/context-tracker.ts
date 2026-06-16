/**
 * 上下文窗口追踪：上限、持久化、模型默认上限
 */
import { load, save } from '../utils';

const STORAGE_KEY = 'startup_agent_context_window';
const DEFAULT_LIMIT = 128_000; // Claude Code 默认 128k

/** 各模型默认上下文窗口（用户可手动覆盖） */
const MODEL_DEFAULT_LIMITS: { match: RegExp; limit: number; label: string }[] = [
  { match: /gpt-5/i,            limit: 400_000, label: 'GPT-5' },
  { match: /gpt-4\.1|o3|o4/i,   limit: 200_000, label: 'GPT-4.1 / o-series' },
  { match: /gpt-4o|chatgpt-4o/i, limit: 128_000, label: 'GPT-4o' },
  { match: /claude-sonnet-4-5|claude-3-7|claude-3-5/i, limit: 200_000, label: 'Claude 3.5+/4' },
  { match: /claude/i,           limit: 200_000, label: 'Claude' },
  { match: /deepseek-r1/i,      limit: 64_000,  label: 'DeepSeek-R1' },
  { match: /deepseek/i,         limit: 64_000,  label: 'DeepSeek' },
  { match: /qwen-max|qwen-plus|qwen2\.5/i, limit: 128_000, label: 'Qwen' },
  { match: /qwen/i,             limit: 32_000,  label: 'Qwen' },
  { match: /glm-4-plus|glm-4-long/i, limit: 1_000_000, label: 'GLM-4 Long' },
  { match: /glm/i,              limit: 128_000, label: 'GLM-4' },
  { match: /gemini-1\.5-pro|gemini-2/i, limit: 1_000_000, label: 'Gemini' },
  { match: /gemini/i,           limit: 32_000,  label: 'Gemini' },
];

/** 根据 model id 推断默认上下文窗口 */
export function suggestLimitForModel(modelId: string): { limit: number; label: string } {
  if (!modelId) return { limit: DEFAULT_LIMIT, label: '默认' };
  for (const m of MODEL_DEFAULT_LIMITS) {
    if (m.match.test(modelId)) return { limit: m.limit, label: m.label };
  }
  return { limit: DEFAULT_LIMIT, label: '默认' };
}

/** 读取用户设置的上限 */
export function loadContextLimit(): number {
  const v = load<number>(STORAGE_KEY);
  return typeof v === 'number' && v > 0 ? v : DEFAULT_LIMIT;
}

export function saveContextLimit(limit: number) {
  save(STORAGE_KEY, limit);
}

/** 颜色：按使用比例 */
export function usageColor(percent: number): string {
  if (percent < 50) return '#10b981';   // emerald-500
  if (percent < 75) return '#f59e0b';   // amber-500
  if (percent < 90) return '#f97316';   // orange-500
  return '#ef4444';                     // red-500
}
