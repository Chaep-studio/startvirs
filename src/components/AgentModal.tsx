import { useState } from 'react';
import type { AgentConfig, ModelConfig } from '../types';
import { generateId } from '../utils';

interface Props {
  agents: AgentConfig[];
  currentAgentId: string;
  models: ModelConfig[];
  onAgentsChange: (agents: AgentConfig[]) => void;
  onCurrentChange: (id: string) => void;
  onClose: () => void;
}

export default function AgentModal({ agents, currentAgentId, models, onAgentsChange, onCurrentChange, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    const newAgent: AgentConfig = {
      id: generateId(),
      name: '新 Agent',
      icon: 'ph:bot',
      color: '#6b7280',
      description: '',
      systemPrompt: '你是一个有帮助的助手。用中文回复。',
      useTools: false,
    };
    onAgentsChange([...agents, newAgent]);
    setEditingId(newAgent.id);
  };

  const handleUpdate = (id: string, update: Partial<AgentConfig>) => {
    onAgentsChange(agents.map(a => (a.id === id ? { ...a, ...update } : a)));
  };

  const handleDelete = (id: string) => {
    onAgentsChange(agents.filter(a => a.id !== id));
    if (currentAgentId === id) {
      const first = agents.find(a => a.id !== id);
      if (first) onCurrentChange(first.id);
    }
    if (editingId === id) setEditingId(null);
  };

  const editing = agents.find(a => a.id === editingId);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center anim-fade">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 anim-up max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Agent 管理</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">
              配置不同角色和能力的 Agent
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-stone-100">
            <iconify-icon icon="ph:x" style={{ fontSize: '20px', color: '#78716c' }}></iconify-icon>
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`rounded-xl p-3 border-2 cursor-pointer transition ${
                currentAgentId === agent.id
                  ? 'border-blue-300 bg-blue-50/50'
                  : 'border-stone-100 bg-stone-50 hover:border-stone-200'
              }`}
              onClick={() => { onCurrentChange(agent.id); }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: agent.color + '18' }}
                >
                  <iconify-icon icon={agent.icon} style={{ fontSize: '18px', color: agent.color }}></iconify-icon>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-stone-800">{agent.name}</span>
                    {agent.useTools && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-600">
                        工具
                      </span>
                    )}
                    {agent.delegateToAgents && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-600">
                        协作
                      </span>
                    )}
                    {currentAgentId === agent.id && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-50 text-green-600">
                        当前
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-stone-400 truncate">{agent.description || '未设置描述'}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(editingId === agent.id ? null : agent.id); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-stone-200/50 transition"
                  >
                    <iconify-icon icon="ph:pencil" style={{ fontSize: '14px', color: '#78716c' }}></iconify-icon>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(agent.id); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-stone-400 hover:text-red-500 transition"
                  >
                    <iconify-icon icon="ph:trash" style={{ fontSize: '14px' }}></iconify-icon>
                  </button>
                </div>
              </div>

              {/* 编辑面板 */}
              {editingId === agent.id && (
                <div className="mt-3 pt-3 border-t border-stone-200 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold text-stone-500 mb-1 block">名称</label>
                      <input
                        type="text"
                        value={agent.name}
                        onChange={(e) => handleUpdate(agent.id, { name: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-[10px] font-semibold text-stone-500 mb-1 block">图标</label>
                      <input
                        type="text"
                        value={agent.icon}
                        onChange={(e) => handleUpdate(agent.id, { icon: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                        placeholder="ph:bot"
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-[10px] font-semibold text-stone-500 mb-1 block">颜色</label>
                      <input
                        type="color"
                        value={agent.color}
                        onChange={(e) => handleUpdate(agent.id, { color: e.target.value })}
                        className="w-full h-[30px] rounded-lg border border-stone-200 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-stone-500 mb-1 block">描述</label>
                    <input
                      type="text"
                      value={agent.description}
                      onChange={(e) => handleUpdate(agent.id, { description: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                      placeholder="一句话描述这个 Agent 的角色"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-stone-500 mb-1 block">系统提示词</label>
                    <textarea
                      value={agent.systemPrompt}
                      onChange={(e) => handleUpdate(agent.id, { systemPrompt: e.target.value })}
                      rows={4}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300 resize-none"
                      placeholder="定义 Agent 的人格、能力边界和行为规范..."
                    />
                  </div>

                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agent.useTools}
                        onChange={(e) => handleUpdate(agent.id, { useTools: e.target.checked })}
                        className="w-4 h-4 rounded border-stone-300 text-blue-500 focus:ring-blue-300"
                      />
                      <span className="text-[11px] text-stone-600">启用工具（文件读写、命令执行、MCP）</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agent.delegateToAgents || false}
                        onChange={(e) => handleUpdate(agent.id, { delegateToAgents: e.target.checked })}
                        className="w-4 h-4 rounded border-stone-300 text-amber-500 focus:ring-amber-300"
                      />
                      <span className="text-[11px] text-stone-600">协作模式（可委托其他 Agent）</span>
                    </label>
                  </div>

                  {/* 协作模式下的目标 Agent 选择 */}
                  {agent.delegateToAgents && (
                    <div>
                      <label className="text-[10px] font-semibold text-stone-500 mb-1 block">可委托的 Agent（不选则全部可委托）</label>
                      <div className="flex flex-wrap gap-1.5">
                        {agents.filter(a => a.id !== agent.id).map(other => (
                          <button
                            key={other.id}
                            onClick={() => {
                              const current = agent.delegateTargets || [];
                              const next = current.includes(other.id)
                                ? current.filter(id => id !== other.id)
                                : [...current, other.id];
                              handleUpdate(agent.id, { delegateTargets: next.length > 0 ? next : undefined });
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 transition ${
                              (agent.delegateTargets || []).includes(other.id)
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : 'bg-stone-50 text-stone-400 border border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            <iconify-icon icon={other.icon} style={{ fontSize: '12px', color: other.color }}></iconify-icon>
                            {other.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold text-stone-500 mb-1 block">使用模型（留空用全局默认）</label>
                      <select
                        value={agent.modelId || ''}
                        onChange={(e) => handleUpdate(agent.id, { modelId: e.target.value || undefined })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                      >
                        <option value="">全局默认</option>
                        {models.filter(m => m.enabled).map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.model})</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="text-[10px] font-semibold text-stone-500 mb-1 block">温度</label>
                      <input
                        type="number"
                        value={agent.temperature ?? ''}
                        onChange={(e) => handleUpdate(agent.id, { temperature: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                        placeholder="0.7"
                        min={0}
                        max={2}
                        step={0.1}
                      />
                    </div>
                    <div className="w-24">
                      <label className="text-[10px] font-semibold text-stone-500 mb-1 block">Max Tokens</label>
                      <input
                        type="number"
                        value={agent.maxTokens ?? ''}
                        onChange={(e) => handleUpdate(agent.id, { maxTokens: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                        placeholder="16384"
                        min={1}
                      />
                    </div>
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
          添加 Agent
        </button>

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
