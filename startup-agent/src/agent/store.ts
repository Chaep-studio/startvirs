/**
 * Generic CRUD store backed by localStorage.
 * Eliminates duplicated load/save/reset/add/update/delete patterns
 * across skills.ts, agents.ts, and models.ts.
 */
import { load, save, generateId } from '../utils';

export interface StoreOptions<T extends { id: string }> {
  storageKey: string;
  defaults: T[];
}

export interface Store<T extends { id: string }> {
  load: () => T[];
  save: (items: T[]) => void;
  reset: () => T[];
  add: (items: T[], item: Omit<T, 'id'>) => T[];
  update: (items: T[], updated: T) => T[];
  remove: (items: T[], id: string) => T[];
}

export function createStore<T extends { id: string }>(opts: StoreOptions<T>): Store<T> {
  const { storageKey, defaults } = opts;

  return {
    load(): T[] {
      const saved = load<T[]>(storageKey);
      if (saved && saved.length > 0) return saved;
      save(storageKey, defaults);
      return [...defaults];
    },

    save(items: T[]): void {
      save(storageKey, items);
    },

    reset(): T[] {
      save(storageKey, defaults);
      return [...defaults];
    },

    add(items: T[], item: Omit<T, 'id'>): T[] {
      const next = [...items, { ...item, id: generateId() } as T];
      save(storageKey, next);
      return next;
    },

    update(items: T[], updated: T): T[] {
      const next = items.map((x) => (x.id === updated.id ? updated : x));
      save(storageKey, next);
      return next;
    },

    remove(items: T[], id: string): T[] {
      const next = items.filter((x) => x.id !== id);
      save(storageKey, next);
      return next;
    },
  };
}
