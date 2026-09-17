"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Panels unmount when you switch tabs. Without this, each remount would
 * re-read the props from the original page load and silently drop everything
 * added or edited since. The cache keeps each panel's working data alive for
 * the life of the page, and lets siblings (tab count badges, the Team panel
 * reading todos) see the same live data.
 *
 * Usage inside a panel, replacing `useState(initial)` for its main dataset:
 *
 *   const [todos, setTodos] = usePanelState("todos", initial);
 *
 * Keys in use: initiatives, todos, leads, events, outreach, brands,
 * resources, notes, chat, members.
 */

type Store = {
  get: (key: string) => unknown;
  has: (key: string) => boolean;
  set: (key: string, value: unknown) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
  version: () => number;
};

function createStore(): Store {
  const data = new Map<string, unknown>();
  const listeners = new Set<() => void>();
  let version = 0;
  const emit = () => {
    version++;
    listeners.forEach((l) => l());
  };
  return {
    get: (k) => data.get(k),
    has: (k) => data.has(k),
    set: (k, v) => {
      if (data.get(k) === v) return;
      data.set(k, v);
      emit();
    },
    clear: () => {
      data.clear();
      emit();
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    version: () => version,
  };
}

const PanelCacheContext = createContext<Store | null>(null);

/**
 * `resetKey` must change whenever the server sends fresh props (for example
 * after router.refresh()), so fresh data wins over the cache.
 */
export function PanelCacheProvider({ resetKey, children }: { resetKey: unknown; children: React.ReactNode }) {
  const store = useMemo(createStore, []);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    store.clear();
  }, [resetKey, store]);
  return <PanelCacheContext.Provider value={store}>{children}</PanelCacheContext.Provider>;
}

/** Drop-in for `useState(initial)` that survives tab switches. Works without a provider too. */
export function usePanelState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const store = useContext(PanelCacheContext);
  const [value, setValue] = useState<T>(() => (store?.has(key) ? (store.get(key) as T) : initial));
  useEffect(() => {
    store?.set(key, value);
  }, [store, key, value]);

  // `initial` only changes identity when the server sends fresh props
  // (router.refresh, deep-link navigation). A mounted panel adopts them.
  // Callers must pass the server prop itself, never a derived array.
  const seen = useRef(initial);
  useEffect(() => {
    if (seen.current === initial) return;
    seen.current = initial;
    setValue(initial);
  }, [initial]);

  return [value, setValue];
}

/** Read-only live view of another panel's data (falls back to the server props). */
export function usePanelValue<T>(key: string, fallback: T): T {
  const store = useContext(PanelCacheContext);
  const subscribe = useCallback((l: () => void) => (store ? store.subscribe(l) : () => {}), [store]);
  useSyncExternalStore(subscribe, () => store?.version() ?? 0, () => 0);
  return store?.has(key) ? (store.get(key) as T) : fallback;
}
