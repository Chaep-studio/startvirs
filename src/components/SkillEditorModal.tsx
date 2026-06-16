import { useState } from 'react';
import type { Skill } from '../types';

interface Props {
  skill: Skill | null;
  onSave: (skill: Skill | Omit<Skill, 'id'>) => void;
  onClose: () => void;
}

const COLORS = [
  '#f97316', '#8b5cf6', '#10b981', '#ef4444', '#3b82f6',
  '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#84cc16',
];

const ICONS = [
  'ph:lightning', 'ph:coffee', 'ph:crown', 'ph:rocket', 'ph:microphone',
  'ph:scroll', 'ph:target', 'ph:brain', 'ph:chart-line', 'ph:users',
];

export default function SkillEditorModal({ skill, onSave, onClose }: Props) {
  const isEdit = !!skill;
  const [form, setForm] = useState<Skill>({
    id: skill?.id || '',
    name: skill?.name || '',
    icon: skill?.icon || 'ph:lightning',
    color: skill?.color || '#f97316',
    description: skill?.description || '',
    command: skill?.command || '/',
    paramsHint: skill?.paramsHint || '',
    systemPrompt: skill?.systemPrompt || '',
    promptTemplate: skill?.promptTemplate || '',
  });

  const valid =
    form.name.trim() &&
    form.command.trim() &&
    form.systemPrompt.trim() &&
    form.promptTemplate.trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center anim-fade">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 anim-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-stone-900">{isEdit ? '编辑技能' : '添加技能'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-stone-100">
            <iconify-icon icon="ph:x" style={{ fontSize: '20px', color: '#78716c' }}></iconify-icon>
          </button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">名称</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="技能名称"
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-800 placeholder:text-stone-300 focus:outline-none focus:border-rose-300 transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 mb-1.5 block">命令</label>
              <input
                type="text"
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
                placeholder="/my-skill"
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-800 placeholder:text-stone-300 focus:outline-none focus:border-rose-300 transition"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">参数提示</label>
            <input
              type="text"
              value={form.paramsHint}
              onChange={(e) => setForm({ ...form, paramsHint: e.target.value })}
              placeholder="[参数1] [参数2]"
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-800 placeholder:text-stone-300 focus:outline-none focus:border-rose-300 transition"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">描述</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="技能功能描述"
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-800 placeholder:text-stone-300 focus:outline-none focus:border-rose-300 transition"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">图标</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setForm({ ...form, icon: ic })}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border transition ${
                    form.icon === ic ? 'bg-stone-900 border-stone-900' : 'bg-stone-50 border-stone-200'
                  }`}
                >
                  <iconify-icon
                    icon={ic}
                    style={{
                      fontSize: '18px',
                      color: form.icon === ic ? '#fff' : '#78716c',
                    }}
                  ></iconify-icon>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">颜色</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full border-2 transition ${
                    form.color === c ? 'border-stone-900 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                ></button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">System Prompt</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="定义 AI 的角色和行为..."
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-800 placeholder:text-stone-300 focus:outline-none focus:border-rose-300 transition"
            ></textarea>
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 mb-1.5 block">
              Prompt 模板（用 {'{{input}}'} 代表用户输入）
            </label>
            <textarea
              value={form.promptTemplate}
              onChange={(e) => setForm({ ...form, promptTemplate: e.target.value })}
              placeholder="{{input}} 会被替换为用户命令后的内容"
              rows={4}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-800 placeholder:text-stone-300 focus:outline-none focus:border-rose-300 transition"
            ></textarea>
          </div>
        </div>
        <button
          onClick={() => valid && onSave(form)}
          disabled={!valid}
          className="w-full mt-5 py-3 rounded-xl bg-stone-900 text-white text-sm font-semibold active:bg-stone-800 transition disabled:opacity-40"
        >
          {isEdit ? '保存修改' : '添加技能'}
        </button>
      </div>
    </div>
  );
}
