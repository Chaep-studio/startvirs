import type { Session, SidebarAction } from '../types';

interface Props {
  open: boolean;
  activeView: string;
  sessions: Session[];
  currentSessionId: string;
  actions: SidebarAction[];
  onClose: () => void;
  onAction: (id: string) => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
}

export default function Sidebar({
  open,
  activeView,
  sessions,
  currentSessionId,
  actions,
  onClose,
  onAction,
  onSwitchSession,
  onDeleteSession,
}: Props) {
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
        <>
          <div className="fixed inset-0 bg-black/20 z-40 sm:hidden" onClick={onClose}></div>
          <div className="fixed left-0 top-0 h-full z-50 sm:hidden anim-slide-left">{content}</div>
        </>
      )}
    </>
  );
}
