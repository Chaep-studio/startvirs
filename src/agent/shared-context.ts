/**
 * 共享上下文系统
 * 多 Agent 并行协作时，各 Agent 通过 SharedContext 共享进度、发现和文件状态
 */

export type AgentStatus = 'idle' | 'working' | 'done' | 'error';

export interface AgentProgress {
  agentId: string;
  agentName: string;
  agentIcon: string;
  agentColor: string;
  status: AgentStatus;
  /** 该 Agent 的发现/结论 */
  findings: string[];
  /** 该 Agent 的任务清单 */
  todos: { content: string; status: 'pending' | 'in_progress' | 'completed' }[];
  /** 该 Agent 开始时间 */
  startedAt: number;
  /** 该 Agent 完成时间 */
  finishedAt?: number;
}

export class SharedContext {
  /** 每个 Agent 的进度 */
  agents = new Map<string, AgentProgress>();
  /** 所有 Agent 修改过的文件路径 */
  modifiedFiles = new Set<string>();
  /** 全局事件日志（按时间排序） */
  events: { time: number; agentId: string; type: string; detail: string }[] = [];

  /** 注册一个 Agent 开始工作 */
  registerAgent(agentId: string, name: string, icon: string, color: string): void {
    this.agents.set(agentId, {
      agentId,
      agentName: name,
      agentIcon: icon,
      agentColor: color,
      status: 'working',
      findings: [],
      todos: [],
      startedAt: Date.now(),
    });
  }

  /** 更新 Agent 状态 */
  setStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      if (status === 'done' || status === 'error') {
        agent.finishedAt = Date.now();
      }
    }
  }

  /** 添加 Agent 的发现/结论 */
  addFinding(agentId: string, finding: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.findings.push(finding);
    }
  }

  /** 记录文件被修改 */
  addModifiedFile(path: string): void {
    this.modifiedFiles.add(path);
  }

  /** 记录事件 */
  addEvent(agentId: string, type: string, detail: string): void {
    this.events.push({ time: Date.now(), agentId, type, detail });
  }

  /** 生成上下文摘要（供 Coordinator 汇总用） */
  getSummary(): string {
    const lines: string[] = [];

    // Agent 状态
    for (const [, agent] of this.agents) {
      const duration = agent.finishedAt
        ? `${((agent.finishedAt - agent.startedAt) / 1000).toFixed(1)}s`
        : '进行中';
      lines.push(`## ${agent.agentName} [${agent.status}] (${duration})`);

      if (agent.findings.length > 0) {
        lines.push('发现:');
        agent.findings.forEach(f => lines.push(`- ${f}`));
      }

      if (agent.todos.length > 0) {
        const done = agent.todos.filter(t => t.status === 'completed').length;
        lines.push(`任务进度: ${done}/${agent.todos.length}`);
      }
    }

    // 修改的文件
    if (this.modifiedFiles.size > 0) {
      lines.push('\n修改的文件:');
      this.modifiedFiles.forEach(f => lines.push(`- ${f}`));
    }

    return lines.join('\n');
  }
}
