/**
 * Agent 工具执行服务器 — Daytona 沙箱版
 * 每个用户 session 对应一个隔离的 Daytona 云端沙箱
 * 工具：bash / read_file / write_file / edit_file / list_files
 *
 * 同时支持「测试模式」：操作本机 TEST_WORKSPACE 目录（不走 Daytona），
 * 方便沙箱不可用时本地调试。
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
// Daytona SDK 的 ESM build 在 FileTransfer.js 里直接用 require('stream')，
// ESM 上下文下会爆 "require is not defined"。
// 用 createRequire 强制走 CJS build，绕开这个 SDK bug。
import { createRequire } from 'module';
const nodeRequire = createRequire(import.meta.url);
const { Daytona } = nodeRequire('@daytona/sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 健康检查（前端探活：区分「server 没起」和「后端模式不可用」）
app.get('/api/server/ping', (_req, res) => {
  res.json({
    ok: true,
    hasDaytonaKey: !!process.env.DAYTONA_API_KEY,
    testWorkspace: TEST_WORKSPACE,
    time: Date.now(),
  });
});

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

// ⚠️ 本地模式 bash：直接跑在 server 本机 cwd（不走 Daytona、不走 TEST_WORKSPACE）
// 启用条件：用户在前端设置里勾选了"启用本地 bash"
// 风险：命令无任何沙箱限制，会污染 server 本机文件系统
app.post('/api/local/bash', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: '缺少 command 参数' });
  console.warn(`⚠️ [local-bash] 收到未沙箱化的命令: ${command.slice(0, 200)}`);
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),  // ⚠️ server 本机当前目录，无沙箱
      timeout: 30_000,     // 30s 硬超时
      maxBuffer: MAX_OUTPUT,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG,
        // ⚠️ 其它环境变量故意不传（避免泄露 API key 等敏感信息）
      },
    });
    res.json({
      exitCode: 0,
      stdout: (stdout || '').slice(0, MAX_OUTPUT),
      stderr: (stderr || '').slice(0, 10000),
      warning: '此命令在 server 本机执行，无沙箱',
    });
  } catch (e) {
    res.json({
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stdout: (e.stdout || '').slice(0, MAX_OUTPUT),
      stderr: (e.stderr || e.message || '').slice(0, 10000),
      error: e.message,
      warning: '此命令在 server 本机执行，无沙箱',
    });
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
// 修复：之前用 `node -e` + executeCommand，cwd 跟 sb.fs.uploadFile 不一致，
// 导致 write_file 创建的文件在 list_files 里看不到。
// 改用 sb.fs.listFiles() — 跟 uploadFile/downloadFile 共享同一 working dir。
app.post('/api/tools/list_files', async (req, res) => {
  try {
    const { path: dirPath = '.', __sessionId } = req.body;
    const sb = await getSandbox(__sessionId);
    const entries = await sb.fs.listFiles(dirPath);
    const files = entries
      .filter((e) => !e.name.startsWith('.'))
      .filter((e) => !['node_modules', 'dist', '.git'].includes(e.name))
      .map((e) => ({
        name: e.name,
        type: e.isDir ? 'dir' : 'file',
        size: e.size,
      }));
    res.json({ files });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

// cloud 模式：在 Daytona 沙箱里 grep
app.post('/api/tools/grep', async (req, res) => {
  try {
    const { path: dirPath = '.', pattern, include, maxMatches = 500, __sessionId } = req.body;
    if (!pattern) return res.status(400).json({ error: '缺少 pattern 参数' });
    const sb = await getSandbox(__sessionId);
    const excludeArgs = ['--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=dist'];
    const includeArgs = include ? [`--include=${include}`] : [];
    const cmd = ['grep', '-rEnHI', ...excludeArgs, ...includeArgs, '--', pattern, dirPath].join(' ');
    const result = await sb.process.executeCommand(cmd, undefined, 15000);
    const stdout = (result?.result || result?.output || '').toString();
    const lines = stdout.split('\n').filter(Boolean);
    const truncated = lines.length > maxMatches;
    const sliced = truncated ? lines.slice(0, maxMatches) : lines;
    const matches = sliced.map((line) => {
      // 格式：<dirPath>/<relpath>:lineno:content   （grep 拼上 dirPath 前缀）
      const re = new RegExp(`^${dirPath.replace(/[.+^$()|{}[\]\\]/g, '\\$&')}/?(.+?):(\\d+):(.*)$`);
      const m = line.match(re) || line.match(/^(.+?):(\d+):(.*)$/);
      if (m) return { path: m[1], line: parseInt(m[2], 10), text: (m[3] || '').slice(0, 500) };
      return { path: line, line: 0, text: '' };
    });
    res.json({ matches, count: matches.length, truncated });
  } catch (e) {
    // grep 没匹配到会 exit 1，没 stdout 时当成"没找到"
    const msg = e?.message || String(e);
    if (/exit code 1|exited with code 1/i.test(msg)) {
      return res.json({ matches: [], count: 0, truncated: false });
    }
    res.status(e.status || 400).json({ error: msg });
  }
});

// cloud 模式：在 Daytona 沙箱里 glob
app.post('/api/tools/glob', async (req, res) => {
  try {
    const { path: dirPath = '.', pattern, __sessionId } = req.body;
    if (!pattern) return res.status(400).json({ error: '缺少 pattern 参数' });
    const sb = await getSandbox(__sessionId);
    const findPattern = pattern.replace(/\*\*/g, '*');
    const cmd = `find ${dirPath} -path '${findPattern}' -type f 2>/dev/null | head -1000`;
    const result = await sb.process.executeCommand(cmd, undefined, 10000);
    const stdout = (result?.result || result?.output || '').toString();
    const files = stdout.split('\n').filter(Boolean).map(p => p.startsWith(dirPath + '/') ? p.slice(dirPath.length + 1) : p);
    res.json({ files, truncated: files.length >= 1000 });
  } catch (e) {
    res.status(e.status || 400).json({ error: e?.message || String(e) });
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
  console.log(`🧪 测试模式工作空间: ${TEST_WORKSPACE}`);
});

// ============ 测试模式：本机文件系统（不走 Daytona）============
// 沙箱不可用时的本地调试兜底
const TEST_WORKSPACE = process.env.TEST_WORKSPACE
  ? path.resolve(process.env.TEST_WORKSPACE)
  : path.resolve('./test-workspace');
// 启动时确保目录存在
fs.mkdir(TEST_WORKSPACE, { recursive: true }).catch(() => {});

/** 把请求路径安全地解析到 TEST_WORKSPACE 之内（防止路径穿越）*/
function safeTestPath(p) {
  const resolved = path.resolve(TEST_WORKSPACE, p || '.');
  if (!resolved.startsWith(TEST_WORKSPACE + path.sep) && resolved !== TEST_WORKSPACE) {
    throw new Error(`路径超出测试工作空间: ${p}`);
  }
  return resolved;
}

const execAsync = promisify(exec);

/** 获取测试工作空间信息（前端用于展示当前路径）*/
app.get('/api/test/info', async (_req, res) => {
  try {
    await fs.access(TEST_WORKSPACE);
    res.json({ ok: true, workspace: TEST_WORKSPACE });
  } catch (e) {
    res.status(500).json({ ok: false, workspace: TEST_WORKSPACE, error: e.message });
  }
});

app.post('/api/test/read_file', async (req, res) => {
  try {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: '缺少 path 参数' });
    const full = safeTestPath(p);
    const content = await fs.readFile(full, 'utf-8');
    res.json({
      content: content.length > MAX_OUTPUT
        ? content.slice(0, MAX_OUTPUT) + '\n... (文件过大，已截断)'
        : content,
    });
  } catch (e) {
    res.status(e.code === 'ENOENT' ? 404 : 400).json({ error: e.message });
  }
});

app.post('/api/test/write_file', async (req, res) => {
  try {
    const { path: p, content } = req.body;
    if (!p || content === undefined) return res.status(400).json({ error: '缺少 path 或 content 参数' });
    const full = safeTestPath(p);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
    res.json({ ok: true, path: p });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/test/edit_file', async (req, res) => {
  try {
    const { path: p, old_str, new_str } = req.body;
    if (!p || !old_str) return res.status(400).json({ error: '缺少 path 或 old_str 参数' });
    const full = safeTestPath(p);
    let content = await fs.readFile(full, 'utf-8');
    if (!content.includes(old_str)) {
      return res.status(400).json({ error: '未找到要替换的内容' });
    }
    const count = content.split(old_str).length - 1;
    if (count > 1) {
      return res.status(400).json({ error: `找到 ${count} 处匹配，需要唯一匹配才能编辑` });
    }
    content = content.replace(old_str, new_str ?? '');
    await fs.writeFile(full, content, 'utf-8');
    res.json({ ok: true, path: p });
  } catch (e) {
    res.status(e.code === 'ENOENT' ? 404 : 400).json({ error: e.message });
  }
});

app.post('/api/test/list_files', async (req, res) => {
  try {
    const { path: dirPath = '.' } = req.body;
    const full = safeTestPath(dirPath);
    const entries = await fs.readdir(full, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (e) => {
      if (e.name.startsWith('.')) return null;
      if (['node_modules', 'dist', '.git'].includes(e.name)) return null;
      const isDir = e.isDirectory();
      let size;
      if (e.isFile()) {
        try {
          const stat = await fs.stat(path.join(full, e.name));
          size = stat.size;
        } catch { /* ignore */ }
      }
      return { name: e.name, type: isDir ? 'dir' : 'file', size };
    }));
    res.json({ files: files.filter(Boolean) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// grep：在文件中搜索 regex，支持 include glob、context 行数、超时
app.post('/api/test/grep', async (req, res) => {
  try {
    const {
      path: dirPath = '.',
      pattern,
      include,   // 可选 glob，如 "*.ts"
      maxMatches = 500,
    } = req.body;
    if (!pattern) return res.status(400).json({ error: '缺少 pattern 参数' });
    const full = safeTestPath(dirPath);
    // 排除大目录
    const excludeArgs = ['--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=dist', '--exclude-dir=build', '--exclude-dir=.next', '--exclude-dir=coverage'];
    const includeArgs = include ? [`--include=${include}`] : [];
    // -E 用扩展正则；-I 跳过二进制；-n 显示行号；-H 显示文件名；-r 递归
    const cmd = ['grep', '-rEnHI', ...excludeArgs, ...includeArgs, '--', pattern, '.'];
    const { stdout } = await execAsync(cmd.join(' '), {
      cwd: full,
      timeout: 15000,
      maxBuffer: MAX_OUTPUT,
    });
    const lines = (stdout || '').split('\n').filter(Boolean);
    const truncated = lines.length > maxMatches;
    const sliced = truncated ? lines.slice(0, maxMatches) : lines;
    const matches = sliced.map((line) => {
      // 格式：./path/to/file:lineno:content
      const m = line.match(/^\.\/(.+?):(\d+):(.*)$/);
      if (m) return { path: m[1], line: parseInt(m[2], 10), text: m[3].slice(0, 500) };
      return { path: line, line: 0, text: '' };
    });
    res.json({ matches, count: matches.length, truncated });
  } catch (e) {
    // grep 没找到会 exit 1，execAsync 抛错；要区分"没找到"和"真错"
    if (e.code === 1 && !e.stderr) {
      return res.json({ matches: [], count: 0, truncated: false });
    }
    res.json({ matches: [], count: 0, truncated: false, error: e.message || String(e) });
  }
});

// glob：用 find 实现（node 无原生 glob）
app.post('/api/test/glob', async (req, res) => {
  try {
    const { path: dirPath = '.', pattern } = req.body;
    if (!pattern) return res.status(400).json({ error: '缺少 pattern 参数' });
    const full = safeTestPath(dirPath);
    // pattern 如 "src/**/*.ts"，转成 find -path
    // 简单处理：把所有 * 转成 find 的通配（find 原生支持 * ? []）
    // 但 ** 需替换为 find 的 */ 递归匹配
    const findPattern = pattern.replace(/\*\*/g, '*');
    const cmd = `find . -path './${findPattern}' -type f 2>/dev/null | head -1000`;
    const { stdout } = await execAsync(cmd, {
      cwd: full,
      timeout: 10000,
      maxBuffer: MAX_OUTPUT,
    });
    const files = (stdout || '').split('\n').filter(Boolean).map(p => p.replace(/^\.\//, ''));
    res.json({ files, truncated: files.length >= 1000 });
  } catch (e) {
    res.json({ files: [], truncated: false, error: e.message || String(e) });
  }
});

app.post('/api/test/bash', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: '缺少 command 参数' });
    const { stdout, stderr } = await execAsync(command, {
      cwd: TEST_WORKSPACE,
      timeout: 30000,
      maxBuffer: MAX_OUTPUT,
    });
    res.json({
      exitCode: 0,
      stdout: (stdout || '').slice(0, MAX_OUTPUT),
      stderr: (stderr || '').slice(0, 10000),
    });
  } catch (e) {
    res.json({
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stdout: (e.stdout || '').slice(0, MAX_OUTPUT),
      stderr: (e.stderr || e.message || '').slice(0, 10000),
      error: e.message,
    });
  }
});
