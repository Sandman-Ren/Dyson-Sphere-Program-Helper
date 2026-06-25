import { useCallback, useMemo, useState } from 'react';
import {
  loadStoredSetups, saveStoredSetups, canonicalSnapshotKey, encodeSetupUrl,
  type SetupSnapshot, type StoredSetups,
} from '../lib/setups.js';

let setupSeq = 0;

export interface SetupListItem { id: string; name: string; }

export interface SetupsState {
  setups: SetupListItem[];
  activeId: string | null;
  activeName: string | null;
  isDirty: boolean;
  load: (id: string) => void;
  save: () => void;
  saveAs: (name: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  shareUrl: () => string;
}

export interface UseSetupsArgs {
  getSnapshot: () => SetupSnapshot;
  applySnapshot: (snapshot: SetupSnapshot) => void;
}

export function useSetups({ getSnapshot, applySnapshot }: UseSetupsArgs): SetupsState {
  const [store, setStore] = useState<StoredSetups>(() => {
    const loaded = loadStoredSetups();
    for (const s of loaded.setups) {
      const n = Number(s.id.replace(/^s/, ''));
      if (Number.isFinite(n) && n >= setupSeq) setupSeq = n + 1;
    }
    return loaded;
  });

  const persist = useCallback((next: StoredSetups) => {
    setStore(next);
    saveStoredSetups(next);
  }, []);

  const activeSetup = useMemo(
    () => store.setups.find((s) => s.id === store.activeId) ?? null,
    [store],
  );
  const activeKey = activeSetup ? canonicalSnapshotKey(activeSetup.snapshot) : null;
  const isDirty = activeKey != null && activeKey !== canonicalSnapshotKey(getSnapshot());

  const load = useCallback((id: string) => {
    setStore((prev) => {
      const found = prev.setups.find((s) => s.id === id);
      if (!found) return prev;
      applySnapshot(found.snapshot);
      const next = { ...prev, activeId: id };
      saveStoredSetups(next);
      return next;
    });
  }, [applySnapshot]);

  const save = useCallback(() => {
    if (!store.activeId) return;
    const snapshot = getSnapshot();
    persist({
      ...store,
      setups: store.setups.map((s) => (s.id === store.activeId ? { ...s, snapshot } : s)),
    });
  }, [store, getSnapshot, persist]);

  const saveAs = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const snapshot = getSnapshot();
    const existing = store.setups.find((s) => s.name === trimmed);
    if (existing) {
      persist({
        ...store,
        setups: store.setups.map((s) => (s.id === existing.id ? { ...s, snapshot } : s)),
        activeId: existing.id,
      });
      return;
    }
    const id = `s${setupSeq++}`;
    persist({ ...store, setups: [...store.setups, { id, name: trimmed, snapshot }], activeId: id });
  }, [store, getSnapshot, persist]);

  const rename = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    persist({ ...store, setups: store.setups.map((s) => (s.id === id ? { ...s, name: trimmed } : s)) });
  }, [store, persist]);

  const remove = useCallback((id: string) => {
    persist({
      ...store,
      setups: store.setups.filter((s) => s.id !== id),
      activeId: store.activeId === id ? null : store.activeId,
    });
  }, [store, persist]);

  const shareUrl = useCallback(() => {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?s=${encodeSetupUrl(getSnapshot())}${window.location.hash}`;
  }, [getSnapshot]);

  const setups = useMemo<SetupListItem[]>(
    () => store.setups.map((s) => ({ id: s.id, name: s.name })),
    [store],
  );

  return {
    setups,
    activeId: store.activeId,
    activeName: activeSetup?.name ?? null,
    isDirty,
    load, save, saveAs, rename, remove, shareUrl,
  };
}
