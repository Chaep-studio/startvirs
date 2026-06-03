import { useRef, useEffect } from 'react';
import type { Message, ModelConfig, AgentConfig } from '../types';
import MessageItem from './MessageItem';

interface Props {
  messages: Message[];
  input: string;
  loading: boolean;
  defaultModel?: ModelConfig;
  currentAgent?: AgentConfig;
  onInputChange: (val: string) => void;
  onSend: () => void;
  onToggleExpand: (id: number) => void;
}

export default function ChatView({
  messages,
  input,
  loading,
  defaultModel,
  currentAgent,
  onInputChange,
  onSend,
  onToggleExpand,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <MessageItem key={msg.id} msg={msg} onToggleExpand={onToggleExpand} />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-stone-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-300" style={{ animation: 'pulse 1.4s infinite' }}></span>
              <span className="w-1.5 h-1.5 rounded-full bg-stone-300" style={{ animation: 'pulse 1.4s infinite 0.2s' }}></span>
              <span className="w-1.5 h-1.5 rounded-full bg-stone-300" style={{ animation: 'pulse 1.4s infinite 0.4s' }}></span>
            </div>
          </div>
        )}
      </div>
      <div className="flex-shrink-0 px-4 py-3 bg-white/90 backdrop-blur-xl border-t border-stone-100">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-stone-50 rounded-2xl border border-stone-200 px-3.5 py-2 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="发送消息，/ 命令..."
              rows={1}
              className="flex-1 bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none resize-none max-h-[120px] py-1"
              style={{ minHeight: '24px' }}
            />
          </div>
          <button
            onClick={onSend}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center active:bg-stone-800 transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 mb-0.5"
          >
            <iconify-icon icon="ph:paper-plane-right-fill" style={{ fontSize: '18px', color: 'white' }}></iconify-icon>
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <div className="flex items-center gap-1.5">
            <iconify-icon icon={currentAgent?.icon || 'ph:bot'} style={{ fontSize: '11px', color: currentAgent?.color || '#78716c' }}></iconify-icon>
            <span className="text-[10px] text-stone-400 font-medium">{currentAgent?.name || 'Agent'}</span>
            <span className="text-[10px] text-stone-300">·</span>
            <span className="text-[10px] text-stone-400 font-medium">{defaultModel ? `${defaultModel.name}` : '未配置模型'}</span>
            {currentAgent?.useTools && (
              <>
                <span className="text-[10px] text-stone-300">·</span>
                <span className="text-[10px] text-blue-400 font-medium">工具模式</span>
              </>
            )}
            {currentAgent?.delegateToAgents && (
              <>
                <span className="text-[10px] text-stone-300">·</span>
                <span className="text-[10px] text-amber-500 font-medium">协作模式</span>
              </>
            )}
          </div>
          <span className="text-[10px] text-stone-400">回车发送，Shift+回车换行</span>
        </div>
      </div>
    </>
  );
}
