import { useState } from 'react';
import type { AgentStep } from '../types';

interface Props {
  steps: AgentStep[];
}

const STEP_ICONS: Record<string, string> = {
  thinking: 'ph:brain',
  read_file: 'ph:file-text',
  edit_file: 'ph:pencil-line',
  write_file: 'ph:file-plus',
  search: 'ph:magnifying-glass',
  tool_call: 'ph:terminal',
  info: 'ph:info',
};

const STEP_COLORS: Record<string, string> = {
  thinking: '#8b5cf6',
  read_file: '#3b82f6',
  edit_file: '#f59e0b',
  write_file: '#10b981',
  search: '#6366f1',
  tool_call: '#6b7280',
  info: '#6b7280',
};

const STEP_LABELS: Record<string, string> = {
  thinking: '深度思考',
  read_file: '已读取文件',
  edit_file: '已编辑文件',
  write_file: '已创建文件',
  search: '搜索',
  tool_call: '工具调用',
  info: '信息',
};

export default function AgentSteps({ steps }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      {steps.map((step, i) => (
        <StepItem
          key={step.id}
          step={step}
          index={i}
          expanded={expandedIds.has(step.id)}
          onToggle={() => toggleExpand(step.id)}
        />
      ))}
    </div>
  );
}

function StepItem({
  step,
  index,
  expanded,
  onToggle,
}: {
  step: AgentStep;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const icon = STEP_ICONS[step.type] || 'ph:circle';
  const color = STEP_COLORS[step.type] || '#6b7280';
  const label = STEP_LABELS[step.type] || step.type;
  const hasContent = !!step.content;
  const isRunning = step.status === 'running';

  return (
    <div
      className="anim-up"
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      <div
        onClick={hasContent ? onToggle : undefined}
        className={`flex items-start gap-2.5 px-3 py-2 rounded-xl transition ${
          hasContent ? 'cursor-pointer hover:bg-stone-50' : ''
        } group`}
      >
        {/* 图标 */}
        <div className="flex-shrink-0 mt-0.5">
          {isRunning ? (
            <iconify-icon icon="ph:spinner" className="animate-spin" style={{ fontSize: '16px', color }}></iconify-icon>
          ) : (
            <iconify-icon icon={icon} style={{ fontSize: '16px', color }}></iconify-icon>
          )}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <span className="text-[12px] font-medium text-stone-500" style={{ animation: 'pulse 1.8s ease-in-out infinite' }}>{label}中...</span>
            ) : (
              <span className="text-[12px] text-stone-500">
                <span className="font-medium text-stone-600">{label}</span>
                {step.subtitle && (
                  <span className="font-mono ml-1 text-stone-400">{step.subtitle}</span>
                )}
              </span>
            )}
            {step.duration && step.status === 'done' && (
              <span className="text-[10px] text-stone-400">{step.duration}</span>
            )}
          </div>

          {hasContent && (
            <>
              {/* 展开/折叠箭头 */}
              <div className="flex items-center gap-1 mt-0.5">
                <iconify-icon
                  icon="ph:caret-right"
                  style={{ fontSize: '12px', color: '#d6d3d1' }}
                  className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
                ></iconify-icon>
                <span className="text-[10px] text-stone-400">{expanded ? '收起详情' : '查看详情'}</span>
              </div>

              {/* 展开内容 */}
              {expanded && step.content && (
                <div className="mt-2 bg-stone-50 rounded-lg p-2.5 text-[11px] text-stone-600 leading-relaxed whitespace-pre-wrap font-mono border border-stone-100 max-h-[300px] overflow-y-auto">
                  {step.content}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
