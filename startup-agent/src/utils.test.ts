import { describe, it, expect, beforeEach, vi } from 'vitest';
import { load, save, generateId, getAutoUrl } from './utils';

describe('utils.getAutoUrl', () => {
  it('returns empty string for blank input', () => {
    expect(getAutoUrl('')).toBe('');
    expect(getAutoUrl('   ')).toBe('');
  });

  it('leaves an explicit /chat/completions URL untouched', () => {
    const url = 'https://api.example.com/v1/chat/completions';
    expect(getAutoUrl(url)).toBe(url);
  });

  it('appends chat/completions when the URL ends with /v1', () => {
    expect(getAutoUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
  });

  it('strips a trailing slash before appending', () => {
    expect(getAutoUrl('https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
  });

  it('inserts /v1/chat/completions for a bare base URL', () => {
    expect(getAutoUrl('https://api.openai.com')).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
  });

  it('appends chat/completions when the URL already contains /v1/', () => {
    expect(getAutoUrl('https://proxy.test/v1/openai')).toBe(
      'https://proxy.test/v1/openai/chat/completions'
    );
  });

  it('trims surrounding whitespace', () => {
    expect(getAutoUrl('  https://api.openai.com/v1  ')).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
  });
});

describe('utils.generateId', () => {
  it('produces unique-ish ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId()));
    expect(ids.size).toBe(200);
  });

  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string');
    expect(generateId().length).toBeGreaterThan(0);
  });
});

describe('utils.load / save', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips a value through localStorage', () => {
    save('k', { a: 1, b: ['x'] });
    expect(load<{ a: number; b: string[] }>('k')).toEqual({ a: 1, b: ['x'] });
  });

  it('returns null when key is missing and no fallback given', () => {
    expect(load('missing')).toBeNull();
  });

  it('returns the fallback when key is missing', () => {
    expect(load('missing', 42)).toBe(42);
  });

  it('returns the fallback when stored JSON is corrupt', () => {
    localStorage.setItem('bad', '{not json');
    expect(load('bad', 'fallback')).toBe('fallback');
  });

  it('returns null on corrupt JSON when no fallback provided', () => {
    localStorage.setItem('bad', '{not json');
    expect(load('bad')).toBeNull();
  });
});
