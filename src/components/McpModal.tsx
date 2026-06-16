import { useState } from 'react';
import type { McpServerConfig, McpTool } from '../types';
import { discoverMcpTools, loadMcpServers, saveMcpServers } from '../agent/mcp';
import { generateId } from '../utils';

interface Props {
  servers: McpServerConfig[];
  mcpTools: McpTool[];
  onServersChange: (servers: McpServerConfig[]) => void;
  onToolsChange: (tools: McpTool[]) => void;
  onClose: () => void;
}

export default function McpModal({ servers, mcpTools, onServersChange, onToolsChange, onClose }: Props) {
  const [localServers, setLocalServers] = useState<McpServerConfig[]>([...servers]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const newServer: McpServerConfig = {
      id: generateId(),
      name: '新 MCP 服务器',
      url: '',
      enabled: true,
    };
    const next = [...localServers, newServer];
    setLocalServers(next);
  };

  const handleUpdate = (id: string, update: Partial<McpServerConfig>) => {
    setLocalServers(prev =>
      prev.map(s => (s.id === id ? { ...s, ...update } : s))
    );
  };

  const handleDelete = (id: string) => {
    setLocalServers(prev => prev.filter(s => s.id !== id));
    // 同时移除该服务器的工具
    onToolsChange(mcpTools.filter(t => t.serverId !== id));
  };

  const handleConnect = async (server: McpServerConfig) => {
    if (!server.url) return;
    setConnecting(server.id);
    setError(null);

    try {
      const tools = await discoverMcpTools(server);
      if (tools.length === 0) {
        setError(`${server.name}: 连接成功但未发现工具`);
      } else {
        // 合并工具（替换同 serverId 的旧工具）
        const otherTools = mcpTools.filter(t => t.serverId !== server.id);
        onToolsChange([...otherTools, ...tools]);
        setError(null);
      }
    } catch (e) {
      setError(`${server.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleSave = () => {
    onServersChange(localServers);
    saveMcpServers(localServers);
    onClose();
  };

  const totalMcpTools = mcpTools.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center anim-fade">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 anim-up max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-stone-900">MCP 服务器</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">
              连接外部 MCP 服务器扩展 Agent 能力
              {totalMcpTools > 0 && ` · 已发现 ${totalMcpTools} 个工具`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-stone-100">
            <iconify-icon icon="ph:x" style={{ fontSize: '20px', color: '#78716c' }}></iconify-icon>
          </button>
        </div>

        {/* 服务器列表 */}
        <div className="space-y-3 mb-4">
          {localServers.map((server) => {
            const serverTools = mcpTools.filter(t => t.serverId === server.id);
            return (
              <div key={server.id} className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => handleUpdate(server.id, { enabled: !server.enabled })}
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition flex-shrink-0 ${
                      server.enabled ? 'bg-blue-500 border-blue-500' : 'border-stone-300 bg-white'
                    }`}
                  >
                    {server.enabled && (
                      <iconify-icon icon="ph:check" style={{ fontSize: '10px', color: 'white' }}></iconify-icon>
                    )}
                  </button>
                  <input
                    type="text"
                    value={server.name}
                    onChange={(e) => handleUpdate(server.id, { name: e.target.value })}
                    className="flex-1 text-sm font-semibold text-stone-800 bg-transparent border-none outline-none"
                    placeholder="服务器名称"
                  />
                  {serverTools.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-600">
                      {serverTools.length} 工具
                    </span>
                  )}
                  <button
                    onClick={() => handleDelete(server.id)}
                    className="w-6 h-6 rounded flex items-center justify-center text-stone-400 hover:text-red-500 hover:bg-red-50 transition"
                  >
                    <iconify-icon icon="ph:trash" style={{ fontSize: '14px' }}></iconify-icon>
                  </button>
                </div>
                <input
                  type="text"
                  value={server.url}
                  onChange={(e) => handleUpdate(server.id, { url: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 placeholder:text-stone-300 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition"
                  placeholder="http://localhost:3000/mcp 或 SSE URL"
                />
                <input
                  type="password"
                  value={server.apiKey || ''}
                  onChange={(e) => handleUpdate(server.id, { apiKey: e.target.value })}
                  className="w-full px-3 py-2 mt-2 rounded-lg bg-white border border-stone-200 text-[12px] text-stone-700 placeholder:text-stone-300 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition"
                  placeholder="API Key（可选，用于认证）"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-stone-400">
                    {server.enabled ? '已启用' : '已禁用'}
                  </span>
                  <button
                    onClick={() => handleConnect(server)}
                    disabled={!server.url || connecting === server.id}
                    className="px-3 py-1 rounded-lg bg-white border border-stone-200 text-[11px] font-medium text-stone-600 hover:bg-stone-50 active:bg-stone-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {connecting === server.id ? (
                      <>
                        <iconify-icon icon="ph:spinner" className="animate-spin" style={{ fontSize: '12px' }}></iconify-icon>
                        连接中...
                      </>
                    ) : (
                      <>
                        <iconify-icon icon="ph:plug" style={{ fontSize: '12px' }}></iconify-icon>
                        连接并发现工具
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-[11px] text-red-600">
            {error}
          </div>
        )}

        {/* 已发现的工具列表 */}
        {mcpTools.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-stone-500 mb-2">已发现的 MCP 工具</h3>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {mcpTools.map((tool) => (
                <div key={tool.fullName} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-50 text-[11px]">
                  <iconify-icon icon="ph:wrench" style={{ fontSize: '12px', color: '#78716c' }}></iconify-icon>
                  <span className="font-medium text-stone-700">{tool.name}</span>
                  <span className="text-stone-400 truncate flex-1">{tool.description.slice(0, 60)}</span>
                  <span className="text-stone-300 text-[10px]">{tool.serverId.slice(0, 6)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 添加 + 保存 */}
        <div className="flex gap-3">
          <button
            onClick={handleAdd}
            className="flex-1 py-2.5 rounded-xl border-2 border-dashed border-stone-200 text-[12px] font-medium text-stone-400 hover:border-stone-300 hover:text-stone-500 transition flex items-center justify-center gap-1"
          >
            <iconify-icon icon="ph:plus" style={{ fontSize: '14px' }}></iconify-icon>
            添加 MCP 服务器
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-stone-900 text-white text-[12px] font-semibold active:bg-stone-800 transition"
          >
            保存
          </button>
        </div>

        {/* 说明 */}
        <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
          <iconify-icon icon="ph:info" style={{ fontSize: '14px', color: '#3b82f6', flexShrink: 0, marginTop: 1 }}></iconify-icon>
          <p className="text-[10px] text-blue-600 leading-relaxed">
            MCP (Model Context Protocol) 让你的 Agent 连接外部工具服务器。输入 MCP 服务器的 URL，点击「连接并发现工具」即可将其工具注入 Agent 循环。需要在 Agent 模式下使用。
          </p>
        </div>
      </div>
    </div>
  );
}
