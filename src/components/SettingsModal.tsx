import { useState } from 'react';
import type { ModelConfig } from '../types';
import { generateId } from '../utils';
import {
  loadSandboxConfig,
  saveSandboxConfig,
  testSandboxConnection,
  type SandboxConfig,
} from '../agent/sandbox-config';
import { setToolServerUrl } from '../agent/tools';

interface Props {
  models: ModelConfig[];
  defaultModelId: string;
  onModelsChange: (models: ModelConfig[]) => void;
  onDefaultChange: (id: string) => void;
  /** 上下文窗口上限（用户手动调） */
  contextLimit: number;
  onContextLimitChange: (limit: number) => void;
  /** 当前默认模型的建议上限 */
  suggestedLimit: number;
  suggestedLimitLabel: string;
  /** ⚠️ 本地 bash 开关 */
  localBashEnabled: boolean;
  onLocalBashChange: (enabled: boolean) => void;
  /** 写文件前 diff 确认开关 */
  diffConfirmEnabled: boolean;
  onDiffConfirmChange: (enabled: boolean) => void;
  onClose: () => void;
}

type Tab = 'models' | 'sandbox';

export default function SettingsModal({
  models,
  defaultModelId,
  onModelsChange,
  onDefaultChange,
  contextLimit,
  onContextLimitChange,
  suggestedLimit,
  suggestedLimitLabel,
  localBashEnabled,
  onLocalBashChange,
  diffConfirmEnabled,
  onDiffConfirmChange,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('models');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState<SandboxConfig>(() => loadSandboxConfig());
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const handleAdd = () => {
    const newModel: ModelConfig = {
      id: generateId(),
      name: '新模型',
      icon: 'ph:cube',
      color: '#6b7280',
      url: '',
      key: '',
      model: '',
      enabled: true,
    };
    onModelsChange([...models, newModel]);
    setEditingId(newModel.id);
  };

  const handleUpdate = (id: string, update: Partial<ModelConfig>) => {
    onModelsChange(models.map(m => (m.id === id ? { ...m, ...update } : m)));
  };

  const handleDelete = (id: string) => {
    onModelsChange(models.filter(m => m.id !== id));
    if (defaultModelId === id) {
      const first = models.find(m => m.id !== id && m.enabled);
      if (first) onDefaultChange(first.id);
    }
    if (editingId === id) setEditingId(null);
  };

  const handleSetDefault = (id: string) => {
    onDefaultChange(id);
    onModelsChange(models.map(m => ({ ...m, isDefault: m.id === id })));
  };

  const handleSandboxSave = (next: SandboxConfig) => {
    setSandbox(next);
    saveSandboxConfig(next);
    setToolServerUrl(next.url);
    window.dispatchEvent(new Event('sandbox-config-changed'));
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestMsg(null);
    setTestOk(null);
    const result = await testSandboxConnection(sandbox.url);
    setTesting(false);
    setTestOk(result.ok);
    setTestMsg(result.message);
    const next: SandboxConfig = {
      ...sandbox,
      lastTestedAt: Date.now(),
      lastTestOk: result.ok,
    };
    handleSandboxSave(next);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center anim-fade">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 anim-up max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-stone-900">设置</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">配置 AI 模型与沙箱</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-stone-100">
            <iconify-icon icon="ph:x" style={{ fontSize: '20px', color: '#78716c' }}></iconify-icon>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-stone-100 rounded-xl mb-4">
          <button
            onClick={() => setTab('models')}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition flex items-center justify-center gap-1.5 ${
              tab === 'models' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
            }`}
          >
            <iconify-icon icon="ph:cpu" style={{ fontSize: '14px' }}></iconify-icon>
            模型
          </button>
          <button
            onClick={() => setTab('sandbox')}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition flex items-center justify-center gap-1.5 ${
              tab === 'sandbox' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
            }`}
          >
            <iconify-icon icon="ph:cloud-arrow-down" style={{ fontSize: '14px' }}></iconify-icon>
            沙箱
            {sandbox.lastTestOk === false && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            )}
            {sandbox.lastTestOk === true && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            )}
          </button>
        </div>

        {tab === 'models' && (
          <>
            <div className="space-y-2 mb-4">
              {models.map((model) => (
                <div
                  key={model.id}
                  className={`rounded-xl p-3 border-2 cursor-pointer transition ${
                    defaultModelId === model.id
                      ? 'border-green-300 bg-green-50/50'
                      : 'border-stone-100 bg-stone-50 hover:border-stone-200'
                  } ${!model.enabled ? 'opacity-50' : ''}`}
                  onClick={() => handleSetDefault(model.id)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: model.color + '18' }}
                    >
                      <iconify-icon icon={model.icon} style={{ fontSize: '18px', color: model.color }}></iconify-icon>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-stone-800">{model.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-stone-100 text-stone-500">{model.model}</span>
                        {defaultModelId === model.id && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-50 text-green-600">默认</span>
                        )}
                        {!model.enabled && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-500">未启用</span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-400 truncate">{model.url || '未配置 URL'}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUpdate(model.id, { enabled: !model.enabled }); }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${model.enabled ? 'hover:bg-green-50' : 'hover:bg-red-50'}`}
                      >
                        <iconify-icon icon={model.enabled ? 'ph:power' : 'ph:power-off'} style={{ fontSize: '14px', color: model.enabled ? '#22c55e' : '#a8a29e' }}></iconify-icon>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(editingId === model.id ? null : model.id); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-stone-200/50 transition"
                      >
                        <iconify-icon icon="ph:pencil" style={{ fontSize: '14px', color: '#78716c' }}></iconify-icon>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(model.id); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-stone-400 hover:text-red-500 transition"
                      >
                        <iconify-icon icon="ph:trash" style={{ fontSize: '14px' }}></iconify-icon>
                      </button>
                    </div>
                  </div>

                  {/* 编辑面板 */}
                  {editingId === model.id && (
                    <div className="mt-3 pt-3 border-t border-stone-200 space-y-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-[10px] font-semibold text-stone-500 mb-1 block">名称</label>
                          <input
                            type="text"
                            value={model.name}
                            onChange={(e) => handleUpdate(model.id, { name: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                            placeholder="GPT-4o"
                          />
                        </div>
                        <div className="w-20">
                          <label className="text-[10px] font-semibold text-stone-500 mb-1 block">图标</label>
                          <input
                            type="text"
                            value={model.icon}
                            onChange={(e) => handleUpdate(model.id, { icon: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                            placeholder="ph:brain"
                          />
                        </div>
                        <div className="w-16">
                          <label className="text-[10px] font-semibold text-stone-500 mb-1 block">颜色</label>
                          <input
                            type="color"
                            value={model.color}
                            onChange={(e) => handleUpdate(model.id, { color: e.target.value })}
                            className="w-full h-[30px] rounded-lg border border-stone-200 cursor-pointer"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-stone-500 mb-1 block">API URL</label>
                        <input
                          type="text"
                          value={model.url}
                          onChange={(e) => handleUpdate(model.id, { url: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                          placeholder="https://api.openai.com/v1"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-stone-500 mb-1 block">API Key</label>
                        <input
                          type="password"
                          value={model.key}
                          onChange={(e) => handleUpdate(model.id, { key: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                          placeholder="sk-..."
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-stone-500 mb-1 block">模型 ID（传给 API 的值）</label>
                        <input
                          type="text"
                          value={model.model}
                          onChange={(e) => handleUpdate(model.id, { model: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                          placeholder="gpt-4o"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-stone-500 mb-1 block">
                          推理强度（reasoning_effort）
                          <span className="text-stone-400 font-normal ml-1">· 仅 o-series / gpt-5 / Claude 等支持</span>
                        </label>
                        <select
                          value={model.reasoningEffort || 'auto'}
                          onChange={(e) => handleUpdate(model.id, { reasoningEffort: e.target.value as ModelConfig['reasoningEffort'] })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 focus:outline-none focus:border-blue-300"
                        >
                          <option value="auto">auto（不传，让 API 决定）</option>
                          <option value="low">low · 少想，更快</option>
                          <option value="medium">medium · 默认</option>
                          <option value="high">high · 多想，适合复杂任务</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleAdd}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-stone-200 text-[12px] font-medium text-stone-400 hover:border-stone-300 hover:text-stone-500 transition flex items-center justify-center gap-1 mb-4"
            >
              <iconify-icon icon="ph:plus" style={{ fontSize: '14px' }}></iconify-icon>
              添加模型
            </button>

            {/* 上下文窗口设置 */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <iconify-icon icon="ph:circle-half" style={{ fontSize: '14px', color: '#2563eb' }}></iconify-icon>
                  <span className="text-[12px] font-bold text-blue-700">上下文窗口</span>
                </div>
                <span className="text-[10px] text-blue-500 font-mono">{(contextLimit / 1000).toFixed(0)}k tokens</span>
              </div>
              <p className="text-[10px] text-blue-600/80 mb-2">
                顶栏圆环按这个上限显示使用率。当前模型推荐：<span className="font-mono">{suggestedLimitLabel} · {(suggestedLimit / 1000).toFixed(0)}k</span>
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={8000}
                  max={2000000}
                  step={1000}
                  value={contextLimit}
                  onChange={(e) => onContextLimitChange(parseInt(e.target.value, 10))}
                  className="flex-1 accent-blue-500"
                />
                <input
                  type="number"
                  value={contextLimit}
                  onChange={(e) => onContextLimitChange(parseInt(e.target.value, 10) || 0)}
                  step={1000}
                  min={1000}
                  className="w-24 px-2 py-1 rounded-lg bg-white border border-blue-200 text-[11px] text-stone-700 focus:outline-none focus:border-blue-400 font-mono"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[8000, 32000, 64000, 128000, 200000, 1000000].map(v => (
                  <button
                    key={v}
                    onClick={() => onContextLimitChange(v)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition ${
                      contextLimit === v
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-blue-600 hover:bg-blue-100'
                    }`}
                  >
                    {(v / 1000).toFixed(0)}k
                  </button>
                ))}
                <button
                  onClick={() => onContextLimitChange(suggestedLimit)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white text-blue-600 hover:bg-blue-100 transition"
                  title={`按当前模型推荐：${suggestedLimitLabel} (${(suggestedLimit / 1000).toFixed(0)}k)`}
                >
                  推荐
                </button>
              </div>
            </div>

            {/* ⚠️ 高级：本地 bash 开关 */}
            <div className={`rounded-xl p-3 mb-4 border-2 ${localBashEnabled ? 'bg-red-50 border-red-300' : 'bg-stone-50 border-stone-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <iconify-icon icon="ph:terminal" style={{ fontSize: '14px', color: localBashEnabled ? '#dc2626' : '#78716c' }}></iconify-icon>
                  <span className={`text-[12px] font-bold ${localBashEnabled ? 'text-red-700' : 'text-stone-700'}`}>
                    允许本地 bash 工具 {localBashEnabled && '· 已启用'}
                  </span>
                </div>
                <button
                  onClick={() => onLocalBashChange(!localBashEnabled)}
                  className={`relative w-10 h-5 rounded-full transition ${localBashEnabled ? 'bg-red-500' : 'bg-stone-300'}`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition ${localBashEnabled ? 'left-5' : 'left-0.5'}`}
                  ></span>
                </button>
              </div>
              {localBashEnabled ? (
                <div className="text-[10px] text-red-700 leading-relaxed space-y-1">
                  <p className="font-bold">⚠️ 高危模式已开启</p>
                  <p>AI Agent 现在可以在 server.mjs 所在机器上执行<strong>任意</strong> shell 命令，无任何沙箱限制。</p>
                  <p>可能造成的损害：删除/修改任意文件 · 安装软件 · 访问网络 · 启动后台进程。</p>
                  <p>建议：仅在可信的小模型/调试时使用，完成后立即关闭。</p>
                </div>
              ) : (
                <p className="text-[10px] text-stone-500 leading-relaxed">
                  关闭时，AI 在"本地"模式下只能读写你授权目录里的文件，不能执行 shell 命令。
                  开启后会绕过目录沙箱，请谨慎使用。
                </p>
              )}
            </div>

            {/* Diff 确认开关 */}
            <div className={`rounded-xl p-3 mb-4 border-2 ${diffConfirmEnabled ? 'bg-blue-50 border-blue-300' : 'bg-stone-50 border-stone-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <iconify-icon icon="ph:git-diff" style={{ fontSize: '14px', color: diffConfirmEnabled ? '#2563eb' : '#78716c' }}></iconify-icon>
                  <span className={`text-[12px] font-bold ${diffConfirmEnabled ? 'text-blue-700' : 'text-stone-700'}`}>
                    写文件前显示 diff 确认 {diffConfirmEnabled && '· 已开启'}
                  </span>
                </div>
                <button
                  onClick={() => onDiffConfirmChange(!diffConfirmEnabled)}
                  className={`relative w-10 h-5 rounded-full transition ${diffConfirmEnabled ? 'bg-blue-500' : 'bg-stone-300'}`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition ${diffConfirmEnabled ? 'left-5' : 'left-0.5'}`}
                  ></span>
                </button>
              </div>
              <p className="text-[10px] text-stone-500 leading-relaxed">
                {diffConfirmEnabled
                  ? 'Agent 每次本轮第一次写文件时，弹窗展示行级 diff，等你点「确认写入」才落盘。后续同轮的写操作静默执行。'
                  : '关闭时 Agent 写文件是即时生效的，资深用户推荐。开启可避免 Agent 误改/误删。'}
              </p>
            </div>
          </>
        )}

        {tab === 'sandbox' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
              <iconify-icon icon="ph:info" style={{ fontSize: '16px', color: '#3b82f6', flexShrink: 0, marginTop: 2 }}></iconify-icon>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                云端沙箱模式下，AI 通过工具服务器（server.mjs）调用 Daytona 云端沙箱。服务器 URL 在此配置；
                <br />
                <code className="px-1 bg-white/60 rounded text-[10px]">DAYTONA_API_KEY</code> 需放在服务端的 <code className="px-1 bg-white/60 rounded text-[10px]">.env</code> 中。
              </p>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-stone-500 mb-1 block">工具服务器 URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sandbox.url}
                  onChange={(e) => {
                    const next = { ...sandbox, url: e.target.value };
                    setSandbox(next);
                  }}
                  onBlur={() => handleSandboxSave(sandbox)}
                  className="flex-1 px-2.5 py-2 rounded-lg bg-stone-50 border border-stone-200 text-[12px] text-stone-700 font-mono focus:outline-none focus:border-blue-300"
                  placeholder="http://localhost:3456"
                />
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-3 py-2 rounded-lg bg-stone-900 text-white text-[11px] font-semibold disabled:opacity-50 active:bg-stone-800 transition flex items-center gap-1"
                >
                  {testing ? (
                    <iconify-icon icon="ph:spinner" className="animate-spin" style={{ fontSize: '12px' }}></iconify-icon>
                  ) : (
                    <iconify-icon icon="ph:plug-connected" style={{ fontSize: '12px' }}></iconify-icon>
                  )}
                  测试
                </button>
              </div>
              <p className="text-[10px] text-stone-400 mt-1">
                server.mjs 的监听地址。远程部署时改为对应 IP/域名。
              </p>
            </div>

            {/* 测试结果 */}
            {testMsg && (
              <div
                className={`rounded-xl p-3 flex items-start gap-2 border ${
                  testOk
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <iconify-icon
                  icon={testOk ? 'ph:check-circle' : 'ph:warning-circle'}
                  style={{ fontSize: '16px', color: testOk ? '#16a34a' : '#dc2626', flexShrink: 0, marginTop: 2 }}
                ></iconify-icon>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[11px] font-semibold ${
                      testOk ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {testOk ? '沙箱连接正常' : '沙箱连接失败'}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${testOk ? 'text-green-600' : 'text-red-600'}`}>
                    {testMsg}
                  </p>
                </div>
              </div>
            )}

            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <iconify-icon icon="ph:check-square" style={{ fontSize: '14px', color: '#78716c' }}></iconify-icon>
                <span className="text-[11px] font-semibold text-stone-700">服务侧配置确认</span>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sandbox.hasApiKey}
                  onChange={(e) => handleSandboxSave({ ...sandbox, hasApiKey: e.target.checked })}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-[11px] text-stone-700">我已在 server.mjs 所在目录的 <code className="px-1 bg-white rounded text-[10px]">.env</code> 中配置 <code className="px-1 bg-white rounded text-[10px]">DAYTONA_API_KEY</code></p>
                  <p className="text-[10px] text-stone-400 mt-0.5">仅作 UI 提示，密钥本身仍由服务端读取。</p>
                </div>
              </label>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
              <iconify-icon icon="ph:warning" style={{ fontSize: '16px', color: '#f59e0b', flexShrink: 0, marginTop: 2 }}></iconify-icon>
              <div className="text-[11px] text-amber-700 leading-relaxed">
                <p className="font-semibold mb-1">如何启动 server.mjs</p>
                <pre className="bg-white/60 rounded p-2 text-[10px] font-mono text-amber-900 overflow-x-auto whitespace-pre-wrap break-all">
{`cd startup-agent
echo "DAYTONA_API_KEY=你的密钥" > .env
node server.mjs`}
                </pre>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-stone-900 text-white text-[12px] font-semibold active:bg-stone-800 transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
