import type { Skill } from '../types';

interface Props {
  skills: Skill[];
  onUse: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onReset: () => void;
  onImport: () => void;
}

export default function SkillsView({ skills, onUse, onEdit, onDelete, onAdd, onReset, onImport }: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-stone-800">已加载 {skills.length} 个技能</div>
        <div className="flex gap-2">
          <button
            onClick={onImport}
            className="px-3 py-1.5 rounded-lg bg-stone-50 text-stone-500 text-xs font-semibold hover:bg-stone-100 transition flex items-center gap-1"
          >
            <iconify-icon icon="ph:package" style={{ fontSize: '12px' }}></iconify-icon>
            导入
          </button>
          <button
            onClick={onReset}
            className="px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 text-xs font-semibold hover:bg-stone-200 transition"
          >
            恢复默认
          </button>
          <button
            onClick={onAdd}
            className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition"
          >
            + 添加技能
          </button>
        </div>
      </div>
      {skills.map((s, i) => (
        <div
          key={s.id}
          className="bg-white rounded-2xl p-4 border border-stone-100 anim-up"
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: s.color + '12' }}
            >
              <iconify-icon icon={s.icon} style={{ fontSize: '20px', color: s.color }}></iconify-icon>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-[13px] font-bold text-stone-800">{s.name}</div>
                <div className="text-[11px] font-mono text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded">
                  {s.command}
                </div>
              </div>
              <p className="text-[12px] text-stone-500 leading-relaxed mt-1">{s.description}</p>
              <div className="bg-stone-50 rounded-lg px-3 py-2 text-[11px] text-stone-500 font-mono mt-2">
                {s.command} {s.paramsHint}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onUse(s)}
              className="flex-1 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold active:bg-stone-800 transition"
            >
              使用
            </button>
            <button
              onClick={() => onEdit(s)}
              className="px-3 py-2 rounded-xl bg-stone-100 text-stone-600 text-xs font-semibold hover:bg-stone-200 transition"
            >
              编辑
            </button>
            <button
              onClick={() => onDelete(s.id)}
              className="px-3 py-2 rounded-xl bg-stone-100 text-stone-400 text-xs font-semibold hover:bg-rose-50 hover:text-rose-500 transition"
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
