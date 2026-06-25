# Saved Production Setups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save the Calculator's working state as named setups, switch between them, auto-restore the last one, and share a setup via URL.

**Architecture:** A pure `setups.ts` module handles serialization, localStorage, URL encode/decode, and sanitization (Vitest-covered). `useCalculator` gains `getSnapshot()`/`applySnapshot()`. A `useSetups` hook manages the named list + dirty tracking. A `SetupBar` component (above Targets) drives save/load/rename/delete/share, and `App` wires startup URL-import / auto-restore.

**Tech Stack:** React 19 + TS 5.6, Vite 6, Tailwind v4, `radix-ui` 1.4.3 (Dialog), Vitest (node env), react-i18next.

## Global Constraints

- **Always-dark theme** — never use `dark:`; never hardcode colors. Use semantic classes/vars (`text-foreground`, `bg-card`, `border-border`, `text-primary`, `text-muted-foreground`, …).
- **Local imports use `.js` extension** (e.g. `from '../lib/setups.js'`).
- **lucide icons** imported one-per-file from `lucide-react/dist/esm/icons/<name>`.
- Use **UI primitives** in `src/web/ui/` over raw form controls.
- **i18n** via `useTranslation('ui')` / `t()`. `en/ui.ts` is source of truth; `zh/ui.ts` is typed `: UiResource` (key parity enforced by tsc). Game names via `useNames()`.
- **Pure layers stay pure**: `src/web/lib/setups.ts` must NOT import `src/web/data.js`/React — validity predicates are injected.
- **Machine tiers stay global** (`dsp-machine-tiers`) — never part of a setup snapshot.
- Test gate (node env, no jsdom): `npx tsc -b && npm test`. Hooks/components are verified by `tsc` + manual browser, not unit tests.

---

### Task 1: Pure setups module (`setups.ts`)

**Files:**
- Create: `src/web/lib/setups.ts`
- Test: `src/web/lib/setups.test.ts`

**Interfaces:**
- Consumes: `MachineOverrides`, `RecipeOverrides` from `../../calculator/index.js`; `TimeUnit` (type-only) from `../hooks/useCalculator.js`.
- Produces:
  - `interface SetupSnapshot { v: 1; targets: SnapshotTarget[]; displayUnit: TimeUnit; proliferatorId: string; machineOverrides: MachineOverrides; recipeOverrides: RecipeOverrides[] }`
  - `interface SnapshotTarget { item: string; amount: number; unit: TimeUnit }`
  - `interface StoredSetup { id: string; name: string; snapshot: SetupSnapshot }`
  - `interface StoredSetups { v: 1; setups: StoredSetup[]; activeId: string | null }`
  - `interface SnapshotValidators { isValidItem(id): boolean; isValidMachine(id): boolean; isValidProliferator(id): boolean }`
  - `loadStoredSetups(): StoredSetups`, `saveStoredSetups(s): void`
  - `encodeSetupUrl(snapshot): string`, `decodeSetupUrl(raw): SetupSnapshot | null`
  - `sanitizeSnapshot(input: unknown, v: SnapshotValidators): SetupSnapshot`
  - `canonicalSnapshotKey(s: SetupSnapshot): string`

- [ ] **Step 1: Write the failing test**

Create `src/web/lib/setups.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  encodeSetupUrl, decodeSetupUrl, sanitizeSnapshot, canonicalSnapshotKey,
  type SetupSnapshot, type SnapshotValidators,
} from './setups.js';

const validators: SnapshotValidators = {
  isValidItem: (id) => ['iron-ingot', 'copper-ingot', 'circuit-board'].includes(id),
  isValidMachine: (id) => ['assembler-mk1', 'smelter-1'].includes(id),
  isValidProliferator: (id) => id === 'none' || id === 'proliferator-mk3',
};

const snap: SetupSnapshot = {
  v: 1,
  targets: [
    { item: 'iron-ingot', amount: 60, unit: 'minute' },
    { item: 'circuit-board', amount: 30, unit: 'second' },
  ],
  displayUnit: 'minute',
  proliferatorId: 'proliferator-mk3',
  machineOverrides: { 'iron-ingot': 'smelter-1' },
  recipeOverrides: [{}, { 'root/copper-ingot': 'copper-ingot-alt' }],
};

describe('setups', () => {
  it('round-trips through URL encode/decode', () => {
    const decoded = decodeSetupUrl(encodeSetupUrl(snap));
    expect(decoded).toEqual(snap);
  });

  it('decodeSetupUrl returns null on garbage', () => {
    expect(decodeSetupUrl('not-base64-$$$')).toBeNull();
    expect(decodeSetupUrl(encodeSetupUrl({ ...snap, v: 2 as unknown as 1 }))).toBeNull();
  });

  it('canonicalSnapshotKey is insensitive to machineOverrides key order', () => {
    const a = { ...snap, machineOverrides: { x: 'assembler-mk1', y: 'smelter-1' } };
    const b = { ...snap, machineOverrides: { y: 'smelter-1', x: 'assembler-mk1' } };
    expect(canonicalSnapshotKey(a)).toBe(canonicalSnapshotKey(b));
  });

  it('canonicalSnapshotKey is sensitive to target order', () => {
    const reversed = { ...snap, targets: [...snap.targets].reverse() };
    expect(canonicalSnapshotKey(reversed)).not.toBe(canonicalSnapshotKey(snap));
  });

  it('sanitizeSnapshot drops invalid targets, machines, proliferator, and bad units', () => {
    const dirty = {
      v: 1,
      targets: [
        { item: 'iron-ingot', amount: -5, unit: 'fortnight' },
        { item: 'not-a-real-item', amount: 10, unit: 'minute' },
      ],
      displayUnit: 'aeon',
      proliferatorId: 'proliferator-fake',
      machineOverrides: { 'iron-ingot': 'smelter-1', 'iron-ingot-2': 'ghost-machine' },
      recipeOverrides: [{ a: 'b' }, { c: 'd' }],
    };
    const out = sanitizeSnapshot(dirty, validators);
    expect(out.targets).toEqual([{ item: 'iron-ingot', amount: 0, unit: 'minute' }]);
    expect(out.displayUnit).toBe('minute');
    expect(out.proliferatorId).toBe('none');
    expect(out.machineOverrides).toEqual({ 'iron-ingot': 'smelter-1' });
    expect(out.recipeOverrides).toEqual([{ a: 'b' }]);
  });

  it('sanitizeSnapshot falls back to one empty target when none survive', () => {
    const out = sanitizeSnapshot({ v: 1, targets: [] }, validators);
    expect(out.targets).toEqual([{ item: '', amount: 60, unit: 'minute' }]);
    expect(out.recipeOverrides).toEqual([{}]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- setups`
Expected: FAIL (`Cannot find module './setups.js'`).

- [ ] **Step 3: Write minimal implementation**

Create `src/web/lib/setups.ts`:

```ts
import type { MachineOverrides, RecipeOverrides } from '../../calculator/index.js';
import type { TimeUnit } from '../hooks/useCalculator.js';

export interface SnapshotTarget { item: string; amount: number; unit: TimeUnit; }

export interface SetupSnapshot {
  v: 1;
  targets: SnapshotTarget[];
  displayUnit: TimeUnit;
  proliferatorId: string;
  machineOverrides: MachineOverrides;
  recipeOverrides: RecipeOverrides[];
}

export interface StoredSetup { id: string; name: string; snapshot: SetupSnapshot; }
export interface StoredSetups { v: 1; setups: StoredSetup[]; activeId: string | null; }

export interface SnapshotValidators {
  isValidItem(id: string): boolean;
  isValidMachine(id: string): boolean;
  isValidProliferator(id: string): boolean;
}

const STORAGE_KEY = 'dsp-setups';
const UNITS: TimeUnit[] = ['second', 'minute', 'hour'];
const emptyStore = (): StoredSetups => ({ v: 1, setups: [], activeId: null });

// ---- localStorage ----
export function loadStoredSetups(): StoredSetups {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.setups)) return emptyStore();
    return parsed as StoredSetups;
  } catch {
    return emptyStore();
  }
}

export function saveStoredSetups(s: StoredSetups): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore quota */ }
}

// ---- URL share (base64url of JSON, Unicode-safe, no deps) ----
function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSetupUrl(snapshot: SetupSnapshot): string {
  return toBase64Url(JSON.stringify(snapshot));
}

export function decodeSetupUrl(raw: string): SetupSnapshot | null {
  try {
    const parsed = JSON.parse(fromBase64Url(raw));
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.targets)) return null;
    return parsed as SetupSnapshot;
  } catch {
    return null;
  }
}

// ---- canonical key for dirty detection (sorted object keys; array order kept) ----
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    return Object.keys(src).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = stable(src[k]);
      return acc;
    }, {});
  }
  return value;
}
export function canonicalSnapshotKey(s: SetupSnapshot): string {
  return JSON.stringify(stable(s));
}

// ---- sanitization of untrusted input (decoded URLs / corrupt storage) ----
const isUnit = (u: unknown): u is TimeUnit => typeof u === 'string' && (UNITS as string[]).includes(u);

function sanitizeRecord(value: unknown): RecipeOverrides {
  const out: RecipeOverrides = {};
  if (value && typeof value === 'object') {
    for (const [k, val] of Object.entries(value as Record<string, unknown>)) {
      if (typeof val === 'string') out[k] = val;
    }
  }
  return out;
}

export function sanitizeSnapshot(input: unknown, v: SnapshotValidators): SetupSnapshot {
  const src = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
  const rawTargets = Array.isArray(src.targets) ? src.targets : [];
  const rawRecipes = Array.isArray(src.recipeOverrides) ? src.recipeOverrides : [];

  const targets: SnapshotTarget[] = [];
  const recipeOverrides: RecipeOverrides[] = [];
  rawTargets.forEach((t, i) => {
    const tt = (t && typeof t === 'object') ? t as Record<string, unknown> : {};
    const item = typeof tt.item === 'string' ? tt.item : '';
    if (item && !v.isValidItem(item)) return; // drop unknown product
    const amount = typeof tt.amount === 'number' && Number.isFinite(tt.amount) && tt.amount >= 0 ? tt.amount : 0;
    const unit = isUnit(tt.unit) ? tt.unit : 'minute';
    targets.push({ item, amount, unit });
    recipeOverrides.push(sanitizeRecord(rawRecipes[i]));
  });
  if (targets.length === 0) {
    targets.push({ item: '', amount: 60, unit: 'minute' });
    recipeOverrides.push({});
  }

  const machineOverrides: MachineOverrides = {};
  const mo = (src.machineOverrides && typeof src.machineOverrides === 'object')
    ? src.machineOverrides as Record<string, unknown> : {};
  for (const [item, machine] of Object.entries(mo)) {
    if (typeof machine === 'string' && v.isValidItem(item) && v.isValidMachine(machine)) {
      machineOverrides[item] = machine;
    }
  }

  const proliferatorId = typeof src.proliferatorId === 'string' && v.isValidProliferator(src.proliferatorId)
    ? src.proliferatorId : 'none';
  const displayUnit = isUnit(src.displayUnit) ? src.displayUnit : 'minute';

  return { v: 1, targets, displayUnit, proliferatorId, machineOverrides, recipeOverrides };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- setups`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -b
git add src/web/lib/setups.ts src/web/lib/setups.test.ts
git commit -m "feat: pure setups module (serialize, storage, url, sanitize)"
```

---

### Task 2: `useCalculator` snapshot bridge

**Files:**
- Modify: `src/web/hooks/useCalculator.ts`

**Interfaces:**
- Consumes: `SetupSnapshot` (type-only) from `../lib/setups.js`.
- Produces (added to `CalculatorState`): `getSnapshot(): SetupSnapshot`, `applySnapshot(s: SetupSnapshot): void`. `TimeUnit` remains exported from this file (so `setups.ts`'s type-only import resolves).

- [ ] **Step 1: Add the type import**

At the top of `src/web/hooks/useCalculator.ts`, add after the existing imports:

```ts
import type { SetupSnapshot } from '../lib/setups.js';
```

(`SetupSnapshot`↔`useCalculator` is a type-only cycle — fully erased at runtime, no import cycle.)

- [ ] **Step 2: Extend the `CalculatorState` interface**

In `interface CalculatorState`, add after the `shared: SharedComponentsResult;` line (inside the interface), before the closing `}`:

```ts
  getSnapshot: () => SetupSnapshot;
  applySnapshot: (snapshot: SetupSnapshot) => void;
```

- [ ] **Step 3: Implement the two methods**

In `useCalculator`, after the `proliferator` `useMemo` (around the `const solved = useMemo` line) — but anywhere among the callbacks is fine — add:

```ts
  const getSnapshot = useCallback((): SetupSnapshot => ({
    v: 1,
    targets: targets.map((t) => ({ item: t.item, amount: t.amount, unit: t.unit })),
    displayUnit,
    proliferatorId,
    machineOverrides,
    recipeOverrides: targets.map((t) => recipeOverridesByTarget[t.id] ?? {}),
  }), [targets, displayUnit, proliferatorId, machineOverrides, recipeOverridesByTarget]);

  const applySnapshot = useCallback((snapshot: SetupSnapshot) => {
    const restored = snapshot.targets.map((t) => ({
      id: `t${rowSeq++}`, item: t.item, amount: t.amount, unit: t.unit,
    }));
    const overrides: Record<string, RecipeOverrides> = {};
    restored.forEach((t, i) => {
      const ro = snapshot.recipeOverrides[i];
      if (ro && Object.keys(ro).length > 0) overrides[t.id] = { ...ro };
    });
    setTargets(restored.length > 0 ? restored : [newTarget('')]);
    setDisplayUnit(snapshot.displayUnit);
    setProliferatorId(snapshot.proliferatorId);
    setMachineOverrides({ ...snapshot.machineOverrides });
    setRecipeOverridesByTarget(overrides);
  }, []);
```

- [ ] **Step 4: Export the methods from the hook**

In the `return { … }` object at the end of `useCalculator`, add `getSnapshot, applySnapshot,` (e.g. right after `focusedItem, setFocusedItem,`).

- [ ] **Step 5: Typecheck, test, commit**

```bash
npx tsc -b
npm test
git add src/web/hooks/useCalculator.ts
git commit -m "feat: getSnapshot/applySnapshot bridge on useCalculator"
```
Expected: `tsc` clean, all existing tests still pass.

---

### Task 3: `Dialog` UI primitive

**Files:**
- Modify: `src/web/ui/index.tsx`

**Interfaces:**
- Produces: `Dialog`, `DialogTrigger`, `DialogClose`, `DialogContent`, `DialogTitle`, `DialogDescription`.

- [ ] **Step 1: Add `Dialog` to the radix import**

Change the radix import line (currently `import { Tabs as RTabs, Select as RSelect, Tooltip as RTooltip } from 'radix-ui';`) to include Dialog:

```ts
import { Tabs as RTabs, Select as RSelect, Tooltip as RTooltip, Dialog as RDialog } from 'radix-ui';
```

Add the close-icon import near the other lucide imports at the top:

```ts
import XIcon from 'lucide-react/dist/esm/icons/x';
```

- [ ] **Step 2: Append the Dialog primitives**

At the end of `src/web/ui/index.tsx`, add:

```tsx
// ---- Dialog ----
export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof RDialog.Content>) {
  return (
    <RDialog.Portal>
      <RDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <RDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-border bg-card p-4 shadow-lg focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <RDialog.Close
          className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </RDialog.Close>
      </RDialog.Content>
    </RDialog.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof RDialog.Title>) {
  return <RDialog.Title className={cn('text-sm font-semibold text-foreground', className)} {...props} />;
}
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof RDialog.Description>) {
  return <RDialog.Description className={cn('mt-1 text-xs text-muted-foreground', className)} {...props} />;
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc -b
git add src/web/ui/index.tsx
git commit -m "feat: themed Dialog UI primitive on radix"
```
Expected: `tsc` clean.

---

### Task 4: `useSetups` hook

**Files:**
- Create: `src/web/hooks/useSetups.ts`

**Interfaces:**
- Consumes: `loadStoredSetups`, `saveStoredSetups`, `canonicalSnapshotKey`, `encodeSetupUrl`, `SetupSnapshot`, `StoredSetups` from `../lib/setups.js`.
- Produces:
  - `interface SetupListItem { id: string; name: string }`
  - `interface SetupsState { setups: SetupListItem[]; activeId: string | null; activeName: string | null; isDirty: boolean; load(id): void; save(): void; saveAs(name): void; rename(id, name): void; remove(id): void; shareUrl(): string }`
  - `interface UseSetupsArgs { getSnapshot: () => SetupSnapshot; applySnapshot: (s: SetupSnapshot) => void }`
  - `useSetups(args: UseSetupsArgs): SetupsState`

- [ ] **Step 1: Create the hook**

Create `src/web/hooks/useSetups.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc -b
git add src/web/hooks/useSetups.ts
git commit -m "feat: useSetups hook (named setups, dirty tracking, share)"
```
Expected: `tsc` clean.

---

### Task 5: `SetupBar` component + i18n keys

**Files:**
- Create: `src/web/components/SetupBar.tsx`
- Modify: `src/web/i18n/locales/en/ui.ts`
- Modify: `src/web/i18n/locales/zh/ui.ts`

**Interfaces:**
- Consumes: `SetupsState` from `../hooks/useSetups.js`; UI primitives incl. `Dialog`/`DialogContent`/`DialogTitle` from `../ui/index.js`.
- Produces: `export function SetupBar({ setups }: { setups: SetupsState }): JSX.Element`.

- [ ] **Step 1: Add the `setups` i18n group (en — source of truth)**

In `src/web/i18n/locales/en/ui.ts`, add a `setups` group to the `ui` object (e.g. after the `machines: { … },` block, before `language:`):

```ts
  setups: {
    label: 'Setup',
    none: 'No saved setups',
    unsaved: 'Unsaved',
    save: 'Save',
    saveAs: 'Save As',
    rename: 'Rename setup',
    delete: 'Delete setup',
    deleteConfirm: 'Delete setup "{{name}}"?',
    share: 'Share',
    copied: 'Copied!',
    namePlaceholder: 'Setup name',
    cancel: 'Cancel',
    confirm: 'Save',
  },
```

- [ ] **Step 2: Add the matching `setups` group (zh)**

In `src/web/i18n/locales/zh/ui.ts`, add the parallel group (same key set — tsc enforces parity via `: UiResource`):

```ts
  setups: {
    label: '方案',
    none: '暂无保存的方案',
    unsaved: '未保存',
    save: '保存',
    saveAs: '另存为',
    rename: '重命名方案',
    delete: '删除方案',
    deleteConfirm: '删除方案“{{name}}”？',
    share: '分享',
    copied: '已复制！',
    namePlaceholder: '方案名称',
    cancel: '取消',
    confirm: '保存',
  },
```

- [ ] **Step 3: Create the component**

Create `src/web/components/SetupBar.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SaveIcon from 'lucide-react/dist/esm/icons/save';
import CopyPlusIcon from 'lucide-react/dist/esm/icons/copy-plus';
import PencilIcon from 'lucide-react/dist/esm/icons/pencil';
import Trash2Icon from 'lucide-react/dist/esm/icons/trash-2';
import Share2Icon from 'lucide-react/dist/esm/icons/share-2';
import type { SetupsState } from '../hooks/useSetups.js';
import {
  Button, Input, Label,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogTitle,
} from '../ui/index.js';

type DialogMode = { kind: 'saveAs' | 'rename'; value: string } | null;

export function SetupBar({ setups }: { setups: SetupsState }) {
  const { t } = useTranslation('ui');
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [copied, setCopied] = useState(false);

  const openSaveAs = () => setDialog({ kind: 'saveAs', value: setups.activeName ?? '' });
  const openRename = () => { if (setups.activeId) setDialog({ kind: 'rename', value: setups.activeName ?? '' }); };

  const confirmDialog = () => {
    if (!dialog || !dialog.value.trim()) return;
    if (dialog.kind === 'saveAs') setups.saveAs(dialog.value);
    else if (setups.activeId) setups.rename(setups.activeId, dialog.value);
    setDialog(null);
  };

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(setups.shareUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const onDelete = () => {
    if (setups.activeId && window.confirm(t('setups.deleteConfirm', { name: setups.activeName ?? '' }))) {
      setups.remove(setups.activeId);
    }
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Label className="mb-0 mr-1 text-muted-foreground">{t('setups.label')}</Label>

      {setups.setups.length > 0 ? (
        <Select value={setups.activeId ?? ''} onValueChange={(id) => setups.load(id)}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t('setups.unsaved')} /></SelectTrigger>
          <SelectContent>
            {setups.setups.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}{setups.activeId === s.id && setups.isDirty ? ' •' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs text-muted-foreground">{t('setups.none')}</span>
      )}

      <Button
        variant="outline" size="sm"
        onClick={() => setups.save()}
        disabled={!setups.activeId || !setups.isDirty}
      >
        <SaveIcon className="mr-1 size-4" />{t('setups.save')}
      </Button>
      <Button variant="outline" size="sm" onClick={openSaveAs}>
        <CopyPlusIcon className="mr-1 size-4" />{t('setups.saveAs')}
      </Button>

      {setups.activeId && (
        <>
          <Button variant="ghost" size="sm" onClick={openRename} aria-label={t('setups.rename')}>
            <PencilIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} aria-label={t('setups.delete')}>
            <Trash2Icon className="size-4" />
          </Button>
        </>
      )}

      <Button variant="ghost" size="sm" onClick={onShare}>
        <Share2Icon className="mr-1 size-4" />{copied ? t('setups.copied') : t('setups.share')}
      </Button>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogTitle>{dialog?.kind === 'rename' ? t('setups.rename') : t('setups.saveAs')}</DialogTitle>
          <form
            onSubmit={(e) => { e.preventDefault(); confirmDialog(); }}
            className="mt-3 flex flex-col gap-3"
          >
            <Input
              autoFocus
              value={dialog?.value ?? ''}
              onChange={(e) => setDialog((d) => (d ? { ...d, value: e.target.value } : d))}
              placeholder={t('setups.namePlaceholder')}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDialog(null)}>
                {t('setups.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={!dialog?.value.trim()}>
                {t('setups.confirm')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck, test, commit**

```bash
npx tsc -b
npm test
git add src/web/components/SetupBar.tsx src/web/i18n/locales/en/ui.ts src/web/i18n/locales/zh/ui.ts
git commit -m "feat: SetupBar component + setups i18n strings"
```
Expected: `tsc` clean (zh parity OK), tests pass.

---

### Task 6: Wire into `App` — render + startup import/restore

**Files:**
- Modify: `src/web/App.tsx`

**Interfaces:**
- Consumes: `useSetups` from `./hooks/useSetups.js`; `SetupBar` from `./components/SetupBar.js`; `decodeSetupUrl`, `sanitizeSnapshot` from `./lib/setups.js`; `graph`, `proliferators`, `machineById` from `./data.js`.

- [ ] **Step 1: Add imports**

In `src/web/App.tsx`, add:

```ts
import { useSetups } from './hooks/useSetups.js';
import { SetupBar } from './components/SetupBar.js';
import { decodeSetupUrl, sanitizeSnapshot, type SnapshotValidators } from './lib/setups.js';
```

And extend the existing `./data.js` import to include `machineById` (add it to the named list alongside `graph, proliferators, techById, meta`).

- [ ] **Step 2: Create the `useSetups` instance + validators in `App`**

Inside `App()`, after `const calc = useCalculator();`, add:

```ts
  const setups = useSetups({ getSnapshot: calc.getSnapshot, applySnapshot: calc.applySnapshot });
```

Above the `App` component (module scope, after imports), add the validators (data is module-constant, so they need no memoization):

```ts
const setupValidators: SnapshotValidators = {
  isValidItem: (id) => graph.itemToRecipe.has(id),
  isValidMachine: (id) => machineById.has(id),
  isValidProliferator: (id) => id === 'none' || proliferators.some((p) => p.id === id),
};
```

- [ ] **Step 3: Add the startup import / auto-restore effect**

Inside `App()`, add a mount-only effect (next to the existing `document.title` effect):

```ts
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('s');
    if (shared) {
      const decoded = decodeSetupUrl(shared);
      if (decoded) calc.applySnapshot(sanitizeSnapshot(decoded, setupValidators));
      params.delete('s');
      const qs = params.toString();
      window.history.replaceState(
        null, '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
      );
      return; // imported as unsaved — leave activeId null
    }
    if (setups.activeId) setups.load(setups.activeId);
    // mount-only: restore last setup or import a shared one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 4: Pass `setups` to `CalculatorTab` and render `SetupBar`**

Change the calculator tab content render:

```tsx
        <TabsContent value="calculator" className="flex-1 overflow-auto">
          <CalculatorTab calc={calc} setups={setups} />
        </TabsContent>
```

Update the `CalculatorTab` signature and render the bar as the first child of its outer `div`:

```tsx
function CalculatorTab({ calc, setups }: {
  calc: ReturnType<typeof useCalculator>;
  setups: ReturnType<typeof useSetups>;
}) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const proliferator = proliferators.find((p) => p.id === calc.proliferatorId) ?? null;
  const onFocus = (item: string) => calc.setFocusedItem(calc.focusedItem === item ? null : item);

  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-5">
      <SetupBar setups={setups} />
      {/* Targets */}
      <Section title={t('calculator.targets')}>
```

(Leave the rest of `CalculatorTab` unchanged.)

- [ ] **Step 5: Typecheck, test, build**

```bash
npx tsc -b
npm test
npm run build
```
Expected: all clean.

- [ ] **Step 6: Browser-verify (manual)**

Run `npm run dev`, then in the browser confirm:
1. Configure targets + proliferator + a machine override + a recipe override → **Save As** "Plan A" → picker shows "Plan A".
2. Edit an amount → name shows ` •` (dirty) and **Save** enables → click **Save** → dirty clears.
3. **Save As** "Plan B" (different targets) → switch picker between A and B → state swaps incl. overrides.
4. **Reload** the page → last active setup auto-restores (no dirty dot).
5. **Rename** Plan A → name updates in picker. **Delete** Plan B → removed; picker falls back to unsaved.
6. **Share** → URL copied ("Copied!"); open it in a fresh tab → loads that state as **Unsaved**; URL bar has no `?s=` after load.
7. Switch language to 中文 → all setup controls localized.

- [ ] **Step 7: Commit**

```bash
git add src/web/App.tsx
git commit -m "feat: wire SetupBar into Calculator with startup import/restore"
```

---

## Self-Review notes

- **Spec coverage:** named CRUD (T4/T5), full snapshot incl. positional recipe overrides (T1/T2), dirty tracking (T4 `isDirty` + T5 `•`), Save/Save As fork (T4/T5), URL share + import + param strip (T1/T4/T6), auto-restore (T6), machine tiers excluded (T2 `getSnapshot` omits them), SetupBar above Targets (T6), Dialog primitive (T3), sanitization (T1), i18n parity (T5). All covered.
- **Type consistency:** `getSnapshot`/`applySnapshot` signatures match across T2→T4→T6; `SetupsState`/`SetupSnapshot`/`SnapshotValidators` names consistent T1→T4→T5→T6.
- **Pure-layer rule:** `setups.ts` imports only calculator types + a type-only `TimeUnit` (erased); validity injected via `SnapshotValidators`. Holds.
```
