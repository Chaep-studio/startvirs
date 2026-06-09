export function load<T>(key: string, fallback?: T): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : (fallback ?? null);
  } catch (e) {
    console.warn(`localStorage key "${key}" 数据解析失败，已回退到默认值:`, e instanceof Error ? e.message : String(e));
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