import { useRef, useEffect, useState } from 'react';
import type { Message, ModelConfig, AgentConfig, FileMode } from '../types';
import MessageItem from './MessageItem';
import ContextRing from './ContextRing';

interface Props {
  messages: Message[];
  input: string;
  loading: boolean;
  defaultModel?: ModelConfig;
  /** 当前所有启用的模型列表（用于输入框上方的下拉） */
  models?: ModelConfig[];
  /** 当前默认模型 id */
  defaultModelId?: string;
  /** 切换默认模型 */
  onChangeModel?: (id: string) => void;
  /** 修改默认模型的 reasoning_effort */
  onChangeReasoningEffort?: (effort: ModelConfig['reasoningEffort']) => void;
  /** 当前已用 token（用于 ContextRing） */
  contextUsed?: number;
  /** 上下文窗口上限 */
  contextLimit?: number;
  /** 点击 ContextRing 跳到设置 */
  onOpenContextSettings?: () => void;
  currentAgent?: AgentConfig;
  fileMode: FileMode;
  localDirName: string | null;
  testWorkspace?: string | null;
  /** ⚠️ 本地 bash 是否启用（仅当 fileMode='local' 时相关） */
  localBashEnabled?: boolean;
  /** ⚠️ 跳到设置去关掉本地 bash */
  onOpenSettings?: () => void;
  onInputChange: (val: string) => void;
  onSend: () => void;
  onToggleExpand: (id: number) => void;
  onPickLocalDir: () => Promise<boolean>;
  /** 把 agent 消息存为记忆（⭐ 收藏） */
  onSaveAsMemory?: (msg: Message) => void;
}

export default function ChatView({
  messages,
  input,
  loading,
  defaultModel,
  models,
  defaultModelId,
  onChangeModel,
  onChangeReasoningEffort,
  contextUsed,
  contextLimit,
  onOpenContextSettings,
  currentAgent,
  fileMode,
  localDirName,
  testWorkspace,
  localBashEnabled,
  onOpenSettings,
  onInputChange,
  onSend,
  onToggleExpand,
  onPickLocalDir,
  onSaveAsMemory,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 推理强度 / 模型下拉的轻量浮层
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const effortMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!modelMenuOpen && !effortMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (modelMenuOpen && modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
      if (effortMenuOpen && effortMenuRef.current && !effortMenuRef.current.contains(e.target as Node)) {
        setEffortMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [modelMenuOpen, effortMenuOpen]);

  const enabledModels = (models || []).filter(m => m.enabled);
  const currentEffort = (defaultModel?.reasoningEffort || 'auto') as ModelConfig['reasoningEffort'];
  const supportsReasoning = !!defaultModel && /^(o\d|gpt-5|claude|deepseek-r1|gemini.*thinking)/i.test(defaultModel.model);
  const effortOptions: { value: NonNullable<ModelConfig['reasoningEffort']>; label: string }[] = supportsReasoning
    ? [
        { value: 'auto', label: '自动' },
        { value: 'low', label: '低' },
        { value: 'medium', label: '中' },
        { value: 'high', label: '高' },
      ]
    : [
        { value: 'auto', label: '自动' },
        { value: 'low', label: '低' },
        { value: 'medium', label: '中' },
        { value: 'high', label: '高' },
      ];
  const effortLabel = effortOptions.find(o => o.value === currentEffort)?.label || '自动';

  // 滚动到底：在消息变化、loading 变化、键盘弹起时触发
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior,
        });
      }
    });
  };

  useEffect(() => {
    scrollToBottom(messages.length <= 1 ? 'auto' : 'smooth');
  }, [messages]);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [loading]);

  // iOS 软键盘适配：使用 visualViewport 监听键盘高度，输入框 padding-bottom 调整
  useEffect(() => {
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (!vv) return;

    const handleViewportChange = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      // 软键盘高度 = 窗口高度 - 可视视口高度
      const keyboardHeight = Math.max(0, window.innerHeight - vv.height);
      wrap.style.setProperty('--keyboard-height', `${keyboardHeight}px`);

      // 键盘弹起时滚到底
      if (keyboardHeight > 100) {
        scrollToBottom('auto');
      }
    };

    vv.addEventListener('resize', handleViewportChange);
    vv.addEventListener('scroll', handleViewportChange);
    handleViewportChange();

    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      vv.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  // 输入框获得焦点时也滚到底（关键修复）
  const handleInputFocus = () => {
    setTimeout(() => scrollToBottom('auto'), 300);
  };

  return (
    <div ref={wrapRef} className="flex-1 flex flex-col min-h-0 chat-input-wrap">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* 文件 I/O 模式提示条 */}
        {fileMode === 'local' && (
          <div className={`rounded-xl border px-3 py-2 flex items-start gap-2 text-[11px] ${
            localBashEnabled
              ? 'bg-red-50 border-red-300 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            <iconify-icon
              icon={localBashEnabled ? 'ph:warning-octagon' : 'ph:folder-open'}
              style={{ fontSize: '14px', flexShrink: 0, marginTop: 1, color: localBashEnabled ? '#dc2626' : undefined }}
            ></iconify-icon>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">
                {localBashEnabled
                  ? '⚠️ 本地文件模式 + 本地 bash 已启用（无沙箱）'
                  : '本地文件模式 · 读写你电脑上的目录'}
              </div>
              <div className="text-[10px] opacity-90 mt-0.5 truncate">
                当前目录：<code className={`px-1 rounded ${localBashEnabled ? 'bg-red-100' : 'bg-emerald-100'}`}>{localDirName || '未选择'}</code>
                {localBashEnabled
                  ? ' · AI 可在 server 本机执行任意 shell 命令（高危）'
                  : '（bash 工具不可用，其余文件操作直接走浏览器）'}
              </div>
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              {localBashEnabled && onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="text-[10px] font-bold underline text-red-700"
                >
                  关闭 bash
                </button>
              )}
              <button
                onClick={async () => {
                  const ok = await onPickLocalDir();
                  if (!ok) alert('切换失败，请重试或检查浏览器权限');
                }}
                className="text-[10px] font-semibold underline"
              >
                更换目录
              </button>
            </div>
          </div>
        )}
        {fileMode === 'cloud' && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 flex items-center gap-2 text-[10px] text-stone-500">
            <iconify-icon icon="ph:cloud-check" style={{ fontSize: '12px' }}></iconify-icon>
            <span>云端沙箱（Daytona）— 文件操作通过工具服务器执行</span>
          </div>
        )}
        {fileMode === 'test' && (
          <div className="rounded-xl border px-3 py-2 flex items-start gap-2 text-[11px] bg-amber-50 border-amber-200 text-amber-700">
            <iconify-icon
              icon="ph:flask"
              style={{ fontSize: '14px', flexShrink: 0, marginTop: 1 }}
            ></iconify-icon>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">
                测试模式 · 读取 server 本机文件（不走 Daytona）
              </div>
              <div className="text-[10px] opacity-80 mt-0.5 truncate">
                工作空间：<code className="bg-amber-100 px-1 rounded">{testWorkspace || '未拉取'}</code>
                （bash 命令会在 server 上真实执行，调试用）
              </div>
            </div>
          </div>
        )}
        {fileMode === 'none' && (
          <div className="rounded-xl border px-3 py-2 flex items-start gap-2 text-[11px] bg-stone-50 border-stone-200 text-stone-600">
            <iconify-icon
              icon="ph:chat-circle-dots"
              style={{ fontSize: '14px', flexShrink: 0, marginTop: 1, color: '#78716c' }}
            ></iconify-icon>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">
                纯对话模式 · 文件工具未启用
              </div>
              <div className="text-[10px] opacity-80 mt-0.5">
                适用于 Netlify 静态部署 / 移动端 / 后端不可用 · 仅 LLM 文本对话
              </div>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageItem key={msg.id} msg={msg} onToggleExpand={onToggleExpand} onSaveAsMemory={onSaveAsMemory} />
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
      <div
        className="flex-shrink-0 px-3 py-2.5 sm:px-4 sm:py-3 bg-white/90 backdrop-blur-xl border-t border-stone-100"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px) + var(--keyboard-height, 0px))' }}
      >
        {/* 单个圆角框：textarea + 底部控件 + 发送按钮（GLM 风格） */}
        <div className="bg-stone-50 rounded-2xl border border-stone-200 focus-within:border-stone-300 transition px-3 pt-2 pb-1.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onFocus={handleInputFocus}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="发送消息，/ 命令..."
            rows={1}
            className="w-full bg-transparent text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none resize-none max-h-[160px] py-1 block"
            style={{ minHeight: '24px' }}
          />
          {/* 底部一行：左侧权限/工具/本地 标识，中间 spacer，右侧模型/推理/环/发送 */}
          <div className="flex items-center gap-1 -mx-1">
            {/* 左：权限 + Agent 状态标识 */}
            <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden px-1">
              {/* 权限/模式 chip（点击可跳设置） */}
              <button
                onClick={onOpenSettings}
                className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-semibold transition flex-shrink-0 ${
                  fileMode === 'local' && localBashEnabled
                    ? 'text-red-600 hover:bg-red-100'
                    : 'text-stone-600 hover:bg-stone-200/60'
                }`}
                title={
                  fileMode === 'local'
                    ? localBashEnabled ? '本地目录 + bash（高危）· 点击设置' : '本地目录 · 点击设置'
                    : fileMode === 'test' ? '测试模式 · 点击设置'
                    : fileMode === 'none' ? '纯对话模式 · 点击设置'
                    : '云端沙箱 · 点击设置'
                }
              >
                <iconify-icon
                  icon={
                    fileMode === 'local' && localBashEnabled
                      ? 'ph:shield-warning'
                      : fileMode === 'local' ? 'ph:folder-open'
                      : fileMode === 'test' ? 'ph:flask'
                      : fileMode === 'none' ? 'ph:chat-circle-dots'
                      : 'ph:cloud-check'
                  }
                  style={{ fontSize: '13px' }}
                ></iconify-icon>
                <span>
                  {fileMode === 'local' && localBashEnabled ? '完全访问' :
                   fileMode === 'local' ? '本地文件' :
                   fileMode === 'test' ? '测试模式' :
                   fileMode === 'none' ? '纯对话' : '云端沙箱'}
                </span>
                <iconify-icon icon="ph:caret-down" style={{ fontSize: '9px', opacity: 0.6 }}></iconify-icon>
              </button>
              {/* Agent 标识（小、不抢眼） */}
              {currentAgent && (
                <span className="flex items-center gap-1 min-w-0 flex-shrink">
                  <iconify-icon icon={currentAgent.icon || 'ph:bot'} style={{ fontSize: '11px', color: currentAgent.color || '#78716c' }}></iconify-icon>
                  <span className="text-[10px] text-stone-500 font-medium truncate">{currentAgent.name}</span>
                </span>
              )}
              {currentAgent?.useTools && (
                <span className="text-[10px] text-blue-500 font-medium flex-shrink-0">·工具</span>
              )}
              {currentAgent?.delegateToAgents && (
                <span className="text-[10px] text-amber-500 font-medium flex-shrink-0">·协作</span>
              )}
            </div>
            {/* 右：模型 + 推理 + 环 + 发送 */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {/* 模型 — 永远可下拉（0/1/N 都允许点开） */}
              <div ref={modelMenuRef} className="relative">
                <button
                  onClick={() => { setModelMenuOpen(v => !v); setEffortMenuOpen(false); }}
                  className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-semibold text-stone-700 hover:bg-stone-200/60 transition max-w-[140px]"
                  title={`当前模型：${defaultModel?.name || '未选'} · 点击切换`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: defaultModel?.color || '#78716c' }}></span>
                  <span className="truncate">{defaultModel?.name || (models && models.length > 0 ? '选模型' : '未配置')}</span>
                  <iconify-icon icon="ph:caret-down" style={{ fontSize: '10px', opacity: 0.6 }}></iconify-icon>
                </button>
                {modelMenuOpen && (
                  <div className="absolute right-0 bottom-full mb-1 z-40 bg-white border border-stone-200 rounded-lg shadow-xl py-1 min-w-[200px] max-h-[260px] overflow-y-auto">
                    {enabledModels.length === 0 ? (
                      <div className="px-3 py-3 text-[11px] text-stone-400 text-center">
                        还没有启用任何模型
                        {onOpenContextSettings && (
                          <button
                            onClick={() => { onOpenContextSettings(); setModelMenuOpen(false); }}
                            className="block mx-auto mt-1.5 text-blue-600 font-semibold underline"
                          >
                            去添加
                          </button>
                        )}
                      </div>
                    ) : (
                      enabledModels.map(m => (
                        <button
                          key={m.id}
                          onClick={() => { onChangeModel?.(m.id); setModelMenuOpen(false); }}
                          className={`w-full px-2.5 py-1.5 text-left text-[11px] flex items-center gap-1.5 hover:bg-stone-50 ${m.id === defaultModelId ? 'text-blue-600 font-semibold' : 'text-stone-700'}`}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m.color }}></span>
                          <span className="flex-1 truncate">{m.name}</span>
                          {m.id === defaultModelId && <iconify-icon icon="ph:check" style={{ fontSize: '12px', color: '#2563eb' }}></iconify-icon>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {/* 推理强度 */}
              <div ref={effortMenuRef} className="relative">
                <button
                  onClick={() => { setEffortMenuOpen(v => !v); setModelMenuOpen(false); }}
                  className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-semibold text-stone-700 hover:bg-stone-200/60 transition"
                  title="推理强度（reasoning_effort）"
                >
                  <iconify-icon icon="ph:brain" style={{ fontSize: '13px' }}></iconify-icon>
                  <span>{effortLabel}</span>
                  <iconify-icon icon="ph:caret-down" style={{ fontSize: '10px', opacity: 0.6 }}></iconify-icon>
                </button>
                {effortMenuOpen && (
                  <div className="absolute right-0 bottom-full mb-1 z-40 bg-white border border-stone-200 rounded-lg shadow-xl py-1 min-w-[80px]">
                    {effortOptions.map(o => (
                      <button
                        key={o.value}
                        onClick={() => { onChangeReasoningEffort?.(o.value); setEffortMenuOpen(false); }}
                        className={`w-full px-2.5 py-1.5 text-left text-[11px] flex items-center gap-1.5 hover:bg-stone-50 ${o.value === currentEffort ? 'text-blue-600 font-semibold' : 'text-stone-700'}`}
                      >
                        {o.value === currentEffort && <iconify-icon icon="ph:check" style={{ fontSize: '12px', color: '#2563eb' }}></iconify-icon>}
                        <span className={o.value === currentEffort ? '' : 'pl-[18px]'}>{o.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* 上下文环 */}
              {typeof contextUsed === 'number' && typeof contextLimit === 'number' && contextLimit > 0 && (
                <ContextRing
                  used={contextUsed}
                  limit={contextLimit}
                  onClick={onOpenContextSettings}
                />
              )}
              {/* 发送按钮 */}
              <button
                onClick={onSend}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center active:bg-stone-800 transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ml-0.5"
              >
                <iconify-icon icon="ph:arrow-up-bold" style={{ fontSize: '15px', color: 'white' }}></iconify-icon>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
