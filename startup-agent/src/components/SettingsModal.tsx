import { useState } from 'react';
import type { ModelConfig } from '../types';
import { generateId } from '../utils';

interface Props {
  models: ModelConfig[];
  defaultModelId: string;
  onModelsChange: (models: ModelConfig[]) => void;
  onDefaultChange: (id: string) => void;
  onClose: () => void;
}

export default function SettingsModal({ models, defaultModelId, onModelsChange, onDefaultChange, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    const newModel: ModelConfig = {
      id: generateId(),
      name: '新模型',
      icon: 'ph:cube',
      color: '#6b7280',
      url: '',
      key: '',
      model: '',
      enabled: true,
    };
    onModelsChange([...models, newModel]);
    setEditingId(newModel.id);
  };

  const handleUpdate = (id: string, update: Partial<ModelConfig>) => {
    onModelsChange(models.map(m => (m.id === id ? { ...m, ...update } : m)));
  };

  const handleDelete = (id: string) => {
    onModelsChange(models.filter(m => m.id !== id));
    if (defaultModelId === id) {
      const first = models.find(m => m.id !== id && m.enabled);
      if (first) onDefaultChange(first.id);
    }
    if (editingId === id) setEditingId(null);
  };

  const handleSetDefault = (id: string) => {
    onDefaultChange(id);
    onModelsChange(models.map(m => ({ ...m, isDefault: m.id === id })));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center anim-fade">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 anim-up max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-stone-900">模型管理</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">配置多个 AI 模型，按需切换</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-stone-100">
            <iconify-icon icon="ph:x" style={{ fontSize: '20px', color: '#78716c' }}></iconify-icon>
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {models.map((model) => (
            <div
              key={model.id}
              className={`rounded-xl p-3 border-2 cursor-pointer transition ${
                defaultModelId === model.id
                  ? 'border-green-300 bg-green-50/50'
                  : 'border-stone-100 bg-stone-50 hover:border-stone-200'
              } ${!model.enabled ? 'opacity-50' : ''}`}
              onClick={() => handleSetDefault(model.id)}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: model.color + '18' }}
                >
                  <iconify-icon icon={model.icon} style={{ fontSize: '18px', color: model.color }}></iconify-icon>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-stone-800">{model.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-stone-100 text-stone-500">{model.model}</span>
                    {defaultModelId === model.id && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-50 text-green-600">默认</span>
                    )}
                    {!model.enabled && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-500">未启用</span>
                    )}
                  </div>
                  <div className="text-[11px] text-stone-400 truncate">{model.url || '未配置 URL'}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUpdate(model.id, { enabled: !model.enabled }); }}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${model.enabled ? 'hover:bg-green-50' : 'hover:bg-red-50'}`}
                  >
                    <iconify-icon icon={model.enabled ? 'ph:power' : 'ph:power-off'} style={{ fontSize: '14px', color: model.enabled ? '#22c55e' : '#a8a29e' }}></iconify-icon>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(editingId === model.id ? null : model.id); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-stone-200/50 transition"
                  >
                    <iconify-icon icon="ph:pencil" style={{ fontSize: '14px', color: '#78716c' }}></iconify-icon>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(model.id); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-stone-400 hover:text-red-500 transition"
                  >
                    <iconify-icon icon="ph:trash" style={{ fontSize: '14px' }}></iconify-icon>
                  </button>
                </div>
              </div>

              {/* 编辑面板 */}
              {editingId === model.id && (
                <div className="mt-3 pt-3 border-t border-stone-200 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold text-stone-500 mb-1 block">名称</label>
                      <input
                        type="text"
                        value={model.name}
                        onChange={(e) => handleUpdate(model.id, { name: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                        placeholder="GPT-4o"
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-[10px] font-semibold text-stone-500 mb-1 block">图标</label>
                      <input
                        type="text"
                        value={model.icon}
                        onChange={(e) => handleUpdate(model.id, { icon: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                        placeholder="ph:brain"
                      />
                    </div>
                    <div className="w-16">
                      <label className="text-[10px] font-semibold text-stone-500 mb-1 block">颜色</label>
                      <input
                        type="color"
                        value={model.color}
                        onChange={(e) => handleUpdate(model.id, { color: e.target.value })}
                        className="w-full h-[30px] rounded-lg border border-stone-200 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-stone-500 mb-1 block">API URL</label>
                    <input
                      type="text"
                      value={model.url}
                      onChange={(e) => handleUpdate(model.id, { url: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-stone-500 mb-1 block">API Key</label>
                    <input
                      type="password"
                      value={model.key}
                      onChange={(e) => handleUpdate(model.id, { key: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                      placeholder="sk-..."
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-stone-500 mb-1 block">模型 ID（传给 API 的值）</label>
                    <input
                      type="text"
                      value={model.model}
                      onChange={(e) => handleUpdate(model.id, { model: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                      placeholder="gpt-4o"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleAdd}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-stone-200 text-[12px] font-medium text-stone-400 hover:border-stone-300 hover:text-stone-500 transition flex items-center justify-center gap-1 mb-4"
        >
          <iconify-icon icon="ph:plus" style={{ fontSize: '14px' }}></iconify-icon>
          添加模型
        </button>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2 mb-4">
          <iconify-icon icon="ph:warning" style={{ fontSize: '16px', color: '#f59e0b', flexShrink: 0, marginTop: 2 }}></iconify-icon>
          <p className="text-[11px] text-amber-700 leading-relaxed">
            API Key 保存在本地浏览器中，仅用于前端直接调用。点击模型卡片可设为默认。Agent 可单独指定使用某个模型。
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white text-[12px] font-semibold active:bg-stone-800 transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
