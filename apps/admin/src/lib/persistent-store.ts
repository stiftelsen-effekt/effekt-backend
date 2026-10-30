/**
 * A tiny localStorage-backed store shared across components and tabs. Used for state that
 * must survive a reload (review queue, flow progress, saved views) but has no server home
 * yet. Versioned: bump `version` when the stored shape changes and old data is dropped.
 */
import { useSyncExternalStore } from "react";

export type PersistentStore<T> = {
  get(): T;
  set(next: T | ((current: T) => T)): void;
  subscribe(listener: () => void): () => void;
  use(): T;
};

export function createPersistentStore<T>(key: string, initial: T, version = 1): PersistentStore<T> {
  const storageKey = `effekt-admin:${key}:v${version}`;
  const listeners = new Set<() => void>();

  function load(): T {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  }

  let value: T = typeof window === "undefined" ? initial : load();

  function set(next: T | ((current: T) => T)) {
    value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // storage full or blocked: keep the in-memory value
    }
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        value = load();
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  const store: PersistentStore<T> = {
    get: () => value,
    set,
    subscribe,
    use: () =>
      useSyncExternalStore(
        subscribe,
        () => value,
        () => initial,
      ),
  };
  return store;
}

const keyedStores = new Map<string, PersistentStore<unknown>>();

/**
 * useState that survives reloads, for flow progress (current step, a half-filled form).
 * Clear it when the flow completes.
 */
export function usePersistentState<T>(key: string, initial: T) {
  let existing = keyedStores.get(key) as PersistentStore<T> | undefined;
  if (!existing) {
    existing = createPersistentStore<T>(`state:${key}`, initial);
    keyedStores.set(key, existing as PersistentStore<unknown>);
  }
  const store = existing;
  const value = store.use();
  return [value, store.set, () => store.set(initial)] as const;
}
