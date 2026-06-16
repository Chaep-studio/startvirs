import { useState, useMemo, useEffect } from 'react';
import type { MemoryEntry, MemoryCategory, AgentConfig } from '../types';
import { filterMemories } from '../agent/memory';
import Markdown from './Markdown';

interface Props {
  open: boolean;
  /** 当前所有记忆 */
  memories: MemoryEntry[];
  /** 当前所有 Agent（编辑/新建 agent 分类时选 scopeKey） */
  agents: AgentConfig[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Pick<MemoryEntry, 'title' | 'content' | 'tags' | 'scopeKey' | 'category'>>) => void;
  onDelete: (id: string) => void;
  onCreate: (input: {
    category: MemoryCategory;
    scopeKey: string;
    title: string;
    content: string;
    tags?: string[];
  }) => void;
}

const TABS: { id: MemoryCategory | 'all'; label: string; icon: string; color: string }[] = [
  { id: 'all',    label: '全部', icon: 'ph:books',           color: '#78716c' },
  { id: 'soul',   label: '灵魂', icon: 'ph:sparkle',         color: '#f59e0b' },
  { id: 'user',   label: '用户', icon: 'ph:user-circle',     color: '#3b82f6' },
  { id: 'agent',  label: 'Agent', icon: 'ph:robot',         color: '#8b5cf6' },
  { id: 'memory', label: '项目', icon: 'ph:folder-simple',   color: '#10b981' },
];

type EditState =
  | { mode: 'view' }
  | { mode: 'edit'; entry: MemoryEntry }
  | { mode: 'new'; category: MemoryCategory; scopeKey: string };

export default function MemoryModal({
  open,
  memories,
  agents,
  onClose,
  onUpdate,
  onDelete,
  onCreate,
}: Props) {
  const [tab, setTab] = useState<MemoryCategory | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ mode: 'view' });

  // 切 tab 时清空选择 & 编辑状态
  useEffect(() => {
    setSelectedId(null);
    setEdit({ mode: 'view' });
  }, [tab, open]);

  // 当前 tab 下的列表
  const list = useMemo(() => {
    return filterMemories(memories, {
      category: tab,
      keyword: keyword.trim() || undefined,
      limit: 100,
    });
  }, [memories, tab, keyword]);

  const selected = useMemo(
    () => (selectedId ? memories.find((m) => m.id === selectedId) : null),
    [memories, selectedId]
  );

  // 各 tab 计数
  const counts = useMemo(() => {
    const c = { all: memories.length, soul: 0, user: 0, agent: 0, memory: 0 };
    for (const m of memories) c[m.category]++;
    return c;
  }, [memories]);

  if (!open) return null;

  // ---------- 操作处理 ----------
  const handleStartNew = (category: MemoryCategory) => {
    const defaultScope =
      category === 'soul' ? 'soul' :
      category === 'user' ? 'user' :
      category === 'agent' ? (agents[0]?.id || 'default') :
      '';
    setEdit({ mode: 'new', category, scopeKey: defaultScope });
    setSelectedId(null);
  };

  const handleSaveEdit = (payload: { title: string; content: string; tags: string[]; scopeKey: string; category: MemoryCategory }) => {
    if (edit.mode === 'edit') {
      onUpdate(edit.entry.id, payload);
      setEdit({ mode: 'view' });
    } else if (edit.mode === 'new') {
      onCreate(payload);
      setEdit({ mode: 'view' });
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('确定删除这条记忆？此操作不可恢复。')) return;
    onDelete(id);
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 anim-fade flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* 顶部标题 + tab */}
        <div className="flex-shrink-0 border-b border-stone-100">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2">
              <iconify-icon icon="ph:books" style={{ fontSize: '18px', color: '#44403c' }}></iconify-icon>
              <h2 className="text-[15px] font-bold text-stone-900">记忆库</h2>
              <span className="text-[10px] text-stone-400 font-mono">{memories.length} 条</span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-stone-100 transition"
            >
              <iconify-icon icon="ph:x" style={{ fontSize: '16px', color: '#78716c' }}></iconify-icon>
            </button>
          </div>
          <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition whitespace-nowrap ${
                    active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <iconify-icon icon={t.icon} style={{ fontSize: '13px', color: active ? '#fff' : t.color }}></iconify-icon>
                  <span>{t.label}</span>
                  <span className={`text-[10px] font-mono px-1 rounded ${active ? 'bg-white/20' : 'bg-stone-100 text-stone-500'}`}>
                    {counts[t.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 主体：左列表 + 右预览/编辑 */}
        <div className="flex-1 flex min-h-0">
          {/* 左：搜索 + 列表 + 新建 */}
          <div className="w-72 flex-shrink-0 border-r border-stone-100 flex flex-col">
            <div className="p-3 border-b border-stone-100 space-y-2">
              <div className="relative">
                <iconify-icon icon="ph:magnifying-glass" style={{ fontSize: '14px', color: '#a8a29e', position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}></iconify-icon>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索 title/content/tags"
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400"
                />
              </div>
              <button
                onClick={() => handleStartNew(tab === 'all' ? 'user' : tab)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-semibold text-white bg-stone-900 rounded-lg hover:bg-stone-800 transition"
              >
                <iconify-icon icon="ph:plus" style={{ fontSize: '13px' }}></iconify-icon>
                <span>新建{ TABS.find(t => t.id === (tab === 'all' ? 'user' : tab))?.label }记忆</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {list.length === 0 ? (
                <div className="px-3 py-8 text-center text-[11px] text-stone-400">
                  {keyword ? '没找到匹配的记忆' : '当前分类下还没有记忆'}
                </div>
              ) : (
                <div className="divide-y divide-stone-50">
                  {list.map((m) => {
                    const tabInfo = TABS.find(t => t.id === m.category)!;
                    const isSelected = selectedId === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setSelectedId(m.id); setEdit({ mode: 'view' }); }}
                        className={`w-full text-left px-3 py-2.5 transition ${
                          isSelected ? 'bg-stone-100' : 'hover:bg-stone-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <iconify-icon icon={tabInfo.icon} style={{ fontSize: '11px', color: tabInfo.color }}></iconify-icon>
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: tabInfo.color }}>
                            {tabInfo.label}{m.category === 'memory' ? ` / ${m.scopeKey}` : (m.category === 'agent' ? ` / ${m.scopeKey}` : '')}
                          </span>
                        </div>
                        <div className={`text-[12px] font-semibold truncate ${isSelected ? 'text-stone-900' : 'text-stone-700'}`}>
                          {m.title}
                        </div>
                        <div className="text-[10px] text-stone-400 mt-0.5 line-clamp-2">
                          {m.content.slice(0, 80)}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[9px] text-stone-300 font-mono">
                            {new Date(m.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {m.tags.length > 0 && (
                            <span className="text-[9px] text-stone-400">#{m.tags[0]}{m.tags.length > 1 ? ` +${m.tags.length - 1}` : ''}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 右：预览/编辑/新建 */}
          <div className="flex-1 flex flex-col min-w-0">
            {edit.mode === 'edit' || edit.mode === 'new' ? (
              <MemoryEditor
                mode={edit.mode}
                entry={edit.mode === 'edit' ? edit.entry : null}
                defaultCategory={edit.mode === 'new' ? edit.category : undefined}
                defaultScopeKey={edit.mode === 'new' ? edit.scopeKey : undefined}
                agents={agents}
                onCancel={() => setEdit({ mode: 'view' })}
                onSave={handleSaveEdit}
              />
            ) : selected ? (
              <MemoryViewer
                entry={selected}
                onEdit={() => setEdit({ mode: 'edit', entry: selected })}
                onDelete={() => handleDelete(selected.id)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-stone-400 p-8">
                <iconify-icon icon="ph:books" style={{ fontSize: '48px', color: '#d6d3d1' }}></iconify-icon>
                <p className="text-[13px] mt-3">从左侧选一条记忆查看</p>
                <p className="text-[11px] mt-1 text-stone-300">或点「新建」手动添加</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Viewer（查看模式）
// =====================================================

function MemoryViewer({
  entry,
  onEdit,
  onDelete,
}: {
  entry: MemoryEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tabInfo = TABS.find(t => t.id === entry.category)!;
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 px-5 py-3 border-b border-stone-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <iconify-icon icon={tabInfo.icon} style={{ fontSize: '14px', color: tabInfo.color }}></iconify-icon>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tabInfo.color }}>
            {tabInfo.label}{entry.category === 'memory' ? ` / ${entry.scopeKey}` : (entry.category === 'agent' ? ` / ${entry.scopeKey}` : '')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition"
          >
            <iconify-icon icon="ph:pencil-simple" style={{ fontSize: '12px' }}></iconify-icon>
            编辑
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 transition"
          >
            <iconify-icon icon="ph:trash" style={{ fontSize: '12px' }}></iconify-icon>
            删除
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <h1 className="text-[18px] font-bold text-stone-900 mb-2">{entry.title}</h1>
        <div className="flex items-center gap-3 text-[10px] text-stone-400 mb-4">
          <span>创建：{new Date(entry.createdAt).toLocaleString('zh-CN')}</span>
          <span>更新：{new Date(entry.updatedAt).toLocaleString('zh-CN')}</span>
        </div>
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {entry.tags.map((t) => (
              <span key={t} className="px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-600 rounded-full">
                #{t}
              </span>
            ))}
          </div>
        )}
        <div className="bg-stone-50 rounded-xl p-4">
          <Markdown content={entry.content} />
        </div>
        {entry.source && (
          <div className="mt-4 text-[10px] text-stone-400">
            来源：{entry.source.agentId ? `Agent ${entry.source.agentId}` : ''}{entry.source.sessionId ? ` · session ${entry.source.sessionId.slice(0, 8)}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// Editor（编辑/新建模式）
// =====================================================

function MemoryEditor({
  mode,
  entry,
  defaultCategory,
  defaultScopeKey,
  agents,
  onCancel,
  onSave,
}: {
  mode: 'edit' | 'new';
  entry: MemoryEntry | null;
  defaultCategory?: MemoryCategory;
  defaultScopeKey?: string;
  agents: AgentConfig[];
  onCancel: () => void;
  onSave: (payload: { title: string; content: string; tags: string[]; scopeKey: string; category: MemoryCategory }) => void;
}) {
  const [category, setCategory] = useState<MemoryCategory>(entry?.category || defaultCategory || 'user');
  const [scopeKey, setScopeKey] = useState<string>(entry?.scopeKey || defaultScopeKey || 'user');
  const [title, setTitle] = useState<string>(entry?.title || '');
  const [content, setContent] = useState<string>(entry?.content || '');
  const [tagsText, setTagsText] = useState<string>((entry?.tags || []).join(', '));
  const [showPreview, setShowPreview] = useState(false);

  // 切换 category 时自动调整 scopeKey 默认值
  useEffect(() => {
    if (mode !== 'new') return;
    if (category === 'soul') setScopeKey('soul');
    else if (category === 'user') setScopeKey('user');
    else if (category === 'agent' && !agents.find(a => a.id === scopeKey)) {
      setScopeKey(agents[0]?.id || 'default');
    } else if (category === 'memory' && scopeKey === 'user') {
      setScopeKey('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) {
      alert('标题和内容不能为空');
      return;
    }
    if (category === 'memory' && !scopeKey.trim()) {
      alert('项目记忆必须填写 project 名称作为 scopeKey');
      return;
    }
    onSave({
      category,
      scopeKey: scopeKey.trim(),
      title: title.trim(),
      content,
      tags: tagsText.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean),
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 px-5 py-3 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <iconify-icon icon={mode === 'new' ? 'ph:plus-circle' : 'ph:pencil-simple'} style={{ fontSize: '16px', color: '#44403c' }}></iconify-icon>
          <span className="text-[13px] font-bold text-stone-900">{mode === 'new' ? '新建记忆' : '编辑记忆'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowPreview(v => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
              showPreview ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <iconify-icon icon={showPreview ? 'ph:pencil' : 'ph:eye'} style={{ fontSize: '12px' }}></iconify-icon>
            {showPreview ? '编辑' : '预览'}
          </button>
          <button
            onClick={onCancel}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1 rounded-lg text-[11px] font-bold text-white bg-stone-900 hover:bg-stone-800 transition"
          >
            保存
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {/* 分类 + scopeKey */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">分类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MemoryCategory)}
              className="mt-1 w-full px-2.5 py-1.5 text-[12px] bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400"
            >
              <option value="soul">灵魂（全局）</option>
              <option value="user">用户（关于你）</option>
              <option value="agent">Agent 经验</option>
              <option value="memory">项目记忆</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
              {category === 'agent' ? '关联 Agent' : category === 'memory' ? '项目名（project）' : 'scopeKey'}
            </label>
            {category === 'agent' ? (
              <select
                value={scopeKey}
                onChange={(e) => setScopeKey(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 text-[12px] bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            ) : (
              <input
                value={scopeKey}
                onChange={(e) => setScopeKey(e.target.value)}
                disabled={category === 'soul' || category === 'user'}
                placeholder={category === 'memory' ? '如 mvp-v0.1' : '自动'}
                className="mt-1 w-full px-2.5 py-1.5 text-[12px] bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400 disabled:bg-stone-50 disabled:text-stone-400"
              />
            )}
          </div>
        </div>

        {/* 标题 */}
        <div>
          <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="简短标题，便于列表展示"
            className="mt-1 w-full px-3 py-2 text-[14px] font-semibold bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400"
          />
        </div>

        {/* 内容（textarea / 预览） */}
        <div className="flex-1 flex flex-col min-h-0">
          <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">内容（Markdown）</label>
          {showPreview ? (
            <div className="mt-1 flex-1 min-h-[200px] max-h-[400px] overflow-y-auto p-3 bg-stone-50 border border-stone-200 rounded-lg">
              {content.trim() ? <Markdown content={content} /> : <span className="text-stone-300 text-[12px]">（暂无内容）</span>}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="支持完整 Markdown 语法…"
              className="mt-1 w-full min-h-[200px] max-h-[400px] px-3 py-2 text-[13px] font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400 resize-y"
            />
          )}
        </div>

        {/* 标签 */}
        <div>
          <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">标签（逗号分隔）</label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="如 偏好, TypeScript, 后端"
            className="mt-1 w-full px-2.5 py-1.5 text-[12px] bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-400"
          />
        </div>
      </div>
    </div>
  );
}
