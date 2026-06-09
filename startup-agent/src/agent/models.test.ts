import { describe, it, expect, beforeEach } from 'vitest';
import type { ModelConfig } from '../types';
import {
  DEFAULT_MODELS,
  loadModels,
  saveModels,
  resetModels,
  addModel,
  updateModel,
  deleteModel,
  loadDefaultModelId,
  saveDefaultModelId,
  getDefaultModel,
  modelToApiConfig,
  resolveApiConfig,
} from './models';

const STORAGE_KEY = 'startup_agent_models';
const DEFAULT_MODEL_KEY = 'startup_agent_default_model';

function makeModel(over: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'm1',
    name: 'Model 1',
    icon: 'ph:brain',
    color: '#000',
    url: 'https://api.test/v1',
    key: 'sk-1',
    model: 'model-1',
    enabled: true,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('loadModels', () => {
  it('seeds and returns defaults when nothing is stored', () => {
    const models = loadModels();
    expect(models).toHaveLength(DEFAULT_MODELS.length);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(
      DEFAULT_MODELS.length
    );
  });

  it('returns stored models when present', () => {
    saveModels([makeModel({ id: 'custom', name: 'Custom' })]);
    const models = loadModels();
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe('Custom');
  });

  it('falls back to defaults when stored list is empty', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    expect(loadModels()).toHaveLength(DEFAULT_MODELS.length);
  });
});

describe('resetModels', () => {
  it('overwrites storage with defaults', () => {
    saveModels([makeModel()]);
    const reset = resetModels();
    expect(reset).toHaveLength(DEFAULT_MODELS.length);
    expect(loadModels()).toHaveLength(DEFAULT_MODELS.length);
  });
});

describe('addModel', () => {
  it('appends a model with a generated id and persists it', () => {
    const next = addModel([], {
      name: 'New',
      icon: 'ph:x',
      color: '#fff',
      url: 'u',
      key: 'k',
      model: 'mm',
      enabled: true,
    });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(1);
  });
});

describe('updateModel', () => {
  it('replaces the matching model and leaves others alone', () => {
    const a = makeModel({ id: 'a', name: 'A' });
    const b = makeModel({ id: 'b', name: 'B' });
    const next = updateModel([a, b], { ...b, name: 'B2' });
    expect(next.find((m) => m.id === 'b')!.name).toBe('B2');
    expect(next.find((m) => m.id === 'a')!.name).toBe('A');
  });
});

describe('deleteModel', () => {
  it('removes the model by id', () => {
    const a = makeModel({ id: 'a' });
    const b = makeModel({ id: 'b' });
    const next = deleteModel([a, b], 'a');
    expect(next.map((m) => m.id)).toEqual(['b']);
  });

  it('promotes the first enabled model to default when the default is deleted', () => {
    const def = makeModel({ id: 'a', isDefault: true });
    const other = makeModel({ id: 'b', enabled: true });
    const next = deleteModel([def, other], 'a');
    expect(next.find((m) => m.id === 'b')!.isDefault).toBe(true);
  });

  it('does not assign a default when no remaining model is enabled', () => {
    const def = makeModel({ id: 'a', isDefault: true });
    const disabled = makeModel({ id: 'b', enabled: false });
    const next = deleteModel([def, disabled], 'a');
    expect(next.some((m) => m.isDefault)).toBe(false);
  });
});

describe('default model id persistence', () => {
  it('returns the first default model id when none stored', () => {
    expect(loadDefaultModelId()).toBe(DEFAULT_MODELS[0].id);
  });

  it('round-trips a saved default model id', () => {
    saveDefaultModelId('deepseek-v3');
    expect(loadDefaultModelId()).toBe('deepseek-v3');
    expect(JSON.parse(localStorage.getItem(DEFAULT_MODEL_KEY)!)).toBe(
      'deepseek-v3'
    );
  });
});

describe('getDefaultModel', () => {
  it('returns the enabled model matching the stored default id', () => {
    const models = [
      makeModel({ id: 'a', enabled: true }),
      makeModel({ id: 'b', enabled: true }),
    ];
    saveDefaultModelId('b');
    expect(getDefaultModel(models)!.id).toBe('b');
  });

  it('falls back to the first enabled model when the default is disabled', () => {
    const models = [
      makeModel({ id: 'a', enabled: false }),
      makeModel({ id: 'b', enabled: true }),
    ];
    saveDefaultModelId('a');
    expect(getDefaultModel(models)!.id).toBe('b');
  });

  it('returns undefined when no model is enabled', () => {
    const models = [makeModel({ id: 'a', enabled: false })];
    saveDefaultModelId('a');
    expect(getDefaultModel(models)).toBeUndefined();
  });
});

describe('modelToApiConfig', () => {
  it('maps the relevant fields into an ApiConfig', () => {
    const model = makeModel({ enabled: true, url: 'U', key: 'K', model: 'M' });
    expect(modelToApiConfig(model)).toEqual({
      enabled: true,
      url: 'U',
      key: 'K',
      model: 'M',
    });
  });
});

describe('resolveApiConfig', () => {
  const models = [
    makeModel({ id: 'a', model: 'legacy-a', enabled: true }),
    makeModel({ id: 'b', model: 'legacy-b', enabled: false }),
  ];

  it('resolves by enabled modelId first', () => {
    const cfg = resolveApiConfig(models, 'a');
    expect(cfg).not.toBeNull();
    expect(cfg!.url).toBe('https://api.test/v1');
  });

  it('skips a disabled modelId and falls through to legacy/default', () => {
    saveDefaultModelId('a');
    const cfg = resolveApiConfig(models, 'b');
    expect(cfg).not.toBeNull();
  });

  it('resolves via the legacy model field when no modelId match', () => {
    const cfg = resolveApiConfig(models, undefined, 'legacy-a');
    expect(cfg!.model).toBe('legacy-a');
  });

  it('falls back to the default model when nothing else matches', () => {
    saveDefaultModelId('a');
    const cfg = resolveApiConfig(models, 'nope', 'also-nope');
    expect(cfg).not.toBeNull();
  });

  it('returns null when no enabled model exists at all', () => {
    const disabled = [makeModel({ id: 'x', enabled: false })];
    saveDefaultModelId('x');
    expect(resolveApiConfig(disabled, 'x')).toBeNull();
  });
});
