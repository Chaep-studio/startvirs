/**
 * 沙箱配置管理
 *
 * 沙箱由 server.mjs 桥接到 Daytona 云端。
 * 用户在 SettingsModal 里配置工具服务器 URL（默认 http://localhost:3456），
 * 以及可选的 API key 提示。
 *
 * API key 不能放在前端（Daytona SDK 需要服务端使用），
 * 这里只存 URL 和"已配置过 key 的提示状态"。
 */

const SANDBOX_CONFIG_KEY = 'startup_agent_sandbox_config';

export interface SandboxConfig {
  /** 工具服务器 URL（server.mjs 的地址），默认 http://localhost:3456 */
  url: string;
  /** 用户是否声明已在服务端 .env 配置好 DAYTONA_API_KEY（仅用于 UI 提示） */
  hasApiKey: boolean;
  /** 上次连接测试时间（毫秒时间戳） */
  lastTestedAt?: number;
  /** 上次连接测试结果 */
  lastTestOk?: boolean;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  url: 'http://localhost:3456',
  hasApiKey: false,
};

export function loadSandboxConfig(): SandboxConfig {
  try {
    const raw = localStorage.getItem(SANDBOX_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_SANDBOX_CONFIG };
    const parsed = JSON.parse(raw) as Partial<SandboxConfig>;
    return {
      url: typeof parsed.url === 'string' && parsed.url.trim() ? parsed.url.trim() : DEFAULT_SANDBOX_CONFIG.url,
      hasApiKey: !!parsed.hasApiKey,
      lastTestedAt: typeof parsed.lastTestedAt === 'number' ? parsed.lastTestedAt : undefined,
      lastTestOk: typeof parsed.lastTestOk === 'boolean' ? parsed.lastTestOk : undefined,
    };
  } catch {
    return { ...DEFAULT_SANDBOX_CONFIG };
  }
}

export function saveSandboxConfig(cfg: SandboxConfig) {
  try {
    localStorage.setItem(SANDBOX_CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

/**
 * 测试沙箱连接
 * 简单 GET /api/health（如果存在）或者任意已知端点；失败时尝试根路径
 */
export async function testSandboxConnection(url: string): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const cleaned = url.trim().replace(/\/+$/, '');
  if (!cleaned) {
    return { ok: false, message: 'URL 不能为空' };
  }
  const candidates = [`${cleaned}/api/health`, cleaned];
  const start = Date.now();
  for (const endpoint of candidates) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(endpoint, { method: 'GET', signal: ctrl.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      if (res.ok || res.status < 500) {
        return {
          ok: true,
          message: `连接成功 (HTTP ${res.status}) · ${latencyMs}ms`,
          latencyMs,
        };
      }
      // 5xx 视为后端在但报错，继续试下一个候选
      if (res.status >= 500) continue;
      return {
        ok: false,
        message: `连接失败 (HTTP ${res.status})`,
        latencyMs,
      };
    } catch (e) {
      // 试下一个候选
      const msg = e instanceof Error ? e.message : String(e);
      if (endpoint === candidates[candidates.length - 1]) {
        return { ok: false, message: `无法连接：${msg}` };
      }
    }
  }
  return { ok: false, message: '所有候选端点均不可达' };
}
