import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { ApiConfig, Message, Session, Skill, SidebarAction, McpServerConfig, McpTool, AgentConfig, ModelConfig, FileMode, TodoItem, MemoryEntry, MemoryCategory } from './types';
import { load, save, generateId } from './utils';
import { streamCompletion } from './agent/api';
import { runAgentLoop, toolStepType, toolTitle, type ToolStepMeta } from './agent/agent-loop';
import { SharedContext } from './agent/shared-context';
import { setFileMode, setToolServerUrl, getToolServerUrl, armPendingWrite } from './agent/tools';
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
import { loadModels, saveModels, loadDefaultModelId, saveDefaultModelId, resolveApiConfig } from './agent/models';
import {
  loadFileMode,
  saveFileMode,
  pickLocalDirectory,
  isFsAccessSupported,
  hasLocalDirHandle,
  getSavedLocalDirName,
  getLocalDirHandle,
  loadLocalBashEnabled,
  saveLocalBashEnabled,
  loadDiffConfirmSetting,
  saveDiffConfirmSetting,
} from './agent/file-runtime';
import { loadSandboxConfig } from './agent/sandbox-config';
import { getTodos, subscribeTodos } from './agent/todo';
import { clearSessionAgents, getAllSessionAgents } from './agent/agent-generator';
import {
  loadMemories,
  createMemory,
  updateMemory,
  deleteMemoryById,
  buildMemoryInject,
} from './agent/memory';
import { setMemoryOps } from './agent/memory-tools';
import { estimateMessagesTokens } from './agent/tokenizer';
import { loadContextLimit, saveContextLimit, suggestLimitForModel } from './agent/context-tracker';
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
import MemoryModal from './components/MemoryModal';
import DiffConfirmModal from './components/DiffConfirmModal';
import { isHtmlContent } from './components/HtmlPreview';
import { loadMcpServers, saveMcpServers } from './agent/mcp';

const SIDEBAR_ACTIONS: SidebarAction[] = [
  { id: 'new', icon: 'ph:plus', label: '新对话' },
  { id: 'skills', icon: 'ph:lightning', label: '技能' },
  { id: 'auto', icon: 'ph:robot', label: '自动化' },
  { id: 'artifacts', icon: 'ph:scroll', label: '产物' },
];

/** 顶栏小圆点：展示沙箱连接状态（绿=成功，红=失败/未配置，灰=未测试） */
function SandboxDot({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [cfg, setCfg] = useState(() => loadSandboxConfig());
  useEffect(() => {
    const handler = () => setCfg(loadSandboxConfig());
    window.addEventListener('sandbox-config-changed', handler);
    return () => window.removeEventListener('sandbox-config-changed', handler);
  }, []);
  const color =
    cfg.lastTestOk === true ? '#16a34a' :
    cfg.lastTestOk === false ? '#dc2626' :
    '#a8a29e';
  const label =
    cfg.lastTestOk === true ? '沙箱已连接' :
    cfg.lastTestOk === false ? '沙箱连接失败，点击配置' :
    '沙箱未测试，点击配置';
  return (
    <span
      onClick={onOpenSettings}
      title={label}
      role="button"
      className="inline-block w-1.5 h-1.5 rounded-full cursor-pointer hover:scale-125 transition"
      style={{ backgroundColor: color, boxShadow: `0 0 0 2px ${color}30` }}
    ></span>
  );
}

/** 文件模式菜单的单个选项 */
function ModeMenuItem({
  icon,
  iconColor,
  title,
  subtitle,
  active,
  disabled,
  onClick,
}: {
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full flex items-start gap-2 px-3 py-2 transition text-left ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-stone-50 cursor-pointer'
      } ${active ? 'bg-stone-50' : ''}`}
    >
      <iconify-icon icon={icon} style={{ fontSize: '16px', color: iconColor, marginTop: '1px' }}></iconify-icon>
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] font-semibold ${active ? 'text-stone-900' : 'text-stone-700'}`}>{title}</div>
        <div className="text-[10px] text-stone-500 truncate">{subtitle}</div>
      </div>
      {active && (
        <iconify-icon icon="ph:check" style={{ fontSize: '14px', color: iconColor }}></iconify-icon>
      )}
    </button>
  );
}

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
  // ⚠️ 必须把 defaultModelId 加进依赖：getDefaultModel 内部读的是 state
  const defaultModel = useMemo(() => {
    // 优先按 state 里的 id 找（响应式）
    const byState = models.find(m => m.id === defaultModelId && m.enabled);
    if (byState) return byState;
    // 兜底：第一个启用的模型
    return models.find(m => m.enabled);
  }, [models, defaultModelId]);
  // 文件 I/O 模式：cloud (Daytona 沙箱) / local (浏览器 FS Access API) / test (server 本机文件) / none (纯对话)
  const [fileMode, setFileModeState] = useState<FileMode>(() => loadFileMode());
  const [localDirName, setLocalDirName] = useState<string | null>(() => getSavedLocalDirName());
  // ⚠️ 本地 bash 开关（高危：开启后 AI 可在 server 本机跑任意 shell）
  const [localBashEnabled, setLocalBashEnabledState] = useState<boolean>(() => loadLocalBashEnabled());
  // 写文件前 diff 确认开关（默认关：资深用户全手动开）
  const [diffConfirmEnabled, setDiffConfirmEnabledState] = useState<boolean>(() => loadDiffConfirmSetting());
  // 待确认的写操作（弹窗用）
  const [pendingWrite, setPendingWrite] = useState<{
    toolName: 'write_file' | 'edit_file';
    path: string;
    newContent: string;
    oldStr?: string;
    oldContent?: string;
    args?: Record<string, unknown>;
    /** 解锁 agent-loop 的 await（agent-loop 拿到这个 resolve('confirm' | 'cancel') 后继续下一轮） */
    resolve?: (decision: 'confirm' | 'cancel') => void;
  } | null>(null);
  // 测试模式工作空间路径（从 server.mjs /api/test/info 拉取）
  const [testWorkspace, setTestWorkspace] = useState<string | null>(null);
  // 文件模式菜单开关
  const [fileModeMenuOpen, setFileModeMenuOpen] = useState(false);
  // server.mjs 后端可达性（ping /api/server/ping）
  const [serverReachable, setServerReachable] = useState<boolean | null>(null); // null=未知
  // 移动端 dropdown 全屏 backdrop
  const [isMobile, setIsMobile] = useState(false);
  // 当前 Todo 列表（用于 UI 展示）
  const [todos, setTodos] = useState<TodoItem[]>([]);
  // 当前 session 动态生成的 Agent
  const [sessionGeneratedAgents, setSessionGeneratedAgents] = useState(getAllSessionAgents());
  // 本地目录选择提示
  const [showLocalDirPrompt, setShowLocalDirPrompt] = useState(false);
  // ===== 记忆系统 state =====
  const [memories, setMemoriesState] = useState<MemoryEntry[]>(() => loadMemories());
  // 用 ref 保持"最新 memories"供 agent-loop 内部回调使用（避免闭包过期）
  const memoriesRef = useRef<MemoryEntry[]>(memories);
  useEffect(() => { memoriesRef.current = memories; }, [memories]);
  // 记忆管理弹窗
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  // ⭐ 收藏弹窗（agent 消息 → 选分类+标题 → 存记忆）
  const [starPrompt, setStarPrompt] = useState<{
    msg: Message;
    category: MemoryCategory;
    scopeKey: string;
    title: string;
    tags: string;
  } | null>(null);
  // ===== 上下文窗口上限（用户可手动调，默认按 model 推断） =====
  const [contextLimit, setContextLimitState] = useState<number>(() => loadContextLimit());
  // 兼容：从 models 计算出当前默认 ApiConfig
  const apiConfig = useMemo<ApiConfig>(() => {
    if (defaultModel) {
      return { enabled: true, url: defaultModel.url, key: defaultModel.key, model: defaultModel.model, reasoningEffort: defaultModel.reasoningEffort };
    }
    return { enabled: false, url: '', key: '', model: '' };
  }, [defaultModel]);

  // 兼容旧数据的迁移：如果 localStorage 里有 chat_api_config 且 models 为空
  useEffect(() => {
    // ===== 注入记忆操作器（让 agent-loop 里的记忆工具能跑通） =====
    setMemoryOps({
      getAll: () => memoriesRef.current,
      create: (input) => {
        const { list, entry } = createMemory(memoriesRef.current, input);
        setMemoriesState(list);
        return entry;
      },
      update: (id, patch) => {
        const list = updateMemory(memoriesRef.current, id, patch);
        setMemoriesState(list);
        return list.find(m => m.id === id) || null;
      },
      remove: (id) => {
        const list = deleteMemoryById(memoriesRef.current, id);
        setMemoriesState(list);
        return list.length !== memoriesRef.current.length;
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 订阅 todo 变化
  useEffect(() => {
    return subscribeTodos((next) => setTodos(next));
  }, []);

  // fileMode 持久化 + 同步给 tools.ts
  useEffect(() => {
    saveFileMode(fileMode);
    setFileMode(fileMode);
  }, [fileMode]);

  // 启动时加载沙箱配置 + 同步到 tools.ts
  useEffect(() => {
    const cfg = loadSandboxConfig();
    setToolServerUrl(cfg.url);
  }, []);

  // 检测移动端（用于 dropdown 布局决策）
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 640px)');
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // 探活：server.mjs 是否可达？定时重试
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch(`${getToolServerUrl()}/api/server/ping`, { cache: 'no-store' });
        if (!cancelled) setServerReachable(res.ok);
      } catch {
        if (!cancelled) setServerReachable(false);
      }
    };
    probe();
    // 每 10 秒重试一次（适用于 server 中途启动的场景）
    const timer = setInterval(probe, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // server 不可达时，自动把 fileMode 强制为 'none'（避免选了 cloud 但每次都失败）
  useEffect(() => {
    if (serverReachable === false && fileMode !== 'none' && fileMode !== 'local') {
      setFileModeState('none');
    }
  }, [serverReachable, fileMode]);

  // 拉取测试模式工作空间路径（用于顶栏展示）
  useEffect(() => {
    let cancelled = false;
    const fetchTestInfo = async () => {
      try {
        const res = await fetch(`${getToolServerUrl()}/api/test/info`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.workspace) setTestWorkspace(data.workspace);
      } catch {
        // server 未启动时忽略
      }
    };
    fetchTestInfo();
    // 切换 fileMode 重新拉取
    if (fileMode === 'test') fetchTestInfo();
    return () => { cancelled = true; };
  }, [fileMode]);

  // 点击其他位置关闭文件模式菜单
  useEffect(() => {
    if (!fileModeMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-file-mode-menu]')) return;
      setFileModeMenuOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [fileModeMenuOpen]);

  // 切到新会话：清理 todo + 临时 Agent
  const handleNewChat = useCallback(() => {
    setTodos([]);
    clearSessionAgents();
    setSessionGeneratedAgents([]);
  }, []);
  useEffect(() => {
    (window as unknown as { __cleanupOnNewChat?: () => void }).__cleanupOnNewChat = handleNewChat;
  }, [handleNewChat]);

  /** 切换文件模式 */
  const handleSetFileMode = useCallback(async (mode: FileMode) => {
    setFileModeMenuOpen(false);
    if (mode === 'local') {
      // 切到本地模式时，要求用户先选目录
      if (!isFsAccessSupported()) {
        alert('当前浏览器不支持 File System Access API。\n\n请使用 Chrome / Edge / Arc 86+ 浏览器，并在 localhost 或 HTTPS 下打开。\n\n移动端浏览器 / 纯静态部署请选「纯对话」模式。');
        return;
      }
      if (!hasLocalDirHandle()) {
        try {
          const handle = await pickLocalDirectory();
          if (handle) {
            setLocalDirName(handle.name);
            setFileModeState('local');
          }
        } catch (e) {
          // 用户取消
          console.log('目录选择取消:', e);
        }
        return;
      }
    }
    // test 模式：检测 server 是否启动了 /api/test/info
    if (mode === 'test') {
      try {
        const res = await fetch(`${getToolServerUrl()}/api/test/info`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.workspace) setTestWorkspace(data.workspace);
      } catch {
        alert('无法连接工具服务器的测试模式。\n\n请确保 server.mjs 已启动（npm run server），且 .env 中没有禁用该端点。');
        return;
      }
    }
    // cloud 模式：检测 server 可达性 + DAYTONA_API_KEY
    if (mode === 'cloud') {
      try {
        const res = await fetch(`${getToolServerUrl()}/api/server/ping`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.hasDaytonaKey) {
          alert('server.mjs 已连接，但 DAYTONA_API_KEY 未配置，云端模式将无法工作。\n请在 .env 中设置后重启 server.mjs。');
          return;
        }
      } catch {
        alert('无法连接工具服务器，云端模式不可用。\n\n请在 .env 配置正确的服务端 URL（设置 → 沙箱），并确保 server.mjs 已启动。\n\n或者切换到「纯对话」模式。');
        return;
      }
    }
    setFileModeState(mode);
  }, []);

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
    // 清理 todo + 临时 Agent
    setTodos([]);
    clearSessionAgents();
    setSessionGeneratedAgents([]);
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

  // ===== 实时算当前会话的 token 用量（用于顶栏圆环） =====
  // 拼装逻辑跟 sendMessage 中的 systemContent 注入一致
  const currentTokens = useMemo(() => {
    const mInject = buildMemoryInject(memories, currentAgent, input);
    const memBlock = [mInject.soulBlock, mInject.userBlock, mInject.agentBlock, mInject.projectBlock].filter(Boolean).join('\n\n');
    const memInstr = currentAgent?.useTools
      ? `\n\n【长期记忆（必读）】\n你拥有 4 个记忆工具：save_memory / list_memories / get_memory / delete_memory。\n满足以下任一条件时，**主动调用 save_memory** 写入对应分类：\n- 用户明确说"记住 XX / 别忘了 / 以后都这样" → user 分类\n- 用户透露身份/背景/偏好/家庭/职业等事实 → user 分类\n- 你在对话中学到一条经验/教训/方法论（与本 Agent 强相关）→ agent 分类（按当前 Agent）\n- 用户提到具体项目并做出关键决策（架构选型、立项、推翻某方案）→ memory 分类（必传 project 字段）\n调用前不必征得用户同意，默默记下即可。一次回复里多条记忆可多次调用。`
      : '';
    const systemContent = (currentAgent?.systemPrompt || '') + memInstr + (memBlock ? `\n\n${memBlock}` : '');

    const oaMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemContent },
    ];
    // 取最近 10 条 text 消息（跟 sendMessage 一致）
    const history = messages
      .filter(m => m.role !== 'system' && m.type === 'text')
      .slice(-50)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text || '' }));
    oaMessages.push(...history);
    // 加上用户当前正在输入的内容
    if (input.trim()) oaMessages.push({ role: 'user', content: input.trim() });

    return estimateMessagesTokens(oaMessages);
  }, [messages, currentAgent, memories, input]);

  // 按当前 model 推荐的默认上限（用于 tooltip）
  const suggestedLimit = useMemo(() => {
    return suggestLimitForModel(defaultModel?.model || '');
  }, [defaultModel]);

  const handleSetContextLimit = useCallback((limit: number) => {
    if (limit <= 0) return;
    setContextLimitState(limit);
    saveContextLimit(limit);
  }, []);

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
    // 重置 diff 拦截状态：本轮第一个写文件会弹
    armPendingWrite();

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

    // ===== 注入长期记忆（soul/user 始终；agent/project 按需） =====
    const memoryInject = buildMemoryInject(memories, currentAgent, userText);
    const memoryBlock = [
      memoryInject.soulBlock,
      memoryInject.userBlock,
      memoryInject.agentBlock,
      memoryInject.projectBlock,
    ].filter(Boolean).join('\n\n');

    // 工具型 Agent 追加"什么时候该记"的明确指令
    const memoryInstruction = currentAgent.useTools
      ? `\n\n【长期记忆（必读）】\n你拥有 4 个记忆工具：save_memory / list_memories / get_memory / delete_memory。\n满足以下任一条件时，**主动调用 save_memory** 写入对应分类：\n- 用户明确说"记住 XX / 别忘了 / 以后都这样" → user 分类\n- 用户透露身份/背景/偏好/家庭/职业等事实 → user 分类\n- 你在对话中学到一条经验/教训/方法论（与本 Agent 强相关）→ agent 分类（按当前 Agent）\n- 用户提到具体项目并做出关键决策（架构选型、立项、推翻某方案）→ memory 分类（必传 project 字段）\n调用前不必征得用户同意，默默记下即可。一次回复里多条记忆可多次调用。`
      : '';

    if (matched) {
      systemContent = appendThinkingInstruction(matched.skill.systemPrompt) + memoryInstruction + (memoryBlock ? `\n\n${memoryBlock}` : '');
      const prompt = matched.skill.promptTemplate.replace(/\{\{input\}\}/g, matched.input);
      userPromptMessages = [
        { role: 'system', content: systemContent },
        { role: 'user', content: prompt },
      ];
    } else {
      const history = messages
        .filter((m) => m.role !== 'system' && m.type === 'text')
        .slice(-50)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text || '' }));
      systemContent = currentAgent.systemPrompt + memoryInstruction + (memoryBlock ? `\n\n${memoryBlock}` : '');
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

    // LLM 仍走云端 API（fileMode 只影响文件 I/O，不影响 LLM 调用）
    const effectiveConfig = apiConfig;

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
        for await (const token of streamCompletion(effectiveConfig, userPromptMessages, 16384)) {
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
          agentId: currentAgent.id,
        });

        // 创建共享上下文（多 Agent 协作时共享进度和文件状态）
        const sharedContext = new SharedContext();
        sharedContext.registerAgent(currentAgent.id, currentAgent.name, currentAgent.icon, currentAgent.color);

        try {
          let fullContent = '';
          // 根据 Agent 的 modelId 解析实际使用的 ApiConfig
          const agentApiConfig = resolveApiConfig(models, currentAgent.modelId, currentAgent.model) || effectiveConfig;
          const finalText = await runAgentLoop(
            agentApiConfig,
            [
              { role: 'system', content: systemContent },
              ...messages
                .filter((m) => m.role !== 'system' && m.type === 'text')
                .slice(-50)
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
              onToolCallStart: (toolName, args, callerAgentId, meta) => {
                const stepType = toolStepType(toolName);
                const title = toolTitle(toolName, args, agents);
                // subtitle：agent_delegate 展示问题摘要，bash 展示命令，文件类展示路径
                let subtitle = '';
                if (stepType === 'agent_delegate') {
                  if (toolName === 'generate_agent') {
                    subtitle = String(args.description || args.task || '').slice(0, 80);
                  } else {
                    subtitle = String(args.question || '').slice(0, 80);
                  }
                } else if (toolName === 'bash') {
                  subtitle = (args.command as string || '').slice(0, 60);
                } else if (args.path) {
                  subtitle = String(args.path);
                }
                // 关键：agent_delegate 步骤用"目标 Agent"作为主体；普通步骤用"调用方父 Agent"
                const isDelegate = stepType === 'agent_delegate';
                const subjectId = isDelegate ? (meta?.agentId) : (callerAgentId || meta?.agentId);
                const subjectName = isDelegate
                  ? (meta?.agentName || (callerAgentId ? agents.find(a => a.id === callerAgentId)?.name : undefined))
                  : (callerAgentId ? agents.find(a => a.id === callerAgentId)?.name : meta?.agentName);
                addStep({
                  type: stepType,
                  title,
                  subtitle: subtitle || undefined,
                  status: 'running',
                  agentId: subjectId,
                  agentName: subjectName,
                });
              },
              onToolCallEnd: (_toolName, _args, result, duration, _callerAgentId, _meta) => {
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
              onLoopProgress: (current, max) => {
                // 找最近一个 loop_progress 步骤更新（避免重复创建）
                const idx = steps.findIndex(s => s.id.startsWith('loop-progress-'));
                const displayNum = current + 1; // 1-based
                const id = `loop-progress-${current}`;
                if (idx >= 0 && steps[idx].id === id) {
                  // 同一轮重复触发（流式 token 也可能触发）→ 跳过
                  return;
                }
                addStep({
                  type: 'info',
                  title: `循环 ${displayNum}/${max}`,
                  subtitle: current >= max - 3 ? '⚠️ 接近上限' : 'ReAct 推理中',
                  status: current >= max - 1 ? 'running' : 'done',
                });
              },
              onCompaction: (status) => {
                addStep({
                  type: 'info',
                  title:
                    status === 'judging' ? '📦 上下文压缩 · 判断中' :
                    status === 'compressing' ? '📦 上下文压缩 · LLM 总结中' :
                    '📦 上下文压缩 · 已应用',
                  subtitle: status === 'judging' ? '检查 token 数是否超阈值' :
                            status === 'compressing' ? '让 LLM 把早期对话压缩成摘要' :
                            '替换 conversation，原文已收贴到 shared context',
                  status: status === 'applied' ? 'done' : 'running',
                });
              },
              onCompactionApplied: (stats) => {
                addStep({
                  type: 'info',
                  title: `🗜 已压缩 ${stats.compressedCount} 条消息`,
                  subtitle: `${stats.beforeTokens} → ${stats.afterTokens} tokens · 节省 ${Math.round((1 - stats.afterTokens / Math.max(1, stats.beforeTokens)) * 100)}%`,
                  content: stats.summary,
                  status: 'done',
                });
              },
              onDiffRequest: (pending, resolve) => {
                // 弹 diff 确认弹窗
                // 把 resolve 函数绑在 pendingWrite 上，handleConfirmDiff/Cancel 调它
                setPendingWrite({ ...pending, resolve });
                addStep({
                  type: 'info',
                  title: `⏸ 等待用户确认 ${pending.toolName === 'write_file' ? '写入' : '编辑'} ${pending.path}`,
                  subtitle: 'Agent 已暂停，请在 UI 弹窗中确认或取消',
                  status: 'running',
                });
              },
            },
            getToolServerUrl(),
            mcpServers.filter(s => s.enabled),
            mcpTools,
            currentAgent,
            agents,
            models,
            currentSessionId || undefined,
            0,              // depth
            sharedContext,  // 共享上下文
          );

          // 流式完成
          sharedContext.setStatus(currentAgent.id, 'done');
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
          sharedContext.setStatus(currentAgent.id, 'error');
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
          for await (const token of streamCompletion(effectiveConfig, userPromptMessages, 16384)) {
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
  }, [input, loading, skills, apiConfig, models, messages, currentSessionId, sessions, addMessage, currentAgent, mcpServers, mcpTools, fileMode, memories]);

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

  // ⚠️ 切换本地 bash 开关
  const handleSetLocalBash = useCallback((enabled: boolean) => {
    if (enabled) {
      const ok = confirm(
        '⚠️ 启用本地 bash 工具（高危）\n\n' +
        '启用后，AI Agent 可以在 server.mjs 所在机器上执行任意 shell 命令，' +
        '包括但不限于：\n' +
        '  • 删除/修改任意文件（包括你的项目外）\n' +
        '  • 安装软件、修改系统配置\n' +
        '  • 访问网络（curl/wget/外发数据）\n' +
        '  • 启动后台进程\n\n' +
        '文件系统的"沙箱"（你授权的目录）将被绕过。\n\n' +
        '确定要启用吗？'
      );
      if (!ok) return;
    }
    setLocalBashEnabledState(enabled);
    saveLocalBashEnabled(enabled);
  }, []);

  // 切换 diff 确认开关
  const handleSetDiffConfirm = useCallback((enabled: boolean) => {
    setDiffConfirmEnabledState(enabled);
    saveDiffConfirmSetting(enabled);
  }, []);

  // ===== Diff 确认：只调 resolve，真实写文件由 agent-loop 负责（保持 LLM 视角完整） =====
  const handleConfirmDiff = useCallback(() => {
    if (!pendingWrite) return;
    const pw = pendingWrite;
    setPendingWrite(null);
    // 不 setLoading(false) —— agent-loop 继续跑下一轮时 loading 仍为 true
    pw.resolve?.('confirm');
  }, [pendingWrite]);

  const handleCancelDiff = useCallback(() => {
    if (!pendingWrite) return;
    const pw = pendingWrite;
    setPendingWrite(null);
    // 不 setLoading(false) —— agent-loop 继续跑下一轮
    pw.resolve?.('cancel');
  }, [pendingWrite]);


  // ===== 记忆系统：⭐ 收藏入口 =====
  const handleSaveAsMemory = useCallback((msg: Message) => {
    // 默认：当前 Agent 的 agent 分类；标题取 message 标题或前 30 字
    const defaultCategory: MemoryCategory = currentAgent?.id ? 'agent' : 'user';
    const defaultScope = currentAgent?.id || 'user';
    const textContent = (msg.type === 'text' ? msg.text : msg.content) || '';
    const defaultTitle = (msg.title && msg.title !== '新对话' ? msg.title : textContent.slice(0, 30).replace(/\n/g, ' ').trim()) || '未命名';
    setStarPrompt({
      msg,
      category: defaultCategory,
      scopeKey: defaultScope,
      title: defaultTitle,
      tags: '',
    });
  }, [currentAgent]);

  const handleConfirmStar = useCallback(() => {
    if (!starPrompt) return;
    const { msg, category, scopeKey, title, tags } = starPrompt;
    const text = (msg.type === 'text' ? msg.text : msg.content) || '';
    if (!title.trim() || !text.trim()) {
      alert('标题和内容不能为空');
      return;
    }
    let finalScope = scopeKey.trim();
    if (category === 'soul') finalScope = 'soul';
    else if (category === 'user') finalScope = 'user';
    else if (category === 'agent' && !finalScope) finalScope = currentAgent?.id || 'default';
    if (category === 'memory' && !finalScope) {
      alert('项目记忆必须填写 project 名');
      return;
    }
    const { list, entry } = createMemory(memoriesRef.current, {
      category,
      scopeKey: finalScope,
      title: title.trim(),
      content: text,
      tags: tags.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean),
      source: {
        sessionId: currentSessionId || undefined,
        agentId: msg.agentId || currentAgent?.id,
        messageId: msg.id,
      },
    });
    setMemoriesState(list);
    // 轻量提示
    setStarPrompt(null);
    // eslint-disable-next-line no-console
    console.log('[memory] 已保存:', entry);
  }, [starPrompt, currentAgent, currentSessionId]);

  // 记忆 Modal CRUD 包装
  const handleMemoryUpdate = useCallback((id: string, patch: Partial<Pick<MemoryEntry, 'title' | 'content' | 'tags' | 'scopeKey' | 'category'>>) => {
    const list = updateMemory(memoriesRef.current, id, patch);
    setMemoriesState(list);
  }, []);

  const handleMemoryDelete = useCallback((id: string) => {
    const list = deleteMemoryById(memoriesRef.current, id);
    setMemoriesState(list);
  }, []);

  const handleMemoryCreate = useCallback((input: { category: MemoryCategory; scopeKey: string; title: string; content: string; tags?: string[]; }) => {
    const { list } = createMemory(memoriesRef.current, input);
    setMemoriesState(list);
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
        memories={memories}
        onClose={() => setSidebarOpen(false)}
        onAction={handleAction}
        onSwitchSession={switchSession}
        onDeleteSession={handleDeleteSession}
        onOpenMemory={() => setShowMemoryModal(true)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-3 pt-3 pb-2.5 sm:px-4 sm:pt-4 sm:pb-3 bg-white/80 backdrop-blur-lg border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-stone-100 transition flex-shrink-0"
              >
                <iconify-icon icon="ph:list" style={{ fontSize: '18px', color: '#44403c' }}></iconify-icon>
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-[15px] sm:text-base font-bold text-stone-900 truncate">
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
                <p className="text-[10px] text-stone-400 truncate">
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
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {/* 文件 I/O 模式切换（云端/本地/测试/纯对话 四选一） */}
              <div className="relative" data-file-mode-menu>
                <button
                  onClick={() => setFileModeMenuOpen(v => !v)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition ${
                    fileMode === 'local'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : fileMode === 'test'
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : fileMode === 'none'
                      ? 'bg-stone-100 border-stone-300 text-stone-600'
                      : 'bg-blue-50 border-blue-200 text-blue-700'
                  }`}
                  title={
                    fileMode === 'cloud'
                      ? '当前：云端沙箱（Daytona）· 点击切换文件 I/O 模式'
                      : fileMode === 'local'
                      ? `当前：本地目录「${localDirName || '未选择'}」· 点击切换文件 I/O 模式`
                      : fileMode === 'test'
                      ? `当前：测试模式 · 工作空间 ${testWorkspace || ''} · 点击切换文件 I/O 模式`
                      : '当前：纯对话模式（无后端）· 仅 LLM 文本对话'
                  }
                >
                  <iconify-icon
                    icon={
                      fileMode === 'local' ? 'ph:folder-open'
                      : fileMode === 'test' ? 'ph:flask'
                      : fileMode === 'none' ? 'ph:chat-circle-dots'
                      : 'ph:cloud-arrow-down'
                    }
                    style={{ fontSize: '12px' }}
                  ></iconify-icon>
                  <span className="hidden sm:inline text-[10px] font-bold">
                    {fileMode === 'local' ? '本地' : fileMode === 'test' ? '测试' : fileMode === 'none' ? '对话' : '云端'}
                  </span>
                  {fileMode === 'cloud' && (
                    <SandboxDot onOpenSettings={() => setShowSettings(true)} />
                  )}
                  {/* ⚠️ 本地模式 + 本地 bash 已启用：红点警示 */}
                  {fileMode === 'local' && localBashEnabled && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"
                      title="⚠️ 本地 bash 已启用（无沙箱）"
                    ></span>
                  )}
                  {/* 后端可达性小红点（cloud/test 模式时） */}
                  {(fileMode === 'cloud' || fileMode === 'test') && serverReachable === false && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="后端不可达"></span>
                  )}
                  <iconify-icon
                    icon="ph:caret-down"
                    style={{ fontSize: '9px' }}
                    className="opacity-60"
                  ></iconify-icon>
                </button>
                {fileModeMenuOpen && (
                  <>
                    {/* 移动端：全屏 backdrop 保证 dropdown 可见 */}
                    {isMobile && (
                      <div
                        className="fixed inset-0 bg-black/30 z-40"
                        onClick={() => setFileModeMenuOpen(false)}
                      ></div>
                    )}
                    <div
                      className={`absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-50 min-w-[240px] overflow-hidden ${
                        isMobile ? 'fixed right-3 top-14 left-3 min-w-0' : ''
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-3 py-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-wider bg-stone-50 flex items-center justify-between">
                        <span>文件 I/O 模式</span>
                        {serverReachable === false && (
                          <span className="text-[9px] text-red-500 normal-case font-medium">⚠ 后端未连接</span>
                        )}
                        {serverReachable === true && (
                          <span className="text-[9px] text-emerald-600 normal-case font-medium">● 后端在线</span>
                        )}
                      </div>
                      {/* 云端选项 */}
                      <ModeMenuItem
                        icon="ph:cloud-arrow-down"
                        iconColor="#2563eb"
                        title="云端沙箱"
                        subtitle={serverReachable === false ? '需 server.mjs' : 'Daytona 隔离沙箱'}
                        active={fileMode === 'cloud'}
                        disabled={serverReachable === false}
                        onClick={() => handleSetFileMode('cloud')}
                      />
                      {/* 本地选项 */}
                      <ModeMenuItem
                        icon="ph:folder-open"
                        iconColor="#059669"
                        title="本地目录"
                        subtitle={
                          !isFsAccessSupported()
                            ? '当前浏览器不支持 FS Access API'
                            : localDirName
                            ? `当前：${localDirName}`
                            : '需授权浏览器访问本地文件'
                        }
                        active={fileMode === 'local'}
                        disabled={!isFsAccessSupported()}
                        onClick={() => handleSetFileMode('local')}
                      />
                      {/* 测试选项 */}
                      <ModeMenuItem
                        icon="ph:flask"
                        iconColor="#d97706"
                        title="测试模式"
                        subtitle={
                          serverReachable === false
                            ? '需 server.mjs'
                            : testWorkspace
                            ? `workspace: ${testWorkspace.split('/').slice(-2).join('/')}`
                            : '读取 server 本机文件'
                        }
                        active={fileMode === 'test'}
                        disabled={serverReachable === false}
                        onClick={() => handleSetFileMode('test')}
                      />
                      {/* 纯对话选项 */}
                      <ModeMenuItem
                        icon="ph:chat-circle-dots"
                        iconColor="#78716c"
                        title="纯对话"
                        subtitle="不暴露文件工具（适用于 Netlify / 移动端）"
                        active={fileMode === 'none'}
                        onClick={() => handleSetFileMode('none')}
                      />
                    </div>
                  </>
                )}
              </div>
              {/* 模型选择器 - 移动端只显示图标 */}
              {defaultModel && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 hover:bg-stone-100 transition"
                  title={`当前模型: ${defaultModel.name}`}
                >
                  <iconify-icon icon={defaultModel.icon} style={{ fontSize: '12px', color: defaultModel.color }}></iconify-icon>
                  <span className="hidden sm:inline text-[10px] font-semibold text-stone-600 max-w-[60px] truncate">{defaultModel.name}</span>
                </button>
              )}
              {/* Agent 选择器 */}
              <button
                onClick={() => setShowAgentModal(true)}
                className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 hover:bg-stone-100 transition"
                title="切换 Agent"
              >
                <iconify-icon icon={currentAgent?.icon || 'ph:bot'} style={{ fontSize: '14px', color: currentAgent?.color || '#78716c' }}></iconify-icon>
                <span className="hidden sm:inline text-[11px] font-semibold text-stone-700 max-w-[80px] truncate">{currentAgent?.name || 'Agent'}</span>
                {currentAgent?.useTools && (
                  <span className="hidden sm:inline px-1 py-0 rounded text-[8px] font-bold bg-blue-50 text-blue-500">工具</span>
                )}
                {currentAgent?.delegateToAgents && (
                  <span className="hidden sm:inline px-1 py-0 rounded text-[8px] font-bold bg-amber-50 text-amber-600">协作</span>
                )}
                <iconify-icon icon="ph:caret-down" className="hidden sm:inline" style={{ fontSize: '10px', color: '#a8a29e' }}></iconify-icon>
              </button>
              {/* MCP - 移动端只显示数字 */}
              <button
                onClick={() => setShowMcpModal(true)}
                className={`px-2 py-1 rounded-md text-[9px] font-bold transition flex items-center gap-0.5 ${
                  mcpTools.length > 0
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-stone-100 text-stone-400'
                }`}
                title="MCP 服务器配置"
              >
                <iconify-icon icon="ph:plug" style={{ fontSize: '10px' }}></iconify-icon>
                <span className="hidden sm:inline">MCP</span>
                {mcpTools.length > 0 && <span>{mcpTools.length}</span>}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-stone-50 flex items-center justify-center active:bg-stone-100 transition flex-shrink-0"
              >
                <iconify-icon icon="ph:gear" style={{ fontSize: '18px', color: '#78716c' }}></iconify-icon>
              </button>
            </div>
          </div>
        </div>

        {activeView === 'chat' && (
          <>
            {/* TodoList + 生成 Agent 状态栏（仅在 chat 视图且有内容时展示） */}
            {(todos.length > 0 || sessionGeneratedAgents.length > 0) && (
              <div className="px-3 pt-2 sm:px-4 flex-shrink-0 space-y-2">
                {todos.length > 0 && (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <iconify-icon icon="ph:check-square" style={{ fontSize: '12px', color: '#b45309' }}></iconify-icon>
                      <span className="text-[10px] font-bold text-amber-700">任务计划</span>
                      <span className="text-[10px] text-amber-500 font-mono">
                        {todos.filter(t => t.status === 'completed').length}/{todos.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {todos.map((t) => (
                        <div key={t.id} className="flex items-center gap-1.5 text-[11px]">
                          {t.status === 'completed' ? (
                            <iconify-icon icon="ph:check-circle-fill" style={{ fontSize: '12px', color: '#059669' }}></iconify-icon>
                          ) : t.status === 'in_progress' ? (
                            <iconify-icon icon="ph:spinner" style={{ fontSize: '12px', color: '#ea580c' }} className="animate-spin"></iconify-icon>
                          ) : (
                            <iconify-icon icon="ph:circle" style={{ fontSize: '12px', color: '#a8a29e' }}></iconify-icon>
                          )}
                          <span className={
                            t.status === 'completed' ? 'text-stone-400 line-through truncate' :
                            t.status === 'in_progress' ? 'text-amber-700 font-semibold truncate' :
                            'text-stone-500 truncate'
                          }>
                            {t.status === 'in_progress' ? t.activeForm : t.content}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {sessionGeneratedAgents.length > 0 && (
                  <div className="bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 border border-violet-200/70 rounded-xl p-2.5 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                          <iconify-icon icon="ph:magic-wand" className="animate-pulse" style={{ fontSize: '11px', color: 'white' }}></iconify-icon>
                        </div>
                        <span className="text-[11px] font-bold text-violet-700">AI 动态生成 Agent</span>
                        <span className="text-[10px] text-violet-500 font-mono">×{sessionGeneratedAgents.length}</span>
                      </div>
                      <span className="text-[9px] text-violet-400 px-1.5 py-0.5 rounded-full bg-white/60 border border-violet-200/50">
                        临时 · session 结束清理
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {sessionGeneratedAgents.map((g) => (
                        <div
                          key={g.id}
                          className="flex items-center gap-2 px-2 py-1.5 bg-white/80 border border-violet-100/60 rounded-lg hover:bg-white transition"
                          title={`${g.description}\n${g.systemPrompt.slice(0, 150)}...`}
                        >
                          <div
                            className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: g.color + '1a' }}
                          >
                            <iconify-icon icon={g.icon} style={{ fontSize: '14px', color: g.color }}></iconify-icon>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold text-stone-800 truncate" style={{ color: g.color }}>
                              {g.name}
                            </div>
                            <div className="text-[9px] text-stone-500 truncate">
                              {g.description}
                            </div>
                          </div>
                          <span className="text-[9px] text-stone-400 font-mono flex-shrink-0">
                            {(g.tools || []).length} 工具
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <ChatView
              messages={messages}
              input={input}
              loading={loading}
              defaultModel={defaultModel}
              models={models}
              defaultModelId={defaultModelId}
              onChangeModel={(id) => {
                setDefaultModelId(id);
                saveDefaultModelId(id);
              }}
              onChangeReasoningEffort={(effort) => {
                // 用 defaultModelId 直接定位，避免闭包过期
                const targetId = defaultModelId;
                if (!targetId) return;
                const updated = models.map(m => m.id === targetId ? { ...m, reasoningEffort: effort } : m);
                setModels(updated);
                saveModels(updated);
              }}
              contextUsed={currentTokens}
              contextLimit={contextLimit}
              onOpenContextSettings={() => setShowSettings(true)}
              currentAgent={currentAgent}
              fileMode={fileMode}
              localDirName={localDirName}
              testWorkspace={testWorkspace}
              onInputChange={setInput}
              onSend={sendMessage}
              onToggleExpand={toggleTaskExpand}
              onSaveAsMemory={handleSaveAsMemory}
              localBashEnabled={localBashEnabled}
              onOpenSettings={() => setShowSettings(true)}
              onPickLocalDir={async () => {
                if (!isFsAccessSupported()) {
                  alert('当前浏览器不支持 File System Access API。\n请使用 Chrome/Edge 86+ 并在 localhost 或 HTTPS 下打开。');
                  return false;
                }
                try {
                  await pickLocalDirectory();
                  setLocalDirName(getSavedLocalDirName());
                  return true;
                } catch {
                  return false;
                }
              }}
            />
          </>
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
        {activeView === 'artifacts' && <ArtifactsView artifacts={artifacts} serverUrl={getToolServerUrl()} />}
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
          contextLimit={contextLimit}
          onContextLimitChange={handleSetContextLimit}
          suggestedLimit={suggestedLimit.limit}
          suggestedLimitLabel={suggestedLimit.label}
          localBashEnabled={localBashEnabled}
          onLocalBashChange={handleSetLocalBash}
          diffConfirmEnabled={diffConfirmEnabled}
          onDiffConfirmChange={handleSetDiffConfirm}
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

      {/* ===== 记忆系统弹窗 ===== */}
      {showMemoryModal && (
        <MemoryModal
          open={showMemoryModal}
          memories={memories}
          agents={agents}
          onClose={() => setShowMemoryModal(false)}
          onUpdate={handleMemoryUpdate}
          onDelete={handleMemoryDelete}
          onCreate={handleMemoryCreate}
        />
      )}

      {/* ===== Diff 确认弹窗 ===== */}
      <DiffConfirmModal
        open={pendingWrite !== null}
        pending={pendingWrite}
        onConfirm={handleConfirmDiff}
        onCancel={handleCancelDiff}
      />

      {/* ⭐ 收藏：选分类 + 标题 + 标签 */}
      {starPrompt && (
        <div className="fixed inset-0 z-[60] bg-black/40 anim-fade flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <iconify-icon icon="ph:star" style={{ fontSize: '16px', color: '#f59e0b' }}></iconify-icon>
                <span className="text-[13px] font-bold text-stone-900">存为记忆</span>
              </div>
              <button onClick={() => setStarPrompt(null)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-stone-100">
                <iconify-icon icon="ph:x" style={{ fontSize: '14px', color: '#78716c' }}></iconify-icon>
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">分类</label>
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {(['user', 'agent', 'memory', 'soul'] as MemoryCategory[]).map((c) => {
                    const cfg = {
                      user:   { label: '用户',   icon: 'ph:user-circle',   color: '#3b82f6' },
                      agent:  { label: 'Agent',  icon: 'ph:robot',         color: '#8b5cf6' },
                      memory: { label: '项目',   icon: 'ph:folder-simple', color: '#10b981' },
                      soul:   { label: '灵魂',   icon: 'ph:sparkle',       color: '#f59e0b' },
                    }[c];
                    const active = starPrompt.category === c;
                    return (
                      <button
                        key={c}
                        onClick={() => setStarPrompt(sp => sp ? {
                          ...sp,
                          category: c,
                          scopeKey: c === 'soul' ? 'soul' : c === 'user' ? 'user' : c === 'agent' ? (currentAgent?.id || 'default') : '',
                        } : sp)}
                        className={`flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-semibold transition ${
                          active ? 'text-white' : 'text-stone-600 bg-stone-50 hover:bg-stone-100'
                        }`}
                        style={active ? { backgroundColor: cfg.color } : {}}
                      >
                        <iconify-icon icon={cfg.icon} style={{ fontSize: '14px', color: active ? '#fff' : cfg.color }}></iconify-icon>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {starPrompt.category === 'agent' && (
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">关联 Agent</label>
                  <select
                    value={starPrompt.scopeKey}
                    onChange={(e) => setStarPrompt(sp => sp ? { ...sp, scopeKey: e.target.value } : sp)}
                    className="mt-1 w-full px-2.5 py-1.5 text-[12px] bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400"
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {starPrompt.category === 'memory' && (
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">项目名（project）</label>
                  <input
                    value={starPrompt.scopeKey}
                    onChange={(e) => setStarPrompt(sp => sp ? { ...sp, scopeKey: e.target.value } : sp)}
                    placeholder="如 mvp-v0.1"
                    className="mt-1 w-full px-2.5 py-1.5 text-[12px] bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">标题</label>
                <input
                  value={starPrompt.title}
                  onChange={(e) => setStarPrompt(sp => sp ? { ...sp, title: e.target.value } : sp)}
                  className="mt-1 w-full px-3 py-2 text-[13px] font-semibold bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">标签（可选，逗号分隔）</label>
                <input
                  value={starPrompt.tags}
                  onChange={(e) => setStarPrompt(sp => sp ? { ...sp, tags: e.target.value } : sp)}
                  placeholder="如 偏好, 重要决策"
                  className="mt-1 w-full px-2.5 py-1.5 text-[12px] bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400"
                />
              </div>

              <div className="bg-stone-50 rounded-lg p-2 text-[11px] text-stone-500 line-clamp-3 max-h-20 overflow-y-auto">
                {((starPrompt.msg.type === 'text' ? starPrompt.msg.text : starPrompt.msg.content) || '').slice(0, 400)}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-stone-100 bg-stone-50/50">
              <button
                onClick={() => setStarPrompt(null)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-stone-600 hover:bg-stone-100 transition"
              >
                取消
              </button>
              <button
                onClick={handleConfirmStar}
                className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white bg-stone-900 hover:bg-stone-800 transition flex items-center gap-1"
              >
                <iconify-icon icon="ph:star-fill" style={{ fontSize: '12px', color: '#fbbf24' }}></iconify-icon>
                保存记忆
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}