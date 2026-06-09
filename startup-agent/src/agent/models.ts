import type { ModelConfig } from '../types';
import { load, save } from '../utils';
import { createStore } from './store';

export const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    icon: 'ph:openai-logo',
    color: '#10a37f',
    url: 'https://api.openai.com/v1',
    key: '',
    model: 'gpt-4o',
    isDefault: true,
    enabled: true,
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek-V3',
    icon: 'ph:brain',
    color: '#4f46e5',
    url: 'https://api.deepseek.com/v1',
    key: '',
    model: 'deepseek-chat',
    enabled: false,
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    icon: 'ph:sparkle',
    color: '#d97706',
    url: 'https://api.anthropic.com/v1',
    key: '',
    model: 'claude-sonnet-4-20250514',
    enabled: false,
  },
  {
    id: 'glm-4',
    name: 'GLM-4',
    icon: 'ph:chat-circle-dots',
    color: '#2563eb',
    url: 'https://open.bigmodel.cn/api/paas/v4',
    key: '',
    model: 'glm-4',
    enabled: false,
  },
  {
    id: 'qwen-max',
    name: '通义千问 Max',
    icon: 'ph:cloud',
    color: '#6d28d9',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    key: '',
    model: 'qwen-max',
    enabled: false,
  },
];

const modelStore = createStore<ModelConfig>({
  storageKey: 'startup_agent_models',
  defaults: DEFAULT_MODELS,
});

export const loadModels = modelStore.load;
export const saveModels = modelStore.save;
export const resetModels = modelStore.reset;

export function addModel(models: ModelConfig[], model: Omit<ModelConfig, 'id'>): ModelConfig[] {
  return modelStore.add(models, model);
}

export function updateModel(models: ModelConfig[], updated: ModelConfig): ModelConfig[] {
  return modelStore.update(models, updated);
}

export function deleteModel(models: ModelConfig[], id: string): ModelConfig[] {
  let next = modelStore.remove(models, id);
  // 如果删除的是默认模型，自动选第一个启用的作为默认
  if (next.length > 0 && !next.some(m => m.isDefault)) {
    const firstEnabled = next.find(m => m.enabled);
    if (firstEnabled) {
      next = next.map(m => m.id === firstEnabled.id ? { ...m, isDefault: true } : { ...m, isDefault: false });
      modelStore.save(next);
    }
  }
  return next;
}

const DEFAULT_MODEL_KEY = 'startup_agent_default_model';

export function loadDefaultModelId(): string {
  return load<string>(DEFAULT_MODEL_KEY) || DEFAULT_MODELS[0].id;
}

export function saveDefaultModelId(id: string) {
  save(DEFAULT_MODEL_KEY, id);
}

/** 获取默认模型的完整配置 */
export function getDefaultModel(models: ModelConfig[]): ModelConfig | undefined {
  const id = loadDefaultModelId();
  return models.find(m => m.id === id && m.enabled) || models.find(m => m.enabled);
}

/** 从 ModelConfig 构建 ApiConfig（供旧接口兼容） */
export function modelToApiConfig(model: ModelConfig): import('../types').ApiConfig {
  return {
    enabled: model.enabled,
    url: model.url,
    key: model.key,
    model: model.model,
  };
}

/** 从 Agent 的 modelId 或旧 model 字段，解析出最终的 ApiConfig */
export function resolveApiConfig(
  models: ModelConfig[],
  agentModelId?: string,
  agentLegacyModel?: string,
): import('../types').ApiConfig | null {
  // 优先用 modelId 查找
  if (agentModelId) {
    const found = models.find(m => m.id === agentModelId && m.enabled);
    if (found) return modelToApiConfig(found);
  }
  // 回退到旧 model 字段（兼容旧数据）
  if (agentLegacyModel) {
    const found = models.find(m => m.model === agentLegacyModel && m.enabled);
    if (found) return modelToApiConfig(found);
  }
  // 最终用默认模型
  const defaultModel = getDefaultModel(models);
  if (defaultModel) return modelToApiConfig(defaultModel);
  return null;
}
