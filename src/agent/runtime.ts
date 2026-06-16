/**
 * LLM Provider 模式管理 — 云端 vs 本地
 *
 * - cloud 模式（默认）：使用 ApiConfig（OpenAI 兼容 API，如 GPT-4o、DeepSeek、Kimi 等）
 * - local 模式：使用本地 LLM（Ollama / LM Studio / vLLM 等）
 *   默认 base URL: http://localhost:11434/v1（Ollama）
 *
 * 注意：这跟"文件 I/O 模式"是**两个独立的概念**。
 * - LLM 可以是云端（GPT-4o），文件是本地（用户电脑）
 * - LLM 可以是本地（Ollama），文件是云端（Daytona）
 * 两种模式自由组合。
 */
import type { ApiConfig } from '../types';
import { getAutoUrl } from '../utils';

export type LlmMode = 'cloud' | 'local';

/** 本地 LLM 默认配置（Ollama OpenAI 兼容接口） */
export const LOCAL_LLM_DEFAULTS = {
  url: 'http://localhost:11434/v1',
  key: 'ollama', // Ollama 不需要 key，但 API 要求不能为空
  model: 'qwen2.5-coder:7b',
};

/** 根据 LlmMode 解析出实际调用的 ApiConfig */
export function resolveLlmConfig(
  mode: LlmMode,
  cloudConfig: ApiConfig,
  localConfig?: ApiConfig
): ApiConfig {
  if (mode === 'local') {
    return {
      ...LOCAL_LLM_DEFAULTS,
      ...(localConfig || {}),
      enabled: true,
    } as ApiConfig;
  }
  return cloudConfig;
}

/** 检测本地 LLM 是否可用 */
export async function probeLocalLlm(
  localConfig?: ApiConfig,
  timeoutMs: number = 2000
): Promise<{ available: boolean; models?: string[]; error?: string }> {
  const config = { ...LOCAL_LLM_DEFAULTS, ...(localConfig || {}) };
  const baseUrl = config.url.replace(/\/v1\/?$/, '').replace(/\/chat\/completions\/?$/, '');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { available: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);
    return { available: true, models };
  } catch (e) {
    return {
      available: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 测试 API 连通性（云端） */
export async function probeCloudApi(cloudConfig: ApiConfig): Promise<{ ok: boolean; error?: string }> {
  if (!cloudConfig.enabled || !cloudConfig.key) {
    return { ok: false, error: 'API 未配置' };
  }
  try {
    const targetUrl = getAutoUrl(cloudConfig.url);
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cloudConfig.key}`,
      },
      body: JSON.stringify({
        model: cloudConfig.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      }),
    });
    return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
