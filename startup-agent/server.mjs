/**
 * Agent 工具执行服务器 — Daytona 沙箱版
 * 每个用户 session 对应一个隔离的 Daytona 云端沙箱
 * 工具：bash / read_file / write_file / edit_file / list_files
 */
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { Daytona } from '@daytona/sdk';

const app = express();

// ============ Security: CORS — restrict to known origins ============
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173,http://localhost:3456')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (server-to-server, curl, mobile apps)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ============ Security: Bearer token authentication ============
// Generate a random token at startup; the frontend must send it as
// Authorization: Bearer <token>.  In production, replace this with a
// persistent secret stored in env (SERVER_AUTH_TOKEN).
const AUTH_TOKEN = process.env.SERVER_AUTH_TOKEN || crypto.randomBytes(32).toString('hex');

if (!process.env.SERVER_AUTH_TOKEN) {
  console.log(`🔑 Auto-generated auth token (set SERVER_AUTH_TOKEN env to persist):\n   ${AUTH_TOKEN}`);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token !== AUTH_TOKEN) {
    return res.status(401).json({ error: '未授权：缺少或无效的 Authorization token' });
  }
  next();
}

// Apply auth to all /api/* routes
app.use('/api', requireAuth);

// ============ Security: Simple rate limiting ============
const rateLimitMap = new Map(); // ip -> { count, resetTime }
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 120; // requests per window

app.use('/api', (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  next();
});

// Periodically clean up stale rate-limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS);

if (!process.env.DAYTONA_API_KEY) {
  console.warn('⚠️  DAYTONA_API_KEY 未设置，工具调用将失败。请在 .env 中配置。');
}

const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY });

const MAX_OUTPUT = 5 * 1024 * 1024; // 5MB
const SHELL_SESSION = 'main-shell';  // 每个沙箱内的持久化 shell session

/** userSessionId -> { sandbox, lastAccess } */
const sandboxMap = new Map();

// ============ Security: Sandbox TTL cleanup ============
const SANDBOX_TTL_MS = 30 * 60 * 1000; // 30 minutes idle

setInterval(async () => {
  const now = Date.now();
  for (const [sessionId, entry] of sandboxMap) {
    if (now - entry.lastAccess > SANDBOX_TTL_MS) {
      await entry.sandbox.delete().catch(() => {});
      sandboxMap.delete(sessionId);
      console.log(`🕐 沙箱已超时销毁 [session=${sessionId}]`);
    }
  }
}, 60_000); // check every minute

/** 获取或创建该用户 session 对应的 Daytona 沙箱 */
async function getSandbox(sessionId = 'default') {
  if (sandboxMap.has(sessionId)) {
    const entry = sandboxMap.get(sessionId);
    entry.lastAccess = Date.now();
    return entry.sandbox;
  }
  const sandbox = await daytona.create();
  await sandbox.process.createSession(SHELL_SESSION);
  sandboxMap.set(sessionId, { sandbox, lastAccess: Date.now() });
  console.log(`🟢 沙箱已创建 [session=${sessionId}] id=${sandbox.id}`);
  return sandbox;
}

// ============ Security: Session ID validation ============
function validateSessionId(sessionId) {
  if (!sessionId) return true; // will default to 'default'
  if (typeof sessionId !== 'string') return false;
  // Only allow alphanumeric, hyphens, underscores (max 64 chars)
  return /^[a-zA-Z0-9_-]{1,64}$/.test(sessionId);
}

// ============ Security: Path validation (prevent traversal) ============
function isPathSafe(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  // Block null bytes
  if (filePath.includes('\0')) return false;
  // Block absolute paths and traversal sequences
  if (filePath.startsWith('/') || filePath.startsWith('\\')) return false;
  // Normalize and check for directory traversal
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  let depth = 0;
  for (const part of parts) {
    if (part === '..') {
      depth--;
      if (depth < 0) return false; // traversed above the root
    } else if (part !== '.' && part !== '') {
      depth++;
    }
  }
  return true;
}

// ============ bash ============
// 使用持久化 shell session，cd 等状态在同一 session 内保留
app.post('/api/tools/bash', async (req, res) => {
  const { command, __sessionId } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: '缺少 command 参数' });
  }
  if (!validateSessionId(__sessionId)) {
    return res.status(400).json({ error: '无效的 sessionId' });
  }
  // Security: Log command execution for audit
  console.log(`[AUDIT] bash session=${__sessionId || 'default'} command=${command.slice(0, 200)}`);
  try {
    const sb = await getSandbox(__sessionId);
    const result = await sb.process.executeSessionCommand(
      SHELL_SESSION,
      { command },
      30
    );
    res.json({
      exitCode: result.exitCode ?? 0,
      stdout: (result.stdout || result.output || '').slice(0, MAX_OUTPUT),
      stderr: (result.stderr || '').slice(0, 10000),
      error: (result.exitCode && result.exitCode !== 0) ? (result.stderr || null) : null,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ============ read_file ============
app.post('/api/tools/read_file', async (req, res) => {
  try {
    const { path, __sessionId } = req.body;
    if (!path) return res.status(400).json({ error: '缺少 path 参数' });
    if (!validateSessionId(__sessionId)) {
      return res.status(400).json({ error: '无效的 sessionId' });
    }
    if (!isPathSafe(path)) {
      return res.status(400).json({ error: '路径不合法：不允许绝对路径或目录穿越' });
    }
    const sb = await getSandbox(__sessionId);
    const buf = await sb.fs.downloadFile(path);
    const content = buf.toString('utf-8');
    res.json({
      content: content.length > MAX_OUTPUT
        ? content.slice(0, MAX_OUTPUT) + '\n... (文件过大，已截断)'
        : content,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ============ write_file ============
app.post('/api/tools/write_file', async (req, res) => {
  try {
    const { path, content, __sessionId } = req.body;
    if (!path || content === undefined) return res.status(400).json({ error: '缺少 path 或 content 参数' });
    if (!validateSessionId(__sessionId)) {
      return res.status(400).json({ error: '无效的 sessionId' });
    }
    if (!isPathSafe(path)) {
      return res.status(400).json({ error: '路径不合法：不允许绝对路径或目录穿越' });
    }
    const sb = await getSandbox(__sessionId);
    const dir = path.includes('/') ? path.split('/').slice(0, -1).join('/') : null;
    if (dir) await sb.fs.createFolder(dir, '755').catch(() => {});
    await sb.fs.uploadFile(Buffer.from(content, 'utf-8'), path);
    res.json({ ok: true, path });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ============ edit_file ============
app.post('/api/tools/edit_file', async (req, res) => {
  try {
    const { path, old_str, new_str, __sessionId } = req.body;
    if (!path || !old_str) return res.status(400).json({ error: '缺少 path 或 old_str 参数' });
    if (!validateSessionId(__sessionId)) {
      return res.status(400).json({ error: '无效的 sessionId' });
    }
    if (!isPathSafe(path)) {
      return res.status(400).json({ error: '路径不合法：不允许绝对路径或目录穿越' });
    }
    const sb = await getSandbox(__sessionId);
    const buf = await sb.fs.downloadFile(path);
    let content = buf.toString('utf-8');
    if (!content.includes(old_str)) {
      return res.status(400).json({ error: '未找到要替换的内容' });
    }
    const count = content.split(old_str).length - 1;
    if (count > 1) {
      return res.status(400).json({ error: `找到 ${count} 处匹配，需要唯一匹配才能编辑` });
    }
    content = content.replace(old_str, new_str ?? '');
    await sb.fs.uploadFile(Buffer.from(content, 'utf-8'), path);
    res.json({ ok: true, path });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ============ list_files ============
app.post('/api/tools/list_files', async (req, res) => {
  try {
    const { path: dirPath = '.', __sessionId } = req.body;
    if (!validateSessionId(__sessionId)) {
      return res.status(400).json({ error: '无效的 sessionId' });
    }
    if (dirPath !== '.' && !isPathSafe(dirPath)) {
      return res.status(400).json({ error: '路径不合法：不允许绝对路径或目录穿越' });
    }
    const sb = await getSandbox(__sessionId);
    const result = await sb.process.executeCommand(
      `node -e "const fs=require('fs');const e=fs.readdirSync(process.env.DIR,{withFileTypes:true});process.stdout.write(JSON.stringify(e.map(f=>({name:f.name,type:f.isDirectory()?'dir':'file'}))))"`,
      undefined,
      { DIR: dirPath },
      10
    );
    const files = JSON.parse(result.result || '[]');
    res.json({ files });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ============ 沙箱清理 ============
app.post('/api/sandbox/cleanup', async (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sandboxMap.has(sessionId)) {
    const { sandbox } = sandboxMap.get(sessionId);
    await sandbox.delete().catch(() => {});
    sandboxMap.delete(sessionId);
    console.log(`🔴 沙箱已销毁 [session=${sessionId}]`);
  }
  res.json({ ok: true });
});

// ============ MCP 代理（绕过浏览器 CORS 限制） ============
// Security: Block internal/private network ranges to prevent SSRF
function isUrlSafe(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    // Block private/reserved hostnames
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    if (hostname === '0.0.0.0') return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;

    // Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x)
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false;
      if (a === 0) return false;
    }

    // Must be HTTPS in production (allow HTTP in dev for convenience)
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return false;

    return true;
  } catch {
    return false;
  }
}

app.post('/api/mcp/proxy', async (req, res) => {
  const { url, body, apiKey } = req.body;
  if (!url) return res.status(400).json({ error: '缺少 url 参数' });
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    return res.status(400).json({ error: 'url 必须以 http:// 或 https:// 开头' });
  }
  if (!isUrlSafe(url)) {
    return res.status(400).json({ error: '目标 URL 不允许：禁止访问内网地址' });
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    // 如果提供了 apiKey，添加 Authorization 头
    if (apiKey) {
      headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    }

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

    const contentType = upstream.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // SSE: 流式转发
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.status(upstream.status);

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }
        } catch {
          // 客户端断开或流结束
        }
        res.end();
      };
      await pump();
    } else {
      // JSON 或其他: 直接转发
      const data = await upstream.text();
      res.status(upstream.status).setHeader('Content-Type', contentType || 'application/json');
      res.send(data);
    }
  } catch (e) {
    res.status(502).json({ error: `MCP proxy error: ${e.message}` });
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🔧 Agent 工具服务器运行在 http://127.0.0.1:${PORT}`);
});
