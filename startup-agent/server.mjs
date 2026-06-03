/**
 * Agent 工具执行服务器 — Daytona 沙箱版
 * 每个用户 session 对应一个隔离的 Daytona 云端沙箱
 * 工具：bash / read_file / write_file / edit_file / list_files
 */
import express from 'express';
import cors from 'cors';
import { Daytona } from '@daytona/sdk';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

if (!process.env.DAYTONA_API_KEY) {
  console.warn('⚠️  DAYTONA_API_KEY 未设置，工具调用将失败。请在 .env 中配置。');
}

const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY });

const MAX_OUTPUT = 5 * 1024 * 1024; // 5MB
const SHELL_SESSION = 'main-shell';  // 每个沙箱内的持久化 shell session

/** userSessionId -> { sandbox } */
const sandboxMap = new Map();

/** 获取或创建该用户 session 对应的 Daytona 沙箱 */
async function getSandbox(sessionId = 'default') {
  if (sandboxMap.has(sessionId)) {
    return sandboxMap.get(sessionId).sandbox;
  }
  const sandbox = await daytona.create();
  await sandbox.process.createSession(SHELL_SESSION);
  sandboxMap.set(sessionId, { sandbox });
  console.log(`🟢 沙箱已创建 [session=${sessionId}] id=${sandbox.id}`);
  return sandbox;
}

// ============ bash ============
// 使用持久化 shell session，cd 等状态在同一 session 内保留
app.post('/api/tools/bash', async (req, res) => {
  const { command, __sessionId } = req.body;
  if (!command) return res.status(400).json({ error: '缺少 command 参数' });
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
app.post('/api/mcp/proxy', async (req, res) => {
  const { url, body, apiKey } = req.body;
  if (!url) return res.status(400).json({ error: '缺少 url 参数' });
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    return res.status(400).json({ error: 'url 必须以 http:// 或 https:// 开头' });
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

const PORT = 3456;
app.listen(PORT, () => {
  console.log(`🔧 Agent 工具服务器运行在 http://localhost:${PORT}`);
  console.log(`📂 工作空间: ${WSPACE}`);
});
