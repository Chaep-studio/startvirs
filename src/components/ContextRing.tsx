import { useState, useRef, useEffect } from 'react';
import { formatTokenCount } from '../agent/tokenizer';

interface Props {
  /** 当前已用 token 数 */
  used: number;
  /** 上限 token 数 */
  limit: number;
  /** 圆环直径（px） */
  size?: number;
  /** 描边宽度 */
  strokeWidth?: number;
  /** 点击回调（用于跳到设置） */
  onClick?: () => void;
}

/**
 * 上下文使用率圆环 — Claude Code 风格
 *
 * 视觉：顶部居中的小圆环 + 圆心百分比 + hover tooltip 详情
 */
export default function ContextRing({
  used,
  limit,
  size = 22,
  strokeWidth = 2.5,
  onClick,
}: Props) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color =
    percent < 50 ? '#10b981' :
    percent < 75 ? '#f59e0b' :
    percent < 90 ? '#f97316' :
    '#ef4444';

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / 100);

  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭 tooltip
  useEffect(() => {
    if (!showTooltip) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showTooltip]);

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        onClick={() => {
          if (onClick) onClick();
          else setShowTooltip(v => !v);
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="relative flex items-center justify-center rounded-full hover:bg-stone-100 transition p-0.5"
        style={{ width: size + 4, height: size + 4 }}
        title={`上下文：${formatTokenCount(used)} / ${formatTokenCount(limit)} (${percent}%)`}
      >
        <svg width={size} height={size} className="-rotate-90">
          {/* 背景圈 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e7e5e4"
            strokeWidth={strokeWidth}
          />
          {/* 进度圈 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
          />
        </svg>
        {/* 圆心文字（小到一定程度时只显示数字） */}
        <span
          className="absolute font-bold text-stone-700 tabular-nums"
          style={{ fontSize: size <= 22 ? '8px' : '9px' }}
        >
          {percent}
        </span>
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          ref={tooltipRef}
          className="absolute right-0 top-full mt-2 z-50 bg-stone-900 text-white rounded-lg shadow-xl px-3 py-2.5 min-w-[200px] anim-fade"
          style={{ fontSize: '11px' }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="font-semibold">上下文使用</span>
            <span className="text-stone-400 font-mono text-[10px]">{percent}%</span>
          </div>
          <div className="space-y-1 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-stone-400">已用</span>
              <span className="font-mono font-semibold tabular-nums" style={{ color }}>{formatTokenCount(used)} tokens</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-400">窗口</span>
              <span className="font-mono font-semibold tabular-nums">{formatTokenCount(limit)} tokens</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-400">剩余</span>
              <span className="font-mono font-semibold tabular-nums">{formatTokenCount(Math.max(0, limit - used))} tokens</span>
            </div>
          </div>
          {/* 进度条 */}
          <div className="mt-2 h-1 bg-stone-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${percent}%`, backgroundColor: color }}
            />
          </div>
          {percent >= 90 && (
            <div className="mt-2 text-[10px] text-red-300 flex items-center gap-1">
              <iconify-icon icon="ph:warning" style={{ fontSize: '11px' }}></iconify-icon>
              上下文快满了，建议开新对话
            </div>
          )}
          {onClick && (
            <div className="mt-2 pt-2 border-t border-stone-700 text-[10px] text-stone-400">
              点击调整窗口大小
            </div>
          )}
        </div>
      )}
    </div>
  );
}
