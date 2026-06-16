import type { Skill } from '../types';

/**
 * 解析 ZIP 技能包为 Skill 对象列表。
 *
 * ZIP 结构示例：
 *   ppt-generator-1.0.0/
 *     SKILL.md           ← Front Matter + Markdown 主指令
 *     _meta.json         ← 元数据（可选）
 *     agents/openai.yaml ← Agent 配置
 *     assets/template.html ← 模板资源
 *     references/*.md    ← 参考文档
 *
 * 每个 ZIP 根目录下的 SKILL.md 或 *.md 文件被视为一个技能。
 */
export async function parseSkillsFromZip(buffer: Uint8Array): Promise<Omit<Skill, 'id'>[]> {
  const { unzip } = await import('fflate');
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(buffer, (err, data) => {
      if (err) reject(new Error('ZIP 解压失败：' + err.message));
      else resolve(data || {});
    });
  });

  // 按目录分组：将文件按技能分组（一个技能可能包含多个文件）
  const skillDirs = groupFilesBySkillDir(files);
  const skills: Omit<Skill, 'id'>[] = [];
  const errors: string[] = [];

  for (const [dirName, fileEntries] of Object.entries(skillDirs)) {
    try {
      const skill = buildSkillFromFiles(dirName, fileEntries);
      if (skill) skills.push(skill);
    } catch (e) {
      errors.push(`${dirName}: ${e instanceof Error ? e.message : '解析失败'}`);
    }
  }

  if (skills.length === 0) {
    throw new Error(
      '未找到有效的技能文件。\n' +
      (errors.length > 0 ? '错误详情：\n' + errors.join('\n') : '请确保 ZIP 包含 SKILL.md 或技能描述文件。')
    );
  }

  return skills;
}

interface FileEntry {
  path: string;
  content: Uint8Array;
  text: string;
}

/** 将 ZIP 中的所有文件按技能目录分组 */
function groupFilesBySkillDir(files: Record<string, Uint8Array>): Record<string, FileEntry[]> {
  const groups: Record<string, FileEntry[]> = {};
  const skillDirNames = new Set<string>();

  // 先找出所有顶级目录（含有 SKILL.md 的目录才视为根）
  for (const filepath of Object.keys(files)) {
    // 跳过 __MACOSX、.DS_Store 等系统文件
    if (filepath.startsWith('__MACOSX') || filepath.startsWith('.') || filepath.includes('__MACOSX/')) continue;

    const normalized = filepath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    const filename = parts[parts.length - 1];

    if (filename === 'SKILL.md') {
      // 如果 SKILL.md 在子目录里，该子目录就是根
      const dir = parts.slice(0, -1).join('/') || '.';
      skillDirNames.add(dir);
    }
  }

  // 如果没找到 SKILL.md，尝试把顶级 .md 文件作为独立技能
  if (skillDirNames.size === 0) {
    for (const filepath of Object.keys(files)) {
      const normalized = filepath.replace(/\\/g, '/');
      if (normalized.endsWith('.md') && !normalized.startsWith('__MACOSX') && !normalized.startsWith('.')) {
        skillDirNames.add('.');
        break;
      }
    }
  }

  // 按目录分组
  for (const filepath of Object.keys(files)) {
    if (filepath.startsWith('__MACOSX') || filepath.startsWith('.') || filepath.includes('__MACOSX/')) continue;
    const normalized = filepath.replace(/\\/g, '/');
    const decoded = new TextDecoder().decode(files[filepath]);

    // 找到该文件属于哪个技能目录
    let matchedDir = '';
    for (const dir of skillDirNames) {
      if (dir === '.' || normalized.startsWith(dir + '/') || normalized === dir) {
        if (dir.length > matchedDir.length) matchedDir = dir;
        break;
      }
    }
    // 如果文件在最外层且没有 SKILL.md，不分技能目录
    if (!matchedDir && skillDirNames.has('.')) matchedDir = '.';

    const entry: FileEntry = { path: normalized, content: files[filepath], text: decoded };
    if (!matchedDir) matchedDir = '_ungrouped';
    if (!groups[matchedDir]) groups[matchedDir] = [];
    groups[matchedDir].push(entry);
  }

  return groups;
}

/** 从一组文件构建一个 Skill 对象 */
function buildSkillFromFiles(dirName: string, entries: FileEntry[]): Omit<Skill, 'id'> | null {
  const skillMd = entries.find((e) => e.path.endsWith('SKILL.md'));
  const metaJson = entries.find((e) => e.path.endsWith('_meta.json'));
  const agentsYaml = entries.find((e) => e.path.endsWith('.yaml') || e.path.endsWith('.yml'));

  // 提取 SKILL.md 的 Front Matter 和 body
  let name = '';
  let description = '';
  let body = '';
  let customCommand = '';
  let customIcon = '';
  let customColor = '';
  let customParamsHint = '';
  let promptTemplate = '{{input}}';

  if (skillMd) {
    const fmMatch = skillMd.text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (fmMatch) {
      const fm = parseFrontMatter(fmMatch[1]);
      name = fm.name || '';
      description = fm.description || name;
      customCommand = fm.command || '';
      customIcon = fm.icon || '';
      customColor = fm.color || '';
      customParamsHint = fm.paramsHint || '';
      if (fm.promptTemplate) promptTemplate = fm.promptTemplate;
      body = fmMatch[2].trim();
    } else {
      body = skillMd.text.trim();
    }
  } else {
    // 没有 SKILL.md，用目录名或第一个 .md 文件
    const firstMd = entries.find((e) => e.path.endsWith('.md'));
    if (!firstMd) return null;
    body = firstMd.text.trim();
  }

  if (!name) {
    // 从 _meta.json 或目录名推断
    if (metaJson) {
      try {
        const meta = JSON.parse(metaJson.text);
        name = meta.name || meta.slug || dirName;
        description = meta.description || description;
      } catch { /* ignore */ }
    }
    if (!name) {
      // 从 agents/*.yaml 读取 display_name
      if (agentsYaml) {
        const nameMatch = agentsYaml.text.match(/display_name:\s*["']?([^"'\n]+)/);
        if (nameMatch) name = nameMatch[1].trim();
        const descMatch = agentsYaml.text.match(/short_description:\s*["']?([^"'\n]+)/);
        if (descMatch && !description) description = descMatch[1].trim();
      }
    }
    if (!name) name = cleanSlug(dirName) || '未命名技能';
    if (!description) description = name;
  }

  // 组合 systemPrompt：SKILL.md body + 所有 reference 文档
  const systemPrompt = buildSystemPrompt(body, entries);

  // 收集所有文件内容
  const files: Record<string, string> = {};
  for (const entry of entries) {
    const relativePath = entry.path.replace(dirName === '.' ? '' : dirName + '/', '');
    if (!relativePath) continue;
    // 跳过已内联到 systemPrompt 的引用文件（避免重复）
    if (relativePath.endsWith('SKILL.md') || relativePath.endsWith('_meta.json')) continue;
    files[relativePath] = entry.text;
  }

  return {
    name,
    command: customCommand || `/${toKebabCase(name)}`,
    icon: customIcon || 'ph:lightning',
    color: customColor || '#f97316',
    description: description || name,
    paramsHint: customParamsHint || '[输入内容]',
    systemPrompt,
    promptTemplate,
    ...(Object.keys(files).length > 0 ? { files } : {}),
  };
}

/** 构建 systemPrompt：SKILL.md body + 引用文档 + 模板文件概要 */
function buildSystemPrompt(body: string, entries: FileEntry[]): string {
  const parts: string[] = [body];

  // 添加 references 目录下的文档
  const refs = entries
    .filter((e) => e.path.includes('/references/') || e.path.includes('\\references\\'))
    .filter((e) => e.path.endsWith('.md'));

  for (const ref of refs) {
    const name = ref.path.split('/').pop() || ref.path.split('\\').pop() || '';
    parts.push(`\n\n---\n## 参考文档：${name}\n\n${ref.text}`);
  }

  // 添加 assets 目录下的模板文件概要（不内联完整文件，只告诉 AI 有这个东西）
  const assets = entries.filter(
    (e) => (e.path.includes('/assets/') || e.path.includes('\\assets\\')) && e.path.endsWith('.html')
  );
  for (const asset of assets) {
    const name = asset.path.split('/').pop() || asset.path.split('\\').pop() || '';
    parts.push(`\n\n---\n## 资源文件：${name}\n\n文件位于 assets/${name}，请在输出时引用此模板。\n\n\`\`\`html\n${asset.text.slice(0, 3000)}\n\`\`\``);
  }

  return parts.join('\n').trim();
}

/** 解析简易 YAML 格式的 Front Matter */
function parseFrontMatter(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

/** 清理 slug 为可读名称 */
function cleanSlug(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\.\d+\.\d+\.\d+$/, '') // 去掉版本号
    .split('/')
    .pop() || slug;
}

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 将技能列表导出为 ZIP 文件并下载 */
export async function downloadSkillsAsZip(skills: Skill[]): Promise<void> {
  const { zip, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = {};

  for (const skill of skills) {
    const fm = [
      '---',
      `name: ${skill.name}`,
      `command: ${skill.command}`,
      `icon: ${skill.icon}`,
      `color: "${skill.color}"`,
      `description: ${skill.description}`,
      `paramsHint: ${skill.paramsHint}`,
      '---',
      '',
      skill.systemPrompt,
    ].join('\n');
    files[`${skill.name}/SKILL.md`] = strToU8(fm);

    // 如果有文件附件，也写入
    if (skill.files) {
      for (const [filepath, content] of Object.entries(skill.files)) {
        files[`${skill.name}/${filepath}`] = strToU8(content);
      }
    }
  }

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, (err, data) => {
      if (err) reject(new Error('ZIP 打包失败：' + err.message));
      else resolve(data!);
    });
  });

  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `skill-pack-${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}