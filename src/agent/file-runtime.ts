/**
 * 文件 I/O 模式管理 — 云端 / 本地 / 测试 / 无后端
 *
 * - cloud 模式（默认）：文件 I/O 走工具服务器（Daytona 云端沙箱）
 *   通过 HTTP 调用 server.mjs，每个用户 session 一个隔离沙箱
 *
 * - local 模式：文件 I/O 用浏览器 File System Access API
 *   用户授权一个本地目录，AI 直接读写用户电脑上的文件
 *   - 不依赖后端服务器
 *   - 隐私更好（文件不出本机）
 *   - 需要 HTTPS 或 localhost（File System Access API 限制，仅桌面 Chrome/Edge）
 *
 * - test 模式：文件 I/O 走 server.mjs 的 /api/test/* 端点
 *   操作 server 本机上的 TEST_WORKSPACE 目录（不走 Daytona）
 *   沙箱不可用时用于本地调试，bash 命令也会在 server 上真实执行
 *
 * - none 模式（纯对话）：完全不暴露文件工具，仅 LLM 文本对话
 *   适用于 Netlify 静态部署、移动端浏览器、后端 server 不可用等场景
 *
 * 注意：此 runtime **不**影响 LLM 调用，云端/本地的 LLM 切换由独立的 apiMode 控制
 */

export type FileMode = 'cloud' | 'local' | 'test' | 'none';

const FILE_MODE_KEY = 'startup_agent_file_mode';
const LOCAL_DIR_KEY = 'startup_agent_local_dir';
const LOCAL_BASH_KEY = 'startup_agent_local_bash_enabled';
const DIFF_CONFIRM_KEY = 'startup_agent_diff_confirm';

export function loadFileMode(): FileMode {
  try {
    const v = localStorage.getItem(FILE_MODE_KEY);
    if (v === 'local' || v === 'test' || v === 'cloud' || v === 'none') return v;
    return 'cloud';
  } catch {
    return 'cloud';
  }
}

export function saveFileMode(mode: FileMode) {
  try {
    localStorage.setItem(FILE_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

// =====================================================
// ⚠️ 本地 Bash 开关（高危！）
// 开启后，AI 在 local 模式下可以执行任意 shell 命令
// 命令实际跑在 server.mjs 所在机器上（不在浏览器沙箱里）
// 默认关，用户必须主动勾选
// =====================================================

export function loadLocalBashEnabled(): boolean {
  try {
    return localStorage.getItem(LOCAL_BASH_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveLocalBashEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(LOCAL_BASH_KEY, '1');
    else localStorage.removeItem(LOCAL_BASH_KEY);
  } catch {
    // ignore
  }
}

// =====================================================
// 写文件前 Diff 确认开关
// 默认 false（资深用户）；开启后 write_file/edit_file 会先弹 diff 让用户确认
// =====================================================

export function loadDiffConfirmSetting(): boolean {
  try {
    return localStorage.getItem(DIFF_CONFIRM_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveDiffConfirmSetting(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(DIFF_CONFIRM_KEY, '1');
    else localStorage.removeItem(DIFF_CONFIRM_KEY);
  } catch {
    // ignore
  }
}

export function getSavedLocalDirName(): string | null {
  try {
    return localStorage.getItem(LOCAL_DIR_KEY);
  } catch {
    return null;
  }
}

export function saveLocalDirName(name: string | null) {
  try {
    if (name) localStorage.setItem(LOCAL_DIR_KEY, name);
    else localStorage.removeItem(LOCAL_DIR_KEY);
  } catch {
    // ignore
  }
}

/** 检测浏览器是否支持 File System Access API */
export function isFsAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * 让用户选择一个本地目录
 * 返回 FileSystemDirectoryHandle，存到全局供 tools.ts 使用
 */
export async function pickLocalDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFsAccessSupported()) {
    throw new Error('当前浏览器不支持 File System Access API，请使用 Chrome/Edge 86+ 或在 localhost 下打开');
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  saveLocalDirName(handle.name);
  setLocalDirHandle(handle);
  return handle;
}

// ============ 全局目录句柄管理（避免每次都让用户授权）============

let currentDirHandle: FileSystemDirectoryHandle | null = null;

export function setLocalDirHandle(handle: FileSystemDirectoryHandle | null) {
  currentDirHandle = handle;
}

export function getLocalDirHandle(): FileSystemDirectoryHandle | null {
  return currentDirHandle;
}

export function hasLocalDirHandle(): boolean {
  return currentDirHandle !== null;
}

// ============ 本地模式下的文件操作 ============

interface FsFileEntry {
  name: string;
  path: string;
  isFile: boolean;
  size?: number;
}

interface FsFileContent {
  content: string;
  size: number;
}

/** 解析路径（处理 ./ ../ / 开头） */
function normalizePath(path: string): string[] {
  const parts: string[] = [];
  for (const seg of (path || '.').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts;
}

/** 在目录句柄下递归解析一个相对路径 */
async function resolvePath(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
  const parts = normalizePath(path);
  if (parts.length === 0) return { dir: root, name: '.' };

  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(parts[i]);
    } catch {
      return null;
    }
  }
  return { dir, name: parts[parts.length - 1] };
}

/** 读取本地文件 */
export async function localReadFile(path: string): Promise<FsFileContent> {
  const root = currentDirHandle;
  if (!root) throw new Error('未选择本地目录');
  const resolved = await resolvePath(root, path);
  if (!resolved) throw new Error(`路径不存在: ${path}`);

  const fileHandle = await resolved.dir.getFileHandle(resolved.name);
  const file = await fileHandle.getFile();
  return {
    content: await file.text(),
    size: file.size,
  };
}

/** 写入本地文件（覆盖） */
export async function localWriteFile(path: string, content: string): Promise<{ size: number }> {
  const root = currentDirHandle;
  if (!root) throw new Error('未选择本地目录');

  const parts = normalizePath(path);
  if (parts.length === 0) throw new Error('路径无效');

  // 创建中间目录
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return { size: new Blob([content]).size };
}

/** 编辑本地文件（精确字符串替换） */
export async function localEditFile(
  path: string,
  oldStr: string,
  newStr: string
): Promise<{ success: boolean; occurrences: number; newSize: number }> {
  const current = await localReadFile(path);
  const occurrences = current.content.split(oldStr).length - 1;
  if (occurrences === 0) {
    throw new Error(`未找到匹配: "${oldStr.slice(0, 50)}..."`);
  }
  if (occurrences > 1) {
    throw new Error(`找到 ${occurrences} 处匹配，请提供更精确的 old_str`);
  }
  const newContent = current.content.replace(oldStr, newStr);
  await localWriteFile(path, newContent);
  return { success: true, occurrences: 1, newSize: new Blob([newContent]).size };
}

/** 列出本地目录 */
export async function localListFiles(path: string = '.'): Promise<FsFileEntry[]> {
  const root = currentDirHandle;
  if (!root) throw new Error('未选择本地目录');

  const parts = normalizePath(path);
  let dir = root;
  for (const part of parts) {
    try {
      dir = await dir.getDirectoryHandle(part);
    } catch {
      return [];
    }
  }

  const entries: FsFileEntry[] = [];
  // @ts-expect-error - FileSystemDirectoryHandle.values() 在 TS lib 中可能未声明
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith('.')) continue;
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const isFile = handle.kind === 'file';
    let size: number | undefined;
    if (isFile) {
      try {
        const file = await handle.getFile();
        size = file.size;
      } catch {
        // ignore
      }
    }
    entries.push({
      name,
      path: path === '.' ? name : `${path}/${name}`,
      isFile,
      size,
    });
  }
  return entries.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

// =====================================================
// 递归遍历（grep/glob 共享底层）
// =====================================================

/** 单个匹配结果 */
export interface GrepMatch {
  path: string;     // 相对 root 的路径
  line: number;     // 1-based
  text: string;     // 整行内容
}

/** 通用递归遍历选项 */
interface WalkOptions {
  /** 排除的目录名（精确匹配） */
  skipDirs?: Set<string>;
  /** 单文件最大字节（避免读爆内存），默认 2MB */
  maxFileBytes?: number;
  /** 最多返回的命中行数（防 OOM） */
  maxMatches?: number;
}

const DEFAULT_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.cache', 'coverage', '.vite']);
const DEFAULT_MAX_FILE = 2 * 1024 * 1024; // 2MB
const DEFAULT_MAX_MATCHES = 500;

/** 把 glob pattern 转成正则（支持 * ? **） */
function globToRegex(pattern: string): RegExp {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { re += '.*'; i++; }
      else re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^$()|{}[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  re += '$';
  return new RegExp(re);
}

/** 在指定目录下递归找匹配的文件路径 */
async function walkFiles(
  root: FileSystemDirectoryHandle,
  basePath: string,
  includeRe: RegExp,
  opts: WalkOptions
): Promise<string[]> {
  const skip = opts.skipDirs || DEFAULT_SKIP_DIRS;
  const out: string[] = [];

  // @ts-expect-error - FileSystemDirectoryHandle.values()
  for await (const [name, handle] of root.entries()) {
    if (name.startsWith('.')) continue;
    const relPath = basePath === '.' ? name : `${basePath}/${name}`;
    if (handle.kind === 'directory') {
      if (skip.has(name)) continue;
      try {
        const sub = await walkFiles(handle as FileSystemDirectoryHandle, relPath, includeRe, opts);
        out.push(...sub);
      } catch {
        // ignore
      }
    } else {
      if (includeRe.test(relPath) || includeRe.test(name)) {
        out.push(relPath);
      }
    }
  }
  return out;
}

/** 本地模式：在目录下用 regex 搜索文件内容 */
export async function localGrep(
  path: string,
  pattern: string,
  includeGlob?: string
): Promise<{ matches: GrepMatch[]; scannedFiles: number; truncated: boolean }> {
  const root = currentDirHandle;
  if (!root) throw new Error('未选择本地目录');

  // 解析起始目录
  const parts = normalizePath(path);
  let dir = root;
  for (const part of parts) {
    try {
      dir = await dir.getDirectoryHandle(part);
    } catch {
      return { matches: [], scannedFiles: 0, truncated: false };
    }
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch (e) {
    throw new Error(`正则表达式非法: ${e instanceof Error ? e.message : String(e)}`);
  }

  const includeRe = includeGlob ? globToRegex(includeGlob) : null;
  const maxFile = DEFAULT_MAX_FILE;
  const maxMatches = DEFAULT_MAX_MATCHES;

  // 收集候选文件
  const candidates = includeRe
    ? await walkFiles(dir, parts.join('/') || '.', includeRe, { maxFileBytes: maxFile, maxMatches })
    : await walkFiles(dir, parts.join('/') || '.', /^./, { maxFileBytes: maxFile, maxMatches });

  const matches: GrepMatch[] = [];
  let scanned = 0;
  let truncated = false;

  for (const rel of candidates) {
    scanned++;
    if (matches.length >= maxMatches) { truncated = true; break; }
    try {
      const resolved = await resolvePath(root, rel);
      if (!resolved) continue;
      const fh = await resolved.dir.getFileHandle(resolved.name);
      const file = await fh.getFile();
      if (file.size > maxFile) continue;
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({ path: rel, line: i + 1, text: lines[i].slice(0, 500) });
          if (matches.length >= maxMatches) { truncated = true; break; }
        }
      }
    } catch {
      // skip unreadable
    }
  }

  return { matches, scannedFiles: scanned, truncated };
}

/** 本地模式：glob 找文件 */
export async function localGlob(
  path: string,
  pattern: string
): Promise<{ matches: string[]; truncated: boolean }> {
  const root = currentDirHandle;
  if (!root) throw new Error('未选择本地目录');

  const parts = normalizePath(path);
  let dir = root;
  for (const part of parts) {
    try {
      dir = await dir.getDirectoryHandle(part);
    } catch {
      return { matches: [], truncated: false };
    }
  }

  const regex = globToRegex(pattern);
  const all = await walkFiles(dir, parts.join('/') || '.', /^./, { maxMatches: 1000 });
  const matches = all.filter(p => regex.test(p) || regex.test(p.split('/').pop() || ''));
  return { matches: matches.slice(0, 500), truncated: matches.length > 500 };
}
