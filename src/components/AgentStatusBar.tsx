/**
 * Agent 状态面板 — 多 Agent 协作的"作战指挥部"
 *
 * 视觉设计：
 * - 横向胶囊卡片阵：每个 Agent 一张卡片
 * - 状态指示：左色条 + 头像 + 名称 + 状态徽章 + 脉冲动画
 * - 1 个 Agent 也显示（明确"当前谁在执行"）
 * - 委托关系：箭头连接（orchestrator → worker）
 */
import type { AgentStep } from '../types';

export type AgentRuntimeStatus = 'idle' | 'working' | 'done' | 'error';

interface AgentInfo {
  agentId: string;
  agentName: string;
  agentIcon?: string;
  agentColor?: string;
  status: AgentRuntimeStatus;
  /** 该 Agent 完成的 step 数 */
  stepCount?: number;
  /** 委派来源 Agent（可选） */
  parentAgentId?: string;
}

interface Props {
  /** 从 steps 中提取的 Agent 信息 */
  agents: AgentInfo[];
}

const STATUS_LABELS: Record<AgentRuntimeStatus, string> = {
  idle: '待命',
  working: '执行中',
  done: '已完成',
  error: '出错',
};

export default function AgentStatusBar({ agents }: Props) {
  if (agents.length === 0) return null;

  const isMulti = agents.length > 1;
  const workingCount = agents.filter(a => a.status === 'working').length;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-b ${
        isMulti
          ? 'bg-gradient-to-r from-violet-50/80 via-purple-50/60 to-fuchsia-50/80 border-violet-200/70'
          : 'bg-stone-50/60 border-stone-100'
      }`}
    >
      {/* 左侧标题（多 Agent 才显示"协作矩阵"标识） */}
      {isMulti && (
        <div className="flex items-center gap-1 mr-1.5 px-2 py-1 rounded-md bg-white/80 border border-violet-200 shadow-sm">
          <iconify-icon
            icon="ph:flow-arrow"
            className={workingCount > 0 ? 'animate-pulse' : ''}
            style={{ fontSize: '12px', color: '#7c3aed' }}
          />
          <span className="text-[10px] font-bold text-violet-700">
            协作矩阵
          </span>
          <span className="text-[10px] text-violet-500 font-mono">
            {workingCount > 0 ? `${workingCount}/${agents.length}` : `${agents.length}`}
          </span>
        </div>
      )}

      {/* Agent 卡片 */}
      {agents.map((agent) => (
        <AgentCard key={agent.agentId} agent={agent} />
      ))}

      {/* 多 Agent 时，右侧加一个细线连接器表示"协作" */}
      {isMulti && workingCount > 1 && (
        <div className="flex items-center gap-0.5 ml-1">
          <span className="w-1 h-1 rounded-full bg-violet-400 animate-pulse"></span>
          <span className="w-1 h-1 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: '0.2s' }}></span>
          <span className="w-1 h-1 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: '0.4s' }}></span>
        </div>
      )}
    </div>
  );
}

/** 单个 Agent 卡片 */
function AgentCard({ agent }: { agent: AgentInfo }) {
  const color = agent.agentColor || '#6b7280';
  const isWorking = agent.status === 'working';
  const isDone = agent.status === 'done';
  const isError = agent.status === 'error';

  return (
    <div
      className={`relative flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-lg border transition-all ${
        isWorking
          ? 'bg-white border-transparent shadow-sm'
          : isDone
          ? 'bg-white/70 border-emerald-200/60'
          : isError
          ? 'bg-white/70 border-red-200/60'
          : 'bg-white/60 border-stone-200/60'
      }`}
      style={{
        boxShadow: isWorking ? `0 0 0 1px ${color}40, 0 2px 8px -2px ${color}30` : undefined,
      }}
    >
      {/* 左侧色条：状态指示 */}
      <div
        className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full ${
          isDone ? '' : isError ? '' : ''
        }`}
        style={{ backgroundColor: color }}
      ></div>

      {/* 头像 */}
      <div
        className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
          isWorking ? 'animate-pulse' : ''
        }`}
        style={{ backgroundColor: color + '1a' }}
      >
        <iconify-icon
          icon={agent.agentIcon || 'ph:robot'}
          style={{ fontSize: '13px', color }}
        />
      </div>

      {/* 名称 */}
      <span className="text-[11px] font-semibold text-stone-700 truncate max-w-[100px]">
        {agent.agentName}
      </span>

      {/* 状态徽章 */}
      <span
        className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-0.5 ${
          isWorking
            ? 'bg-blue-100 text-blue-700'
            : isDone
            ? 'bg-emerald-100 text-emerald-700'
            : isError
            ? 'bg-red-100 text-red-700'
            : 'bg-stone-100 text-stone-500'
        }`}
      >
        {isWorking && (
          <iconify-icon
            icon="ph:spinner"
            className="animate-spin"
            style={{ fontSize: '9px' }}
          />
        )}
        {isDone && (
          <iconify-icon icon="ph:check" style={{ fontSize: '9px', fontWeight: 'bold' }} />
        )}
        {isError && (
          <iconify-icon icon="ph:warning" style={{ fontSize: '9px', fontWeight: 'bold' }} />
        )}
        {STATUS_LABELS[agent.status]}
      </span>

      {/* step 数（多步任务时显示） */}
      {agent.stepCount !== undefined && agent.stepCount > 0 && (
        <span className="text-[9px] text-stone-400 font-mono">
          ×{agent.stepCount}
        </span>
      )}
    </div>
  );
}

/**
 * 从 steps 数组中提取唯一的 Agent 列表和状态
 * 增强：统计 step 数 + 推断委派关系
 */
export function extractAgentsFromSteps(steps: AgentStep[]): AgentInfo[] {
  const agentMap = new Map<string, AgentInfo>();

  for (const step of steps) {
    if (step.agentId && step.agentName) {
      if (!agentMap.has(step.agentId)) {
        agentMap.set(step.agentId, {
          agentId: step.agentId,
          agentName: step.agentName,
          status: 'working',
          stepCount: 0,
        });
      }
      const agent = agentMap.get(step.agentId)!;
      agent.stepCount = (agent.stepCount || 0) + 1;
      // 状态优先级：working > error > done > idle
      if (step.status === 'running') {
        agent.status = 'working';
      } else if (step.status === 'error' && agent.status !== 'working') {
        agent.status = 'error';
      } else if (step.status === 'done' && agent.status !== 'working' && agent.status !== 'error') {
        agent.status = 'done';
      }
    }
  }

  return Array.from(agentMap.values());
}
