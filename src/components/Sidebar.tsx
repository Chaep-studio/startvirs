import type { Session, SidebarAction, MemoryEntry } from '../types';

interface Props {
  open: boolean;
  activeView: string;
  sessions: Session[];
  currentSessionId: string;
  actions: SidebarAction[];
  /** 所有记忆（用于 2×2 分类卡显示计数） */
  memories: MemoryEntry[];
  onClose: () => void;
  onAction: (id: string) => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  /** 打开记忆管理弹窗（可指定初始 tab） */
  onOpenMemory: () => void;
}

const MEMORY_CARDS: {
  category: 'soul' | 'user' | 'agent' | 'memory';
  label: string;
  icon: string;
  color: string;
  hint: string;
}[] = [
  { category: 'soul',   label: '灵魂',   icon: 'ph:sparkle',       color: '#f59e0b', hint: '全局' },
  { category: 'user',   label: '用户',   icon: 'ph:user-circle',   color: '#3b82f6', hint: '关于你' },
  { category: 'agent',  label: 'Agent',  icon: 'ph:robot',         color: '#8b5cf6', hint: '按 Agent' },
  { category: 'memory', label: '项目',   icon: 'ph:folder-simple', color: '#10b981', hint: '按项目' },
];

export default function Sidebar({
  open,
  activeView,
  sessions,
  currentSessionId,
  actions,
  memories,
  onClose,
  onAction,
  onSwitchSession,
  onDeleteSession,
  onOpenMemory,
}: Props) {
  const counts = {
    soul: memories.filter(m => m.category === 'soul').length,
    user: memories.filter(m => m.category === 'user').length,
    agent: memories.filter(m => m.category === 'agent').length,
    memory: memories.filter(m => m.category === 'memory').length,
  };
  const total = memories.length;

  const content = (
    <div className="h-full bg-white border-r border-stone-100 flex flex-col w-56">
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-bold text-stone-800">YC 创业助手</div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center active:bg-stone-100">
            <iconify-icon icon="ph:x" style={{ fontSize: '16px', color: '#78716c' }}></iconify-icon>
          </button>
        </div>
      </div>
      <div className="flex-shrink-0 px-3 py-2 space-y-1">
        {actions.map((item) => (
          <button
            key={item.id}
            onClick={() => onAction(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${
              activeView === item.id && item.id !== 'new'
                ? 'bg-stone-900 text-white'
                : 'text-stone-700 hover:bg-stone-50'
            }`}
          >
            <iconify-icon
              icon={item.icon}
              style={{
                fontSize: '18px',
                color: activeView === item.id && item.id !== 'new' ? '#fff' : '#a8a29e',
              }}
            ></iconify-icon>
            <span className="text-[13px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="mx-4 my-2 h-px bg-stone-100"></div>
      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
        <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2 px-3">
          对话记录
        </div>
        <div className="space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`w-full rounded-xl px-3 py-2.5 transition group relative ${
                currentSessionId === s.id ? 'bg-stone-100' : 'hover:bg-stone-50'
              }`}
            >
              <button onClick={() => onSwitchSession(s.id)} className="w-full text-left">
                <div className="flex items-center gap-2">
                  <iconify-icon
                    icon="ph:chat-circle-text"
                    style={{
                      fontSize: '14px',
                      color: currentSessionId === s.id ? '#44403c' : '#a8a29e',
                    }}
                  ></iconify-icon>
                  <span
                    className={`text-[12px] font-medium truncate flex-1 pr-6 ${
                      currentSessionId === s.id ? 'text-stone-900' : 'text-stone-600'
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
                <div className="flex items-center mt-1">
                  <span className="text-[10px] text-stone-400">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
              <button
                onClick={(e) => onDeleteSession(s.id, e)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-stone-200/70 transition z-10"
              >
                <iconify-icon icon="ph:trash" style={{ fontSize: '12px', color: '#a8a29e' }}></iconify-icon>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 记忆区：2×2 分类卡 + 总数 + 打开按钮 ===== */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-stone-100">
        <button
          onClick={onOpenMemory}
          className="w-full flex items-center justify-between px-2 py-1.5 mb-1.5 rounded-lg hover:bg-stone-50 transition group"
          title="打开记忆管理"
        >
          <div className="flex items-center gap-1.5">
            <iconify-icon icon="ph:books" style={{ fontSize: '13px', color: '#44403c' }}></iconify-icon>
            <span className="text-[11px] font-bold text-stone-700 uppercase tracking-wider">记忆</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-stone-400 group-hover:text-stone-600">{total} 条</span>
            <iconify-icon icon="ph:arrow-up-right" style={{ fontSize: '11px', color: '#a8a29e' }}></iconify-icon>
          </div>
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          {MEMORY_CARDS.map((c) => {
            const count = counts[c.category];
            return (
              <button
                key={c.category}
                onClick={onOpenMemory}
                className="flex flex-col items-start gap-0.5 px-2 py-1.5 bg-stone-50 hover:bg-stone-100 rounded-lg transition text-left"
                title={`${c.label}（${c.hint}）`}
              >
                <div className="flex items-center gap-1 w-full">
                  <iconify-icon icon={c.icon} style={{ fontSize: '11px', color: c.color }}></iconify-icon>
                  <span className="text-[10px] font-semibold text-stone-600 flex-1 truncate">{c.label}</span>
                </div>
                <div className="flex items-baseline gap-1 w-full">
                  <span className="text-[14px] font-bold font-mono" style={{ color: count > 0 ? c.color : '#d6d3d1' }}>
                    {count}
                  </span>
                  <span className="text-[9px] text-stone-400">条</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-t border-stone-100">
        <a
          href="../index.html"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-stone-600 hover:bg-stone-50 transition"
        >
          <iconify-icon icon="ph:house" style={{ fontSize: '18px', color: '#a8a29e' }}></iconify-icon>
          <span className="text-[13px] font-medium">返回首页</span>
        </a>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden sm:flex h-full">{content}</div>
      {open && (
        <div className="sm:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 anim-fade" onClick={onClose}></div>
          <div className="absolute left-0 top-0 h-full anim-slide-left shadow-2xl">{content}</div>
        </div>
      )}
    </>
  );
}
