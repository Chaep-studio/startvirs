import { useState } from 'react';
import type { Message } from '../types';
import HtmlPreview, { isHtmlContent } from './HtmlPreview';
import AgentSteps from './AgentSteps';
import AgentStatusBar, { extractAgentsFromSteps } from './AgentStatusBar';
import Markdown from './Markdown';

interface Props {
  msg: Message;
  onToggleExpand?: (id: number) => void;
  /** 把 agent 消息存为记忆的回调（App.tsx 提供，弹窗让用户选分类和标题） */
  onSaveAsMemory?: (msg: Message) => void;
}

export default function MessageItem({ msg, onToggleExpand, onSaveAsMemory }: Props) {
  const [showPreview, setShowPreview] = useState(false);
  const [starred, setStarred] = useState(false);

  // 触发收藏：先把乐观标记，再调回调
  const handleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSaveAsMemory) return;
    setStarred(true);
    onSaveAsMemory(msg);
    setTimeout(() => setStarred(false), 1500);
  };

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end anim-up">
        <div className="max-w-[80%] bg-stone-900 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.type === 'task') {
    const hasHtml = !!msg.content && isHtmlContent(msg.content);

    return (
      <>
        <div className="flex justify-start anim-up">
          <div className="max-w-[90%] w-full">
            {/* loading 时顶部显示"协作进行中"条 */}
            {msg.status === 'loading' && (
              <div className="flex items-center gap-1.5 mb-1 px-2">
                <span className="relative flex w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-violet-500"></span>
                </span>
                <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Agent 协作中</span>
              </div>
            )}
            <div
              onClick={() => onToggleExpand?.(msg.id)}
              className={`group/msg bg-white rounded-2xl border overflow-hidden active:bg-stone-50 transition cursor-pointer relative ${
                msg.status === 'loading'
                  ? 'border-violet-300 shadow-[0_0_0_3px_rgba(167,139,250,0.15)]'
                  : 'border-stone-100'
              }`}
            >
              {/* ⭐ 收藏按钮（仅 status===done 且有 content 时显示） */}
              {msg.status === 'done' && msg.content && onSaveAsMemory && (
                <button
                  onClick={handleStar}
                  className={`absolute right-2 top-2 w-7 h-7 rounded-lg flex items-center justify-center transition z-10 ${
                    starred ? 'bg-amber-100' : 'opacity-60 group-hover/msg:opacity-100 hover:bg-amber-50 hover:opacity-100'
                  }`}
                  title="存为记忆"
                >
                  <iconify-icon
                    icon={starred ? 'ph:star-fill' : 'ph:star'}
                    style={{ fontSize: '14px', color: starred ? '#f59e0b' : '#78716c' }}
                  ></iconify-icon>
                </button>
              )}
              <div className="flex items-center gap-3 p-3.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: (msg.color || '#999') + '12' }}
                >
                  <iconify-icon icon={msg.icon} style={{ color: msg.color, fontSize: '18px' }}></iconify-icon>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-stone-800">{msg.title}</div>
                  <div className="text-[11px] text-stone-400 mt-0.5">{msg.subtitle}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {msg.status === 'done' && (
                    <iconify-icon icon="ph:check-circle" style={{ fontSize: '18px', color: '#22c55e' }}></iconify-icon>
                  )}
                  {msg.status === 'loading' && (
                    <iconify-icon icon="ph:spinner" style={{ fontSize: '18px', color: '#d6d3d1' }} className="animate-spin"></iconify-icon>
                  )}
                  <iconify-icon
                    icon="ph:caret-down"
                    style={{ fontSize: '18px', color: '#d6d3d1' }}
                    className={`transition-transform ${msg.expanded ? 'rotate-180' : ''}`}
                  ></iconify-icon>
                </div>
              </div>

              {/* Agent 状态面板：有 steps 时始终显示（即使单个 Agent 也明确"当前谁在执行"） */}
              {msg.steps && msg.steps.length > 0 && (() => {
                const agents = extractAgentsFromSteps(msg.steps);
                return agents.length > 0 ? (
                  <AgentStatusBar agents={agents} />
                ) : null;
              })()}

              {/* Agent 执行步骤 */}
              {msg.steps && msg.steps.length > 0 && (
                <div className="px-3.5 pb-2 pt-0">
                  <AgentSteps steps={msg.steps} />
                </div>
              )}

              {msg.expanded && msg.content && (
                <div className="px-3.5 pb-3.5 pt-0 space-y-2">
                  {/* 如果是 HTML，显示预览按钮 */}
                  {hasHtml && (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPreview(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition"
                      >
                        <iconify-icon icon="ph:eye" style={{ fontSize: '12px' }}></iconify-icon>
                        预览
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const blob = new Blob([msg.content!], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${msg.title || 'output'}.html`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 text-stone-600 text-xs font-semibold hover:bg-stone-200 transition"
                      >
                        <iconify-icon icon="ph:download" style={{ fontSize: '12px' }}></iconify-icon>
                        下载
                      </button>
                    </div>
                  )}
                  <div className="bg-stone-50 rounded-xl p-3 text-stone-600">
                    <Markdown content={msg.content} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {showPreview && (
          <HtmlPreview
            html={msg.content!}
            title={msg.title}
            onClose={() => setShowPreview(false)}
          />
        )}
      </>
    );
  }

  // agent 普通文本消息：也支持 ⭐
  return (
    <div className="flex justify-start anim-up group/msg relative">
      <div className="max-w-[85%] bg-white rounded-2xl rounded-bl-md border border-stone-100 px-4 py-2.5 text-stone-800">
        <Markdown content={msg.text || ''} />
      </div>
      {onSaveAsMemory && msg.text && (
        <button
          onClick={handleStar}
          className={`absolute -right-1 top-1 w-7 h-7 rounded-lg flex items-center justify-center transition z-10 ${
            starred ? 'bg-amber-100' : 'opacity-60 group-hover/msg:opacity-100 hover:opacity-100 bg-white/80 hover:bg-amber-50 border border-stone-100'
          }`}
          title="存为记忆"
        >
          <iconify-icon
            icon={starred ? 'ph:star-fill' : 'ph:star'}
            style={{ fontSize: '14px', color: starred ? '#f59e0b' : '#78716c' }}
          ></iconify-icon>
        </button>
      )}
    </div>
  );
}
