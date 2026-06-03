import { useState, useMemo, useCallback, useEffect } from 'react';
import type { ApiConfig, Message, Session, Skill, SidebarAction, McpServerConfig, McpTool, AgentConfig, ModelConfig } from './types';
import { load, generateId } from './utils';
import { streamCompletion } from './agent/api';
import { runAgentLoop, toolStepType, toolTitle } from './agent/agent-loop';
import { TOOL_SERVER_URL } from './agent/tools';
import {
  loadSkills,
  saveSkills,
  resetSkills,
  addSkill,
  updateSkill,
  deleteSkill,
  matchSkill,
  appendThinkingInstruction,
  extractThinking,
  createWelcomeMessages,
} from './agent/skills';
import {
  loadSessions,
  saveSessions,
  loadCurrentSessionId,
  saveCurrentSessionId,
  addSession,
  updateSessionMessages,
  removeSession,
} from './agent/sessions';
import { loadAgents, saveAgents, loadCurrentAgentId, saveCurrentAgentId } from './agent/agents';
import { loadModels, saveModels, loadDefaultModelId, saveDefaultModelId, resolveApiConfig, getDefaultModel } from './agent/models';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import SkillsView from './components/SkillsView';
import ArtifactsView from './components/ArtifactsView';
import AutoView from './components/AutoView';
import SettingsModal from './components/SettingsModal';
import SkillEditorModal from './components/SkillEditorModal';
import ImportSkillsModal from './components/ImportSkillsModal';
import McpModal from './components/McpModal';
import AgentModal from './components/AgentModal';
import { isHtmlContent } from './components/HtmlPreview';
import { loadMcpServers, saveMcpServers } from './agent/mcp';

const SIDEBAR_ACTIONS: SidebarAction[] = [
  { id: 'new', icon: 'ph:plus', label: '新对话' },
  { id: 'skills', icon: 'ph:lightning', label: '技能' },
  { id: 'auto', icon: 'ph:robot', label: '自动化' },
  { id: 'artifacts', icon: 'ph:scroll', label: '产物' },
];

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('chat');
  const [skills, setSkills] = useState<Skill[]>(() => loadSkills());
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [currentSessionId, setCurrentSessionId] = useState(() => loadCurrentSessionId());
  const [messages, setMessages] = useState<Message[]>(() => {
    const sid = loadCurrentSessionId();
    if (sid) {
      const s = loadSessions().find((x) => x.id === sid);
      if (s) return s.messages;
    }
    return createWelcomeMessages(loadSkills());
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkillEditor, setShowSkillEditor] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(() => loadMcpServers());
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>(() => loadAgents());
  const [currentAgentId, setCurrentAgentId] = useState(() => loadCurrentAgentId());
  const [showAgentModal, setShowAgentModal] = useState(false);
  const currentAgent = useMemo(() => agents.find(a => a.id === currentAgentId) || agents[0], [agents, currentAgentId]);
  const [models, setModels] = useState<ModelConfig[]>(() => loadModels());
  const [defaultModelId, setDefaultModelId] = useState(() => loadDefaultModelId());
  const defaultModel = useMemo(() => getDefaultModel(models), [models]);
  // 兼容：从 models 计算出当前默认 ApiConfig
  const apiConfig = useMemo<ApiConfig>(() => {
    if (defaultModel) {
      return { enabled: true, url: defaultModel.url, key: defaultModel.key, model: defaultModel.model };
    }
    return { enabled: false, url: '', key: '', model: '' };
  }, [defaultModel]);

  // 兼容旧数据的迁移：如果 localStorage 里有 chat_api_config 且 models 为空
  useEffect(() => {
    const oldCfg = load<ApiConfig>('chat_api_config');
    if (oldCfg && oldCfg.enabled && models.every(m => !m.key)) {
      const migrated: ModelConfig = {
        id: 'migrated-default',
        name: oldCfg.model || 'gpt-4o',
        icon: 'ph:openai-logo',
        color: '#10a37f',
        url: oldCfg.url,
        key: oldCfg.key,
        model: oldCfg.model || 'gpt-4o',
        isDefault: true,
        enabled: true,
      };
      const next = [migrated, ...models.filter(m => m.id !== 'migrated-default')];
      setModels(next);
      saveModels(next);
      setDefaultModelId(migrated.id);
      saveDefaultModelId(migrated.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sessions.length === 0 && messages.length > 0) {
      const newId = generateId();
      const newSession = {
        id: newId,
        title: '新对话',
        messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveSessions([newSession]);
      setSessions([newSession]);
      setCurrentSessionId(newId);
      saveCurrentSessionId(newId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) || null,
    [sessions, currentSessionId]
  );

  const saveCurrentMessages = useCallback(
    (msgs: Message[], title?: string) => {
      setMessages(msgs);
      if (currentSessionId) {
        const next = updateSessionMessages(sessions, currentSessionId, msgs, title);
        setSessions(next);
      }
    },
    [currentSessionId, sessions]
  );

  const startNewChat = useCallback(() => {
    const newId = generateId();
    const welcome = createWelcomeMessages(skills);
    const newSession = {
      id: newId,
      title: '新对话',
      messages: welcome,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = addSession(sessions, newSession);
    setSessions(next);
    setCurrentSessionId(newId);
    saveCurrentSessionId(newId);
    setMessages(welcome);
    setActiveView('chat');
    setSidebarOpen(false);
  }, [skills, sessions]);

  const switchSession = useCallback(
    (id: string) => {
      const s = sessions.find((x) => x.id === id);
      if (s) {
        setCurrentSessionId(id);
        saveCurrentSessionId(id);
        setMessages(s.messages);
        setActiveView('chat');
        setSidebarOpen(false);
      }
    },
    [sessions]
  );

  const handleDeleteSession = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const result = removeSession(sessions, id);
      if (result.sessions.length === 0) {
        const welcome = createWelcomeMessages(skills);
        const newId = generateId();
        const ns = { id: newId, title: '新对话', messages: welcome, createdAt: Date.now(), updatedAt: Date.now() };
        saveSessions([ns]);
        setSessions([ns]);
        setCurrentSessionId(newId);
        saveCurrentSessionId(newId);
        setMessages(welcome);
      } else {
        setSessions(result.sessions);
        if (currentSessionId === id) {
          const first = result.sessions[0];
          setCurrentSessionId(first.id);
          saveCurrentSessionId(first.id);
          setMessages(first.messages);
        }
      }
    },
    [sessions, currentSessionId, skills]
  );

  const artifacts = useMemo(() => {
    const list: Message[] = [];
    (currentSession?.messages || messages).forEach((m) => {
      if (m.type === 'task' && m.content) {
        list.push(m);
      }
    });
    return list.reverse();
  }, [currentSession, messages]);

  const addMessage = useCallback(
    (msg: Omit<Message, 'id' | 'time'> | Message) => {
      const fullMsg: Message = 'id' in msg && typeof (msg as Message).id === 'number'
        ? (msg as Message)
        : { ...(msg as Omit<Message, 'id' | 'time'>), id: Date.now(), time: Date.now() };
      const next = [...messages, fullMsg];
      setMessages(next);
      if (currentSessionId) {
        const updated = updateSessionMessages(sessions, currentSessionId, next);
        setSessions(updated);
      }
    },
    [messages, currentSessionId, sessions]
  );

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    addMessage({ role: 'user', type: 'text', text: userText });
    setInput('');
    setLoading(true);

    const matched = matchSkill(skills, userText);

    if (matched && !matched.input) {
      addMessage({
        role: 'agent',
        type: 'text',
        text: `用法：${matched.skill.command} ${matched.skill.paramsHint}\n\n${matched.skill.description}`,
      });
      setLoading(false);
      return;
    }

    // 构建 API 消息
    let systemContent: string;
    let userPromptMessages: { role: string; content: string }[];

    if (matched) {
      systemContent = appendThinkingInstruction(matched.skill.systemPrompt);
      const prompt = matched.skill.promptTemplate.replace(/\{\{input\}\}/g, matched.input);
      userPromptMessages = [
        { role: 'system', content: systemContent },
        { role: 'user', content: prompt },
      ];
    } else {
      const history = messages
        .filter((m) => m.role !== 'system' && m.type === 'text')
        .slice(-10)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text || '' }));
      systemContent = currentAgent.systemPrompt;
      userPromptMessages = [
        { role: 'system', content: systemContent },
        ...history,
        { role: 'user', content: userText },
      ];
    }

    // 创建唯一的消息 ID
    const msgId = Date.now() + Math.floor(Math.random() * 10000);

    // ===== 通用辅助：流式完成后保存到 localStorage =====
    const persistMessages = (finalMsgs: Message[], title?: string) => {
      setSessions(prev => {
        const next = prev.map(s =>
          s.id === currentSessionId
            ? { ...s, messages: finalMsgs, updatedAt: Date.now(), ...(title ? { title } : {}) }
            : s
        );
        saveSessions(next);
        return next;
      });
    };

    if (matched) {
      // ===== 技能执行：流式模式 =====
      const initialSteps: import('./types').AgentStep[] = [
        { id: 'think-1', type: 'thinking', title: '深度思考', subtitle: matched.skill.name, status: 'running' },
      ];
      if (matched.skill.files) {
        Object.keys(matched.skill.files).slice(0, 6).forEach((path, i) => {
          initialSteps.push({
            id: `read-${i}`,
            type: 'read_file',
            title: '读取文件',
            subtitle: path,
            status: 'running',
          });
        });
      }
      initialSteps.push({
        id: 'gen-1', type: 'write_file', title: '生成结果', status: 'running',
      });

      // 添加初始消息
      addMessage({
        id: msgId, role: 'agent', type: 'task',
        title: `执行：${matched.skill.name}`,
        subtitle: matched.input.slice(0, 30) + (matched.input.length > 30 ? '...' : ''),
        status: 'loading', icon: matched.skill.icon, color: matched.skill.color,
        expanded: true, steps: initialSteps, content: '', time: Date.now(),
      });

      try {
        let fullContent = '';
        for await (const token of streamCompletion(apiConfig, userPromptMessages, 16384)) {
          fullContent += token;
          setMessages(prev =>
            prev.map(m => (m.id === msgId ? { ...m, content: fullContent } : m))
          );
        }

        // 流式完成：用 setMessages 拿到最新 state，再一次性保存
        setMessages(prev => {
          const { thinking: extractedThinking, content: cleanContent } = extractThinking(fullContent);
          const hasHtml = isHtmlContent(cleanContent || fullContent);

          const doneSteps: import('./types').AgentStep[] = [];
          if (extractedThinking) {
            doneSteps.push({ id: 'think-1', type: 'thinking', title: '深度思考', subtitle: matched.skill.name, status: 'done', duration: '< 5s', content: extractedThinking });
          } else {
            doneSteps.push({ id: 'think-1', type: 'thinking', title: '深度思考', subtitle: matched.skill.name, status: 'done', duration: '< 5s' });
          }
          if (matched.skill.files) {
            Object.entries(matched.skill.files).slice(0, 6).forEach(([path], i) => {
              doneSteps.push({
                id: `read-${i}`, type: 'read_file', title: '已读取文件', subtitle: path, status: 'done', content: matched.skill.files![path].slice(0, 1000),
              });
            });
          }
          doneSteps.push({
            id: 'gen-1', type: hasHtml ? 'write_file' : 'info', title: hasHtml ? '已生成 HTML 文件' : '生成结果', status: 'done', duration: '< 3s',
          });

          const finalMsgs = prev.map(m =>
            m.id === msgId
              ? { ...m, status: 'done' as const, title: `${matched.skill.name} 已完成`, content: cleanContent || fullContent, steps: doneSteps }
              : m
          );

          const sessionTitle = matched.input.split(/\s+/)[0] || matched.skill.name;
          persistMessages(finalMsgs, sessionTitle);
          return finalMsgs;
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setMessages(prev => {
          const errMsgs = prev.map(m =>
            m.id === msgId ? { ...m, status: 'done' as const, title: '执行出错', content: `**错误：** ${msg}` } : m
          );
          persistMessages(errMsgs);
          return errMsgs;
        });
      }
    } else {
      // ===== 普通对话 =====
      if (currentAgent.useTools) {
        // ===== Agent 模式：可调用工具 =====
        const steps: import('./types').AgentStep[] = [];
        let stepCounter = 0;

        const addStep = (step: Omit<import('./types').AgentStep, 'id'>): string => {
          const id = `step-${++stepCounter}`;
          steps.push({ ...step, id });
          // 实时更新消息的 steps
          setMessages(prev =>
            prev.map(m => (m.id === msgId ? { ...m, steps: [...steps] } : m))
          );
          return id;
        };

        const updateStep = (id: string, update: Partial<import('./types').AgentStep>) => {
          const idx = steps.findIndex(s => s.id === id);
          if (idx >= 0) {
            steps[idx] = { ...steps[idx], ...update };
            setMessages(prev =>
              prev.map(m => (m.id === msgId ? { ...m, steps: [...steps] } : m))
            );
          }
        };

        // 添加初始消息（agent 类型，带 steps）
        addMessage({
          id: msgId, role: 'agent', type: 'task',
          title: `${currentAgent.name} 执行中`,
          subtitle: userText.slice(0, 40),
          status: 'loading', icon: currentAgent.icon, color: currentAgent.color,
          expanded: true, steps: [], content: '', time: Date.now(),
        });

        try {
          let fullContent = '';
          // 根据 Agent 的 modelId 解析实际使用的 ApiConfig
          const agentApiConfig = resolveApiConfig(models, currentAgent.modelId, currentAgent.model) || apiConfig;
          const finalText = await runAgentLoop(
            agentApiConfig,
            [
              { role: 'system', content: systemContent },
              ...messages
                .filter((m) => m.role !== 'system' && m.type === 'text')
                .slice(-10)
                .map((m) => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.text || '' })),
              { role: 'user', content: userText },
            ],
            {
              onToken: (token) => {
                fullContent += token;
                setMessages(prev =>
                  prev.map(m => (m.id === msgId ? { ...m, content: fullContent } : m))
                );
              },
              onToolCallStart: (toolName, args) => {
                const stepType = toolStepType(toolName);
                const title = toolTitle(toolName, args);
                addStep({
                  type: stepType,
                  title,
                  subtitle: toolName === 'bash' ? (args.command as string || '').slice(0, 60) : (args.path as string || ''),
                  status: 'running',
                });
              },
              onToolCallEnd: (_toolName, _args, result, duration) => {
                // 更新最后一个同类型步骤为 done
                const stepType = toolStepType(_toolName);
                for (let i = steps.length - 1; i >= 0; i--) {
                  if (steps[i].type === stepType && steps[i].status === 'running') {
                    const durationStr = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;
                    let resultPreview = '';
                    if (result && typeof result === 'object') {
                      const r = result as Record<string, unknown>;
                      if ('content' in r && typeof r.content === 'string') {
                        resultPreview = r.content.slice(0, 500);
                      } else if ('stdout' in r && typeof r.stdout === 'string') {
                        resultPreview = r.stdout.slice(0, 500);
                      } else if ('error' in r) {
                        resultPreview = `错误: ${String(r.error).slice(0, 200)}`;
                      } else if ('files' in r) {
                        resultPreview = `${(r.files as unknown[]).length} 个文件`;
                      }
                    }
                    updateStep(steps[i].id, {
                      status: 'done',
                      duration: durationStr,
                      ...(resultPreview ? { content: resultPreview } : {}),
                    });
                    break;
                  }
                }
              },
            },
            TOOL_SERVER_URL,
            mcpServers.filter(s => s.enabled),
            mcpTools,
            currentAgent,
            agents,
            models,
            currentSessionId || undefined,
          );

          // 流式完成
          const { thinking: extractedThinking, content: cleanContent } = extractThinking(fullContent || finalText);

          // 如果有 thinking，添加到步骤
          if (extractedThinking) {
            steps.unshift({
              id: `think-${++stepCounter}`,
              type: 'thinking',
              title: '深度思考',
              status: 'done',
              duration: '< 5s',
              content: extractedThinking,
            });
          }

          setMessages(prev => {
            const finalMsgs = prev.map(m =>
              m.id === msgId
                ? {
                    ...m,
                    status: 'done' as const,
                    title: `${currentAgent.name} 已完成`,
                    content: cleanContent || fullContent || finalText,
                    steps: [...steps],
                  }
                : m
            );
            const sessionTitle = userText.split(/\s+/)[0] || 'Agent';
            persistMessages(finalMsgs, sessionTitle);
            return finalMsgs;
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setMessages(prev => {
            const errMsgs = prev.map(m =>
              m.id === msgId ? { ...m, status: 'done' as const, title: '执行出错', content: `**错误：** ${msg}`, steps: [...steps] } : m
            );
            persistMessages(errMsgs);
            return errMsgs;
          });
        }
      } else {
        // ===== 纯对话模式：流式文本 =====
        addMessage({
          id: msgId, role: 'agent', type: 'text',
          text: '', time: Date.now(),
        });

        try {
          let fullContent = '';
          for await (const token of streamCompletion(apiConfig, userPromptMessages, 16384)) {
            fullContent += token;
            setMessages(prev =>
              prev.map(m => (m.id === msgId ? { ...m, text: fullContent } : m))
            );
          }

          setMessages(prev => {
            persistMessages(prev);
            return prev;
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setMessages(prev => {
            const errMsgs = prev.map(m =>
              m.id === msgId ? { ...m, text: `**错误：** ${msg}` } : m
            );
            persistMessages(errMsgs);
            return errMsgs;
          });
        }
      }
    }

    setLoading(false);
  }, [input, loading, skills, apiConfig, models, messages, currentSessionId, sessions, addMessage, currentAgent, mcpServers, mcpTools]);

  const toggleTaskExpand = useCallback(
    (msgId: number) => {
      const next = messages.map((m) => (m.id === msgId ? { ...m, expanded: !m.expanded } : m));
      saveCurrentMessages(next);
    },
    [messages, saveCurrentMessages]
  );

  const handleAction = useCallback(
    (id: string) => {
      if (id === 'new') {
        startNewChat();
        return;
      }
      setActiveView(id);
      setSidebarOpen(false);
    },
    [startNewChat]
  );

  const useSkill = useCallback((skill: Skill) => {
    setActiveView('chat');
    setInput(skill.command + ' ');
  }, []);

  const handleAddSkill = useCallback(
    (skill: Omit<Skill, 'id'>) => {
      const next = addSkill(skills, skill);
      setSkills(next);
      setShowSkillEditor(false);
      setEditingSkill(null);
    },
    [skills]
  );

  const handleUpdateSkill = useCallback(
    (updated: Skill) => {
      const next = updateSkill(skills, updated);
      setSkills(next);
      setShowSkillEditor(false);
      setEditingSkill(null);
    },
    [skills]
  );

  const handleDeleteSkill = useCallback(
    (id: string) => {
      const next = deleteSkill(skills, id);
      setSkills(next);
    },
    [skills]
  );

  const handleResetSkills = useCallback(() => {
    const next = resetSkills();
    setSkills(next);
  }, []);

  const handleImportSkills = useCallback(
    (imported: Omit<Skill, 'id'>[]) => {
      const next = [...skills, ...imported.map((s) => ({ ...s, id: generateId() }))];
      saveSkills(next);
      setSkills(next);
      setShowImportModal(false);
    },
    [skills]
  );

  const handleSaveSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        activeView={activeView}
        sessions={sessions}
        currentSessionId={currentSessionId}
        actions={SIDEBAR_ACTIONS}
        onClose={() => setSidebarOpen(false)}
        onAction={handleAction}
        onSwitchSession={switchSession}
        onDeleteSession={handleDeleteSession}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 pt-4 pb-3 bg-white/80 backdrop-blur-lg border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="sm:hidden w-8 h-8 rounded-lg flex items-center justify-center active:bg-stone-100 transition"
              >
                <iconify-icon icon="ph:list" style={{ fontSize: '18px', color: '#44403c' }}></iconify-icon>
              </button>
              <div>
                <h1 className="text-base font-bold text-stone-900">
                  {activeView === 'chat'
                    ? currentSession?.title || currentAgent?.name || 'YC 创业助手'
                    : activeView === 'skills'
                    ? '技能'
                    : activeView === 'artifacts'
                    ? '产物'
                    : activeView === 'auto'
                    ? '自动化'
                    : 'YC 创业助手'}
                </h1>
                <p className="text-[10px] text-stone-400">
                  {activeView === 'chat'
                    ? `${currentAgent?.name || 'Agent'} · ${skills.length} 个技能已加载`
                    : activeView === 'skills'
                    ? '管理你的技能库'
                    : activeView === 'artifacts'
                    ? '生成的报告和文档'
                    : activeView === 'auto'
                    ? '自动化工作流'
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* 模型选择器 */}
              {defaultModel && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 hover:bg-stone-100 transition"
                  title={`当前模型: ${defaultModel.name}`}
                >
                  <iconify-icon icon={defaultModel.icon} style={{ fontSize: '12px', color: defaultModel.color }}></iconify-icon>
                  <span className="text-[10px] font-semibold text-stone-600 max-w-[60px] truncate">{defaultModel.name}</span>
                  <span className="text-[9px] font-mono text-stone-400">{defaultModel.model}</span>
                </button>
              )}
              {/* Agent 选择器 */}
              <button
                onClick={() => setShowAgentModal(true)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 hover:bg-stone-100 transition"
                title="切换 Agent"
              >
                <iconify-icon icon={currentAgent?.icon || 'ph:bot'} style={{ fontSize: '14px', color: currentAgent?.color || '#78716c' }}></iconify-icon>
                <span className="text-[11px] font-semibold text-stone-700 max-w-[80px] truncate">{currentAgent?.name || 'Agent'}</span>
                {currentAgent?.useTools && (
                  <span className="px-1 py-0 rounded text-[8px] font-bold bg-blue-50 text-blue-500">工具</span>
                )}
                {currentAgent?.delegateToAgents && (
                  <span className="px-1 py-0 rounded text-[8px] font-bold bg-amber-50 text-amber-600">协作</span>
                )}
                <iconify-icon icon="ph:caret-down" style={{ fontSize: '10px', color: '#a8a29e' }}></iconify-icon>
              </button>
              <button
                onClick={() => setShowMcpModal(true)}
                className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition flex items-center gap-0.5 ${
                  mcpTools.length > 0
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-stone-100 text-stone-400'
                }`}
                title="MCP 服务器配置"
              >
                <iconify-icon icon="ph:plug" style={{ fontSize: '10px' }}></iconify-icon>
                MCP{mcpTools.length > 0 ? ` ${mcpTools.length}` : ''}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="w-9 h-9 rounded-xl bg-stone-50 flex items-center justify-center active:bg-stone-100 transition"
              >
                <iconify-icon icon="ph:gear" style={{ fontSize: '18px', color: '#78716c' }}></iconify-icon>
              </button>
            </div>
          </div>
        </div>

        {activeView === 'chat' && (
          <ChatView
            messages={messages}
            input={input}
            loading={loading}
            defaultModel={defaultModel}
            currentAgent={currentAgent}
            onInputChange={setInput}
            onSend={sendMessage}
            onToggleExpand={toggleTaskExpand}
          />
        )}
        {activeView === 'skills' && (
          <SkillsView
            skills={skills}
            onUse={useSkill}
            onEdit={(s) => {
              setEditingSkill(s);
              setShowSkillEditor(true);
            }}
            onDelete={handleDeleteSkill}
            onAdd={() => {
              setEditingSkill(null);
              setShowSkillEditor(true);
            }}
            onReset={handleResetSkills}
            onImport={() => setShowImportModal(true)}
          />
        )}
        {activeView === 'artifacts' && <ArtifactsView artifacts={artifacts} serverUrl="http://localhost:3456" />}
        {activeView === 'auto' && <AutoView />}
      </div>

      {showSettings && (
        <SettingsModal
          models={models}
          defaultModelId={defaultModelId}
          onModelsChange={(updated) => {
            setModels(updated);
            saveModels(updated);
          }}
          onDefaultChange={(id) => {
            setDefaultModelId(id);
            saveDefaultModelId(id);
          }}
          onClose={handleSaveSettings}
        />
      )}
      {showSkillEditor && (
        <SkillEditorModal
          skill={editingSkill}
          onSave={(s) => {
            if ('id' in s && (s as Skill).id) {
              handleUpdateSkill(s as Skill);
            } else {
              handleAddSkill(s as Omit<Skill, 'id'>);
            }
          }}
          onClose={() => {
            setShowSkillEditor(false);
            setEditingSkill(null);
          }}
        />
      )}
      {showImportModal && (
        <ImportSkillsModal
          onImport={handleImportSkills}
          onClose={() => setShowImportModal(false)}
        />
      )}
      {showMcpModal && (
        <McpModal
          servers={mcpServers}
          mcpTools={mcpTools}
          onServersChange={(servers) => {
            setMcpServers(servers);
            saveMcpServers(servers);
          }}
          onToolsChange={setMcpTools}
          onClose={() => setShowMcpModal(false)}
        />
      )}
      {showAgentModal && (
        <AgentModal
          agents={agents}
          currentAgentId={currentAgentId}
          models={models}
          onAgentsChange={(updated) => {
            setAgents(updated);
            saveAgents(updated);
          }}
          onCurrentChange={(id) => {
            setCurrentAgentId(id);
            saveCurrentAgentId(id);
          }}
          onClose={() => setShowAgentModal(false)}
        />
      )}
    </div>
  );
}