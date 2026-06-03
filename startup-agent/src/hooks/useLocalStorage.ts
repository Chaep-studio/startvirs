import { useState, useCallback } from 'react';

export function useLocalStorage<T>(key: string, initial: T): [T, (val: T) => void] {
  const [stored, setStored] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const setValue = useCallback(
    (val: T) => {
      setStored(val);
      localStorage.setItem(key, JSON.stringify(val));
    },
    [key]
  );

  return [stored, setValue];
}