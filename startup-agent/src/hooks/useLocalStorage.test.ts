import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLocalStorage } from './useLocalStorage';

beforeEach(() => {
  localStorage.clear();
});

describe('useLocalStorage', () => {
  it('returns the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('k', 'init'));
    expect(result.current[0]).toBe('init');
  });

  it('reads a previously stored value on mount', () => {
    localStorage.setItem('k', JSON.stringify('stored'));
    const { result } = renderHook(() => useLocalStorage('k', 'init'));
    expect(result.current[0]).toBe('stored');
  });

  it('falls back to the initial value when stored JSON is corrupt', () => {
    localStorage.setItem('k', '{not json');
    const { result } = renderHook(() => useLocalStorage('k', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('updates state and persists to localStorage when set', () => {
    const { result } = renderHook(() => useLocalStorage<number>('count', 0));
    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
    expect(JSON.parse(localStorage.getItem('count')!)).toBe(5);
  });

  it('supports object values', () => {
    const { result } = renderHook(() =>
      useLocalStorage<{ a: number }>('obj', { a: 1 })
    );
    act(() => result.current[1]({ a: 2 }));
    expect(result.current[0]).toEqual({ a: 2 });
    expect(JSON.parse(localStorage.getItem('obj')!)).toEqual({ a: 2 });
  });
});
