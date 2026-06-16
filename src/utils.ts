export function load<T>(key: string, fallback?: T): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : (fallback ?? null);
  } catch {
    return fallback ?? null;
  }
}

export function save(key: string, val: unknown) {
  localStorage.setItem(key, JSON.stringify(val));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function getAutoUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return '';
  if (!url.endsWith('/chat/completions')) {
    if (url.endsWith('/')) url = url.slice(0, -1);
    if (url.endsWith('/v1')) url += '/chat/completions';
    else if (!url.includes('/v1/')) url += '/v1/chat/completions';
    else url += '/chat/completions';
  }
  return url;
}

// =====================================================
// 行级 diff（LCS 算法，无新依赖）
// =====================================================

export type DiffOp = 'equal' | 'add' | 'remove';
export interface DiffLine {
  op: DiffOp;
  /** 旧文件的行号（1-based；op=add 时为 0） */
  oldLine: number;
  /** 新文件的行号（1-based；op=remove 时为 0） */
  newLine: number;
  text: string;
}

/** 行级 diff（O(m*n)，对 1000 行内的文件 < 50ms） */
export function getLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const m = a.length, n = b.length;

  // dp[i][j] = a[..i] vs b[..j] 的 LCS 长度
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯得到操作序列
  const out: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ op: 'equal', oldLine: i, newLine: j, text: a[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ op: 'remove', oldLine: i, newLine: 0, text: a[i - 1] });
      i--;
    } else {
      out.push({ op: 'add', oldLine: 0, newLine: j, text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) { out.push({ op: 'remove', oldLine: i, newLine: 0, text: a[i - 1] }); i--; }
  while (j > 0) { out.push({ op: 'add',    oldLine: 0, newLine: j, text: b[j - 1] }); j--; }

  return out.reverse();
}

/** diff 摘要：增/删行数 + 字节数 */
export function summarizeDiff(diff: DiffLine[]): { added: number; removed: number; addedBytes: number; removedBytes: number } {
  let added = 0, removed = 0, addedBytes = 0, removedBytes = 0;
  for (const l of diff) {
    if (l.op === 'add') { added++; addedBytes += l.text.length + 1; }
    else if (l.op === 'remove') { removed++; removedBytes += l.text.length + 1; }
  }
  return { added, removed, addedBytes, removedBytes };
}