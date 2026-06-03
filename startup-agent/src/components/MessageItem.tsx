import { useState } from 'react';
import type { Message } from '../types';
import HtmlPreview, { isHtmlContent } from './HtmlPreview';
import AgentSteps from './AgentSteps';

interface Props {
  msg: Message;
  onToggleExpand?: (id: number) => void;
}

export default function MessageItem({ msg, onToggleExpand }: Props) {
  const [showPreview, setShowPreview] = useState(false);

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end anim-up">
        <div className="max-w-[80%] bg-stone-900 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed">
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
            <div
              onClick={() => onToggleExpand?.(msg.id)}
              className="bg-white rounded-2xl border border-stone-100 overflow-hidden active:bg-stone-50 transition cursor-pointer"
            >
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
                  <div className="bg-stone-50 rounded-xl p-3 text-[12px] text-stone-600 leading-relaxed whitespace-pre-wrap font-mono">
                    {msg.content}
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

  return (
    <div className="flex justify-start anim-up">
      <div className="max-w-[85%] bg-white rounded-2xl rounded-bl-md border border-stone-100 px-4 py-2.5 text-[14px] leading-relaxed text-stone-800 whitespace-pre-wrap">
        {msg.text}
      </div>
    </div>
  );
}
