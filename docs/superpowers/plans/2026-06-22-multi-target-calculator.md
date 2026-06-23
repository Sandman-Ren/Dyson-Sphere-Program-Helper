# Multi-Target Calculator + Shared Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Calculator to accept multiple production targets and surface the components shared across them as a dependency tree (most-complex → raw), and remove the separate Planner tab.

**Architecture:** Reuse the existing per-target tree solver (`solve()`); add a pure aggregation module (`shared-components.ts`) that combines per-target plans into shared totals and a nested shared-components tree. Rewrite `useCalculator`/the Calculator tab for a target list while preserving single-target behavior. Delete the architect Planner (tab, components, `planner/` engine).

**Tech Stack:** React 19, TypeScript 5.6, Vite 6, Tailwind v4, react-i18next, Vitest.

## Global Constraints

- **Engine purity:** files under `src/calculator/` must not import from `src/web`. Vitest-covered.
- **Local module imports use the `.js` extension** (e.g. `from './solver.js'`).
- **Always-dark theme:** never use `dark:`; never hardcode colors — use semantic classes / CSS vars (`text-foreground`, `bg-card`, `border-border`, `text-primary`, `text-amber`, `text-muted-foreground`).
- **lucide icons** import one-per-file from `lucide-react/dist/esm/icons/<name>`.
- **UI primitives** from `src/web/ui/index.js`; never raw form controls.
- **i18n:** no hardcoded display text. Keys in `src/web/i18n/locales/en/ui.ts` (source) + `zh/ui.ts` (typed `: UiResource`, key parity enforced by tsc + the `i18n` test). Game names via `useNames()`.
- **No DOM test env:** Vitest runs in node — no jsdom / `@testing-library/react`. Do NOT add them. React hooks/components are verified by `npx tsc -b` + browser, not unit tests. Pure engine code IS unit-tested.
- **Single-target parity:** a one-target list must reproduce today's Calculator behavior/numbers exactly.
- **Validation:** run `npx tsc -b` and `npm test` from `repositories/dsp-helper/main` before a task is done; UI tasks also run `npm run build`.
- **Git (user rule):** stage files individually (`git add <file>`), commit per task, never push. Commit-message trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Numeric tolerance:** `EPS = 1e-9`.

All commands run from `repositories/dsp-helper/main`.

---

### Task 1: Shared-components aggregation engine

A pure module: combine per-target plans into shared totals, the integer-ratio value list, and the nested shared-components tree.

**Files:**
- Create: `src/calculator/shared-components.ts`
- Create: `src/calculator/shared-components.test.ts`

**Interfaces:**
- Consumes: `ProductionPlan`, `ProductionNode` from `./types.js`.
- Produces:
  - `interface CombinedTotals { totalMachines: Record<string,number>; rawResources: Record<string,number>; totalPowerKW: number; proliferatorSpraysPerSecond: number }`
  - `combinePlans(plans: ProductionPlan[]): CombinedTotals`
  - `collectMachineCounts(plans: ProductionPlan[]): number[]`
  - `interface SharedComponentNode { item: string; combinedRatePerSecond: number; targetCount: number; children: SharedComponentNode[]; reference: boolean }`
  - `interface SharedComponentsResult { roots: SharedComponentNode[]; sharedCounts: Map<string,number> }`
  - `buildSharedComponents(plans: ProductionPlan[]): SharedComponentsResult`

> Refines spec §5.3: the result exposes `sharedCounts: Map<item, targetCount>` (membership + the `×N` badge) instead of a bare `sharedItemIds: Set`.

- [ ] **Step 1: Write the failing test**

Create `src/calculator/shared-components.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildRecipeGraph } from './recipe-graph.js';
import { solve } from './solver.js';
import { combinePlans, collectMachineCounts, buildSharedComponents } from './shared-components.js';
import type { Recipe, Machine } from '../data/schema.js';

const S: Machine = { id: 's', name: 'S', speed: 1, usageKW: 100, drainKW: 0, modules: 0, powerType: 'electric' };
const synth = (r: Recipe[]) => buildRecipeGraph(r, [S], { excludedRecipes: [], proliferableRecipes: [] });

// a and b both consume `shared`; `shared` is crafted from raw ore (mined).
const SHARED = synth([
  { id: 'a', name: 'a', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'a', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'b', name: 'b', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'b', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'shared', name: 'shared', time: 1, in: [{ id: 'ore', amount: 1 }], out: [{ id: 'shared', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'ore', name: 'ore', time: 1, in: [], out: [{ id: 'ore', amount: 1 }], producers: ['s'], flags: ['mining'] },
]);

describe('combinePlans', () => {
  it('single plan combines to that plan\'s totals (parity)', () => {
    const p = solve(SHARED, 'a', 2);
    const c = combinePlans([p]);
    expect(c.totalMachines).toEqual(p.totalMachines);
    expect(c.rawResources).toEqual(p.rawResources);
    expect(c.totalPowerKW).toBeCloseTo(p.totalPowerKW, 9);
  });
  it('sums machines and raws across plans', () => {
    const c = combinePlans([solve(SHARED, 'a', 2), solve(SHARED, 'b', 3)]);
    // shared: 2 + 3 = 5 crafts/s → ore 5/s
    expect(c.rawResources['ore']).toBeCloseTo(5, 9);
  });
});

describe('collectMachineCounts', () => {
  it('gathers every positive machinesNeeded across plans', () => {
    const counts = collectMachineCounts([solve(SHARED, 'a', 2)]);
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.every((n) => n > 0)).toBe(true);
  });
});

describe('buildSharedComponents', () => {
  it('is empty for a single target', () => {
    const r = buildSharedComponents([solve(SHARED, 'a', 1)]);
    expect(r.roots).toEqual([]);
    expect(r.sharedCounts.size).toBe(0);
  });

  it('detects a shared crafted item with combined rate and count', () => {
    const r = buildSharedComponents([solve(SHARED, 'a', 2), solve(SHARED, 'b', 3)]);
    expect(r.sharedCounts.get('shared')).toBe(2);
    expect(r.roots).toHaveLength(1);
    expect(r.roots[0]!.item).toBe('shared');
    expect(r.roots[0]!.combinedRatePerSecond).toBeCloseTo(5, 9);
    expect(r.roots[0]!.targetCount).toBe(2);
    expect(r.roots[0]!.reference).toBe(false);
    // 'ore' is mined → excluded from shared
    expect(r.sharedCounts.has('ore')).toBe(false);
  });

  it('nests a shared child under its nearest shared ancestor, ordered complex→raw', () => {
    // t1, t2 both consume X and Y; X→Y, Y→ore. X and Y shared (count 2).
    const g = synth([
      { id: 't1', name: 't1', time: 1, in: [{ id: 'x', amount: 1 }], out: [{ id: 't1', amount: 1 }], producers: ['s'], flags: [] },
      { id: 't2', name: 't2', time: 1, in: [{ id: 'x', amount: 1 }], out: [{ id: 't2', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'x', name: 'x', time: 1, in: [{ id: 'y', amount: 1 }], out: [{ id: 'x', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'y', name: 'y', time: 1, in: [{ id: 'ore', amount: 1 }], out: [{ id: 'y', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'ore', name: 'ore', time: 1, in: [], out: [{ id: 'ore', amount: 1 }], producers: ['s'], flags: ['mining'] },
    ]);
    const r = buildSharedComponents([solve(g, 't1', 1), solve(g, 't2', 1)]);
    expect(r.roots.map((n) => n.item)).toEqual(['x']);     // x is more complex → root
    expect(r.roots[0]!.children.map((n) => n.item)).toEqual(['y']);  // y nested under x
  });

  it('dedups a shared item reached from two shared parents (reference node)', () => {
    // t1, t2 both consume A and B; A→C, B→C; A,B,C all shared.
    const g = synth([
      { id: 't1', name: 't1', time: 1, in: [{ id: 'a', amount: 1 }, { id: 'b', amount: 1 }], out: [{ id: 't1', amount: 1 }], producers: ['s'], flags: [] },
      { id: 't2', name: 't2', time: 1, in: [{ id: 'a', amount: 1 }, { id: 'b', amount: 1 }], out: [{ id: 't2', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'a', name: 'a', time: 1, in: [{ id: 'c', amount: 1 }], out: [{ id: 'a', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'b', name: 'b', time: 1, in: [{ id: 'c', amount: 1 }], out: [{ id: 'b', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'c', name: 'c', time: 1, in: [{ id: 'ore', amount: 1 }], out: [{ id: 'c', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'ore', name: 'ore', time: 1, in: [], out: [{ id: 'ore', amount: 1 }], producers: ['s'], flags: ['mining'] },
    ]);
    const r = buildSharedComponents([solve(g, 't1', 1), solve(g, 't2', 1)]);
    expect(r.roots.map((n) => n.item).sort()).toEqual(['a', 'b']);   // a, b are roots
    const cNodes = r.roots.flatMap((n) => n.children).filter((n) => n.item === 'c');
    expect(cNodes).toHaveLength(2);                                   // c under both a and b
    expect(cNodes.filter((n) => n.reference === false)).toHaveLength(1); // full once
    expect(cNodes.filter((n) => n.reference === true)).toHaveLength(1);  // reference once
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared-components`
Expected: FAIL — `shared-components.js` not found.

- [ ] **Step 3: Implement the engine**

Create `src/calculator/shared-components.ts`:

```ts
import type { ProductionPlan, ProductionNode } from './types.js';

const EPS = 1e-9;

export interface CombinedTotals {
  totalMachines: Record<string, number>;
  rawResources: Record<string, number>;
  totalPowerKW: number;
  proliferatorSpraysPerSecond: number;
}

/** Sum machines, raws, power and sprays across per-target plans. */
export function combinePlans(plans: ProductionPlan[]): CombinedTotals {
  const totalMachines: Record<string, number> = {};
  const rawResources: Record<string, number> = {};
  let totalPowerKW = 0;
  let proliferatorSpraysPerSecond = 0;
  for (const plan of plans) {
    for (const [id, c] of Object.entries(plan.totalMachines)) totalMachines[id] = (totalMachines[id] ?? 0) + c;
    for (const [id, r] of Object.entries(plan.rawResources)) rawResources[id] = (rawResources[id] ?? 0) + r;
    totalPowerKW += plan.totalPowerKW;
    proliferatorSpraysPerSecond += plan.proliferatorSpraysPerSecond;
  }
  return { totalMachines, rawResources, totalPowerKW, proliferatorSpraysPerSecond };
}

/** Every node's fractional building count across all plans (for the integer-ratio multiplier). */
export function collectMachineCounts(plans: ProductionPlan[]): number[] {
  const values: number[] = [];
  const walk = (n: ProductionNode): void => {
    if (n.machinesNeeded > 0) values.push(n.machinesNeeded);
    for (const c of n.children) walk(c);
  };
  for (const plan of plans) walk(plan.root);
  return values;
}

export interface SharedComponentNode {
  item: string;
  combinedRatePerSecond: number;
  targetCount: number;
  children: SharedComponentNode[];
  reference: boolean;
}
export interface SharedComponentsResult {
  roots: SharedComponentNode[];
  /** shared item id → number of distinct targets producing it (≥2). */
  sharedCounts: Map<string, number>;
}

const isCrafted = (n: ProductionNode): boolean => n.recipe !== null && !n.mined;

/**
 * Build the nested tree of components shared across ≥2 targets, ordered
 * most-complex → raw, with combined rates and dedup reference nodes.
 */
export function buildSharedComponents(plans: ProductionPlan[]): SharedComponentsResult {
  const combinedRate = new Map<string, number>();
  const targetsByItem = new Map<string, Set<number>>();
  const nodesByItem = new Map<string, ProductionNode[]>();
  const depthByItem = new Map<string, number>();

  // Collect rates, per-target presence, occurrences, and production depth.
  const collect = (n: ProductionNode, ti: number): void => {
    (nodesByItem.get(n.item) ?? nodesByItem.set(n.item, []).get(n.item)!).push(n);
    if (isCrafted(n)) {
      combinedRate.set(n.item, (combinedRate.get(n.item) ?? 0) + n.ratePerSecond);
      let s = targetsByItem.get(n.item);
      if (!s) targetsByItem.set(n.item, (s = new Set()));
      s.add(ti);
    }
    for (const c of n.children) collect(c, ti);
  };
  const depth = (n: ProductionNode): number => {
    let d = 0;
    for (const c of n.children) d = Math.max(d, 1 + depth(c));
    depthByItem.set(n.item, Math.max(depthByItem.get(n.item) ?? 0, d));
    return d;
  };
  plans.forEach((p, ti) => { collect(p.root, ti); depth(p.root); });

  const sharedCounts = new Map<string, number>();
  for (const [item, s] of targetsByItem) if (s.size >= 2) sharedCounts.set(item, s.size);
  const isShared = (item: string): boolean => sharedCounts.has(item);

  // Nearest shared descendants of each shared item (skip non-shared nodes).
  const childrenOf = new Map<string, Set<string>>();
  const findNearest = (node: ProductionNode, acc: Set<string>): void => {
    for (const c of node.children) {
      if (isShared(c.item)) acc.add(c.item);
      else findNearest(c, acc);
    }
  };
  for (const item of sharedCounts.keys()) {
    const acc = new Set<string>();
    for (const occ of nodesByItem.get(item) ?? []) findNearest(occ, acc);
    acc.delete(item);
    childrenOf.set(item, acc);
  }

  const childIds = new Set<string>();
  for (const set of childrenOf.values()) for (const c of set) childIds.add(c);
  const rootItems = [...sharedCounts.keys()].filter((i) => !childIds.has(i));

  // Order: deepest (most complex) first, then larger rate, then id.
  const cmp = (a: string, b: string): number =>
    (depthByItem.get(b) ?? 0) - (depthByItem.get(a) ?? 0) ||
    (combinedRate.get(b) ?? 0) - (combinedRate.get(a) ?? 0) ||
    a.localeCompare(b);

  const placed = new Set<string>();
  const build = (item: string): SharedComponentNode => {
    const node: SharedComponentNode = {
      item,
      combinedRatePerSecond: combinedRate.get(item) ?? 0,
      targetCount: sharedCounts.get(item) ?? 0,
      children: [],
      reference: false,
    };
    if (placed.has(item)) { node.reference = true; return node; } // dedup
    placed.add(item);
    node.children = [...(childrenOf.get(item) ?? [])].sort(cmp).map(build);
    return node;
  };

  const roots = rootItems.sort(cmp).map(build);
  return { roots, sharedCounts };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shared-components`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/calculator/shared-components.ts src/calculator/shared-components.test.ts
git commit -m "feat(calculator): shared-components aggregation engine"
```

---

### Task 2: ProductionChain shared-highlight props (additive)

Add optional, defaulted-inert props so a chain can badge/accent/glow shared items. No behavior change when omitted.

**Files:**
- Modify: `src/web/components/ProductionChain.tsx`

**Interfaces:**
- Produces: `ProductionChain` gains optional props `sharedCounts?: Map<string, number>`, `focusedItem?: string | null`, `onFocusItem?: (item: string) => void`.

- [ ] **Step 1: Add the props and thread them through**

In `src/web/components/ProductionChain.tsx`, extend the props interface:

```ts
interface ProductionChainProps {
  node: ProductionNode;
  timeUnit: TimeUnit;
  machineOverrides: MachineOverrides;
  onMachineChange: (item: string, machine: string) => void;
  onRecipeChange: (path: string, recipeId: string) => void;
  /** shared item id → target count; present → render a ×N badge + accent. */
  sharedCounts?: Map<string, number>;
  /** the item whose occurrences should glow (click-to-trace). */
  focusedItem?: string | null;
  /** click a shared item to focus/trace it. */
  onFocusItem?: (item: string) => void;
}
```

In `ChainNode`, destructure the new props and compute flags after the existing `recipes` line:

```ts
function ChainNode({
  node, timeUnit, machineOverrides, onMachineChange, onRecipeChange,
  sharedCounts, focusedItem, onFocusItem, depth, path,
}: ProductionChainProps & { depth: number; path: string }) {
```

Add (just before the `return (`):

```ts
  const sharedCount = sharedCounts?.get(node.item);
  const isShared = sharedCount !== undefined;
  const isFocused = focusedItem != null && focusedItem === node.item;
```

Update the row `<div>`'s `className` (the one with `cn('flex flex-wrap ...')`) to append the focus/shared styling — add these two lines inside the `cn(...)` call:

```ts
          isShared && 'ring-1 ring-inset ring-amber/40',
          isFocused && 'bg-amber/15 ring-2 ring-inset ring-amber',
```

Add the `×N` badge button immediately AFTER the name `<span>` (after the line `<span className="min-w-0 truncate font-medium">{name(node.item)}</span>`):

```tsx
        {isShared && (
          <button
            type="button"
            onClick={() => onFocusItem?.(node.item)}
            className="shrink-0 rounded bg-amber/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber transition-colors hover:bg-amber/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={t('calculator.sharedBadgeTitle', { count: sharedCount })}
          >
            ×{sharedCount}
          </button>
        )}
```

Pass the new props down in the recursive `ChainNode` call (in the `node.children.map(...)` block), adding these three lines alongside the existing props:

```tsx
              sharedCounts={sharedCounts}
              focusedItem={focusedItem}
              onFocusItem={onFocusItem}
```

(The top-level `ProductionChain` spreads `{...props}` into the first `ChainNode`, so the new optional props flow through automatically.)

- [ ] **Step 2: Add the i18n key used by the badge title**

This key is added fully in Task 6; for now add just `sharedBadgeTitle` so tsc/parity pass. In `src/web/i18n/locales/en/ui.ts`, inside the `calculator` object add:

```ts
    sharedBadgeTitle: 'Used by {{count}} targets',
```

In `src/web/i18n/locales/zh/ui.ts`, inside its `calculator` object add:

```ts
    sharedBadgeTitle: '{{count}} 个目标共用',
```

- [ ] **Step 3: Typecheck + tests + build**

Run: `npx tsc -b && npm test -- i18n && npm run build`
Expected: PASS — Calculator still renders (no shared props passed yet → no badges).

- [ ] **Step 4: Commit**

```bash
git add src/web/components/ProductionChain.tsx src/web/i18n/locales/en/ui.ts src/web/i18n/locales/zh/ui.ts
git commit -m "feat(calculator): additive shared-highlight props on ProductionChain"
```

---

### Task 3: SharedComponents tree component

A presentational component rendering the nested shared-components tree with click-to-trace.

**Files:**
- Create: `src/web/components/SharedComponents.tsx`

**Interfaces:**
- Consumes: `SharedComponentNode`, `SharedComponentsResult` from `../../calculator/shared-components.js`; `TimeUnit`.
- Produces: `SharedComponents({ result, timeUnit, focusedItem, onFocusItem }: { result: SharedComponentsResult; timeUnit: TimeUnit; focusedItem: string | null; onFocusItem: (item: string) => void })`.

- [ ] **Step 1: Write the component**

Create `src/web/components/SharedComponents.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import CornerDownRightIcon from 'lucide-react/dist/esm/icons/corner-down-right';
import type { SharedComponentNode, SharedComponentsResult } from '../../calculator/shared-components.js';
import type { TimeUnit } from '../hooks/useCalculator.js';
import { ItemIcon } from './ItemIcon.js';
import { useNames } from '../i18n/useNames.js';
import { Card } from '../ui/index.js';
import { rate } from '../lib/format.js';
import { cn } from '../lib/cn.js';

interface SharedComponentsProps {
  result: SharedComponentsResult;
  timeUnit: TimeUnit;
  focusedItem: string | null;
  onFocusItem: (item: string) => void;
}

/** Dependency tree of components shared by ≥2 targets, most-complex → raw. */
export function SharedComponents({ result, timeUnit, focusedItem, onFocusItem }: SharedComponentsProps) {
  const { t } = useTranslation('ui');
  if (result.roots.length === 0) return null;
  return (
    <Card className="mb-4 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('calculator.sharedComponents')}
      </div>
      <div className="space-y-0.5">
        {result.roots.map((node, i) => (
          <SharedRow
            key={`${node.item}-${i}`}
            node={node}
            depth={0}
            timeUnit={timeUnit}
            focusedItem={focusedItem}
            onFocusItem={onFocusItem}
          />
        ))}
      </div>
    </Card>
  );
}

function SharedRow({
  node, depth, timeUnit, focusedItem, onFocusItem,
}: { node: SharedComponentNode; depth: number } & Omit<SharedComponentsProps, 'result'>) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const isFocused = focusedItem === node.item;
  return (
    <>
      <button
        type="button"
        onClick={() => onFocusItem(node.item)}
        style={{ '--d': depth } as React.CSSProperties}
        className={cn(
          'flex w-full items-center gap-2 rounded py-1 pr-2 text-left text-sm transition-colors',
          'pl-[calc(var(--d)*1.125rem_+_0.5rem)] hover:bg-accent/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isFocused && 'bg-amber/15 ring-1 ring-inset ring-amber',
        )}
      >
        {depth > 0 && <CornerDownRightIcon className="size-3.5 shrink-0 text-muted-foreground" />}
        <ItemIcon id={node.item} size={20} tinted className="shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium" title={name(node.item)}>{name(node.item)}</span>
        {node.reference ? (
          <span className="shrink-0 text-xs italic text-muted-foreground">{t('calculator.shownAbove')}</span>
        ) : (
          <>
            <span className="shrink-0 rounded bg-amber/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber">
              ×{node.targetCount}
            </span>
            <span className="shrink-0 tabular-nums text-primary">{rate(node.combinedRatePerSecond, timeUnit)}</span>
          </>
        )}
      </button>
      {!node.reference && node.children.map((child, i) => (
        <SharedRow
          key={`${child.item}-${i}`}
          node={child}
          depth={depth + 1}
          timeUnit={timeUnit}
          focusedItem={focusedItem}
          onFocusItem={onFocusItem}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 2: Verify the lucide icon exists**

Run: `ls node_modules/lucide-react/dist/esm/icons/corner-down-right.js`
Expected: file exists. If absent, use `arrow-down-right.js` and import `CornerDownRightIcon from 'lucide-react/dist/esm/icons/arrow-down-right'`.

- [ ] **Step 3: Add the i18n keys it uses**

In `src/web/i18n/locales/en/ui.ts` `calculator` object add:

```ts
    sharedComponents: 'Shared components',
    shownAbove: 'shown above',
```

In `src/web/i18n/locales/zh/ui.ts` `calculator` object add:

```ts
    sharedComponents: '共用组件',
    shownAbove: '见上方',
```

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc -b && npm test -- i18n`
Expected: PASS (component not yet used; compiles).

- [ ] **Step 5: Commit**

```bash
git add src/web/components/SharedComponents.tsx src/web/i18n/locales/en/ui.ts src/web/i18n/locales/zh/ui.ts
git commit -m "feat(calculator): shared-components tree component"
```

---

### Task 4: Summary accepts combined totals

Refactor `Summary` to take a `CombinedTotals` instead of a full `ProductionPlan`, and update its one current caller (still single-target).

**Files:**
- Modify: `src/web/components/Summary.tsx`
- Modify: `src/web/App.tsx` (the single `<Summary .../>` call in `CalculatorTab`)

**Interfaces:**
- Consumes: `CombinedTotals` from `../../calculator/shared-components.js`.
- Produces: `Summary` props become `{ totals: CombinedTotals; timeUnit; integerMultiplier; onApplyMultiplier; proliferator }`.

- [ ] **Step 1: Refactor Summary**

In `src/web/components/Summary.tsx`:

Replace the import of `ProductionPlan` with the totals type:

```ts
import type { CombinedTotals } from '../../calculator/shared-components.js';
```

Replace the props interface:

```ts
interface SummaryProps {
  totals: CombinedTotals;
  timeUnit: TimeUnit;
  integerMultiplier: number | null;
  onApplyMultiplier: (k: number) => void;
  proliferator: Proliferator | null;
}
```

Update the function signature and the four reads (`plan.` → `totals.`):

```ts
export function Summary({ totals, timeUnit, integerMultiplier, onApplyMultiplier, proliferator }: SummaryProps) {
```
```ts
  const machineEntries = Object.entries(totals.totalMachines).sort((a, b) => b[1] - a[1]);
  const rawEntries = Object.entries(totals.rawResources).sort((a, b) => b[1] - a[1]);
```
and in the JSX, `plan.totalPowerKW` → `totals.totalPowerKW`, and `plan.proliferatorSpraysPerSecond` → `totals.proliferatorSpraysPerSecond` (two occurrences in the Extras stat).

- [ ] **Step 2: Update the caller in App.tsx**

In `src/web/App.tsx` `CalculatorTab`, change the Summary call's first prop from `plan={plan}` to `totals={plan}` (a `ProductionPlan` is structurally a `CombinedTotals`):

```tsx
          <Summary
            totals={plan}
            timeUnit={calc.timeUnit}
            integerMultiplier={integerMultiplier}
            onApplyMultiplier={(k) => calc.setAmount((prev) => prev * k)}
            proliferator={proliferator}
          />
```

- [ ] **Step 3: Typecheck + tests + build**

Run: `npx tsc -b && npm test && npm run build`
Expected: PASS — Calculator Summary renders identically (still single-target).

- [ ] **Step 4: Commit**

```bash
git add src/web/components/Summary.tsx src/web/App.tsx
git commit -m "refactor(calculator): Summary takes combined totals"
```

---

### Task 5: Remove the Planner tab and its engine

Delete the architect Planner entirely. Build stays green (Calculator unaffected).

**Files:**
- Modify: `src/web/App.tsx` (remove Planner lazy import, tab trigger, tab content)
- Modify: `src/web/hooks/useHashTab.ts` (drop `'planner'`)
- Modify: `src/web/i18n/locales/en/ui.ts` + `zh/ui.ts` (remove `tabs.planner`, `loadingTargets.planner`, and the whole `planner` block)
- Delete: `src/calculator/planner/blocks.ts`, `blocks.test.ts`, `matrix.ts`, `matrix.test.ts`, `types.ts`, `index.ts`
- Delete: `src/web/components/planner/BlockCard.tsx`, `BlockGraph.tsx`, `PlannerTab.tsx`, `PlannerTotals.tsx`
- Delete: `src/web/hooks/usePlanner.ts`

- [ ] **Step 1: Remove Planner wiring from App.tsx**

In `src/web/App.tsx`: delete the line
```ts
const PlannerTab = lazy(() => import('./components/planner/PlannerTab.js').then((m) => ({ default: m.PlannerTab })));
```
delete the trigger
```tsx
            <TabsTrigger value="planner" className="flex-1 sm:flex-none">{t('tabs.planner')}</TabsTrigger>
```
and delete the whole `<TabsContent value="planner"> … </TabsContent>` block.

- [ ] **Step 2: Drop the hash route**

In `src/web/hooks/useHashTab.ts`:
```ts
const VALID = new Set(['calculator', 'tech-tree', 'item-lookup']);
```

- [ ] **Step 3: Remove planner i18n keys (both locales)**

In `src/web/i18n/locales/en/ui.ts`: remove `planner: 'Planner',` from `tabs`; remove `planner: 'production planner'` from `loadingTargets` (leave `researchTree`/`itemLookup`); delete the entire top-level `planner: { … }` block.
Do the same in `src/web/i18n/locales/zh/ui.ts` (remove `tabs.planner`, `loadingTargets.planner`, and the `planner` block). Keep en/zh in parity.

- [ ] **Step 4: Delete the planner files**

```bash
git rm src/calculator/planner/blocks.ts src/calculator/planner/blocks.test.ts \
       src/calculator/planner/matrix.ts src/calculator/planner/matrix.test.ts \
       src/calculator/planner/types.ts src/calculator/planner/index.ts \
       src/web/components/planner/BlockCard.tsx src/web/components/planner/BlockGraph.tsx \
       src/web/components/planner/PlannerTab.tsx src/web/components/planner/PlannerTotals.tsx \
       src/web/hooks/usePlanner.ts
```

- [ ] **Step 5: Typecheck + tests + build**

Run: `npx tsc -b && npm test && npm run build`
Expected: PASS — no dangling imports; `i18n` parity test green; Planner tab gone; Calculator works.

- [ ] **Step 6: Commit**

```bash
git add src/web/App.tsx src/web/hooks/useHashTab.ts src/web/i18n/locales/en/ui.ts src/web/i18n/locales/zh/ui.ts
git commit -m "chore(planner): remove the Planner tab and its engine"
```

---

### Task 6: Multi-target Calculator (hook + tab)

Rewrite `useCalculator` for a target list and the Calculator tab to render the list, combined Summary, shared-components tree, and per-target chains. Single target = today's behavior.

**Files:**
- Modify: `src/web/hooks/useCalculator.ts` (full rewrite below)
- Modify: `src/web/App.tsx` (`CalculatorTab` rewrite + `handleCalculateItem`)
- Modify: `src/web/i18n/locales/en/ui.ts` + `zh/ui.ts` (add target-list keys)

**Interfaces:**
- Consumes: `solve`, `findIntegerMultiplierForValues` from `../../calculator/index.js`; `combinePlans`, `collectMachineCounts`, `buildSharedComponents`, types from `../../calculator/shared-components.js`; `SharedComponents` (Task 3); `Summary` (Task 4, totals-based); `ProductionChain` (Task 2 props); `RatioStrip`.
- Produces: `useCalculator()` returning the state in the rewrite below; `TimeUnit` and `UNIT_SECONDS` still exported (consumed by `RateInput`, `format.ts`, `ProductionChain`, `SharedComponents`).

- [ ] **Step 1: Confirm `findIntegerMultiplierForValues` is exported**

It is exported from `src/calculator/index.ts` (re-exported from `solver.ts`). No change needed; verify by reading the export list.

- [ ] **Step 2: Rewrite `useCalculator.ts`**

Replace the entire contents of `src/web/hooks/useCalculator.ts` with:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  solve, findIntegerMultiplierForValues, familyOfMachine, MACHINE_FAMILY_ORDER,
  type MachineFamily, type MachineOverrides, type MachineTiers, type RecipeOverrides,
} from '../../calculator/index.js';
import {
  combinePlans, collectMachineCounts, buildSharedComponents,
  type CombinedTotals, type SharedComponentsResult,
} from '../../calculator/shared-components.js';
import type { ProductionPlan } from '../../calculator/index.js';
import { graph, proliferators } from '../data.js';

export type TimeUnit = 'second' | 'minute' | 'hour';
const UNIT_SECONDS: Record<TimeUnit, number> = { second: 1, minute: 60, hour: 3600 };

const TIERS_KEY = 'dsp-machine-tiers';
let rowSeq = 0;

export interface CalcTarget {
  id: string;
  item: string;
  amount: number;
}

function sanitizeTiers(value: unknown): MachineTiers {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const tiers: MachineTiers = {};
  for (const family of MACHINE_FAMILY_ORDER) {
    const id = source[family];
    if (typeof id === 'string' && familyOfMachine(id) === family) tiers[family] = id;
  }
  return tiers;
}
function loadMachineTiers(): MachineTiers {
  try {
    const raw = localStorage.getItem(TIERS_KEY);
    return raw ? sanitizeTiers(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export interface SolvedTarget {
  target: CalcTarget;
  plan: ProductionPlan;
}

export interface CalculatorState {
  targets: CalcTarget[];
  addTarget: (item: string) => void;
  removeTarget: (id: string) => void;
  setTargetItem: (id: string, item: string) => void;
  setTargetAmount: (id: string, amount: number) => void;
  /** Replace the whole list with one item (deep-link from other tabs). */
  setSingleTarget: (item: string) => void;
  timeUnit: TimeUnit;
  setTimeUnit: (u: TimeUnit) => void;
  scaleAllAmounts: (k: number) => void;
  machineOverrides: MachineOverrides;
  setMachineOverrides: React.Dispatch<React.SetStateAction<MachineOverrides>>;
  machineTiers: MachineTiers;
  setMachineTier: (family: MachineFamily, machineId: string | null) => void;
  resetFamilyOverrides: (family: MachineFamily) => void;
  recipeOverridesByTarget: Record<string, RecipeOverrides>;
  setRecipeOverride: (targetId: string, path: string, recipeId: string | null) => void;
  proliferatorId: string;
  setProliferatorId: (id: string) => void;
  focusedItem: string | null;
  setFocusedItem: (item: string | null) => void;
  // Derived
  solved: SolvedTarget[];
  combined: CombinedTotals | null;
  integerMultiplier: number | null;
  shared: SharedComponentsResult;
}

const newTarget = (item: string, amount = 60): CalcTarget => ({ id: `t${rowSeq++}`, item, amount });

export function useCalculator(): CalculatorState {
  const [targets, setTargets] = useState<CalcTarget[]>(() => [newTarget('electromagnetic-matrix')]);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('minute');
  const [machineOverrides, setMachineOverrides] = useState<MachineOverrides>({});
  const [machineTiers, setMachineTiers] = useState<MachineTiers>(loadMachineTiers);
  const [recipeOverridesByTarget, setRecipeOverridesByTarget] = useState<Record<string, RecipeOverrides>>({});
  const [proliferatorId, setProliferatorId] = useState<string>('none');
  const [focusedItem, setFocusedItem] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(TIERS_KEY, JSON.stringify(machineTiers)); } catch { /* ignore */ }
  }, [machineTiers]);

  const addTarget = useCallback((item: string) => {
    setTargets((prev) => [...prev, newTarget(item)]);
  }, []);
  const removeTarget = useCallback((id: string) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
    setRecipeOverridesByTarget((prev) => {
      const next = { ...prev }; delete next[id]; return next;
    });
  }, []);
  const setTargetItem = useCallback((id: string, item: string) => {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, item } : t)));
    // Recipe overrides are keyed by this target's tree paths — drop them on item change.
    setRecipeOverridesByTarget((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev }; delete next[id]; return next;
    });
  }, []);
  const setTargetAmount = useCallback((id: string, amount: number) => {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, amount: Math.max(0, amount) } : t)));
  }, []);
  const setSingleTarget = useCallback((item: string) => {
    setTargets([newTarget(item)]);
    setRecipeOverridesByTarget({});
  }, []);
  const scaleAllAmounts = useCallback((k: number) => {
    setTargets((prev) => prev.map((t) => ({ ...t, amount: t.amount * k })));
  }, []);

  const setMachineTier = useCallback((family: MachineFamily, machineId: string | null) => {
    setMachineTiers((prev) => {
      const next = { ...prev };
      if (machineId) next[family] = machineId; else delete next[family];
      return next;
    });
  }, []);
  const resetFamilyOverrides = useCallback((family: MachineFamily) => {
    setMachineOverrides((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([, mid]) => familyOfMachine(mid) !== family)));
  }, []);
  const setRecipeOverride = useCallback((targetId: string, path: string, recipeId: string | null) => {
    setRecipeOverridesByTarget((prev) => {
      const cur = { ...(prev[targetId] ?? {}) };
      if (recipeId) cur[path] = recipeId; else delete cur[path];
      return { ...prev, [targetId]: cur };
    });
  }, []);

  const proliferator = useMemo(() => proliferators.find((p) => p.id === proliferatorId) ?? null, [proliferatorId]);

  const solved = useMemo<SolvedTarget[]>(() =>
    targets
      .filter((t) => graph.itemToRecipe.has(t.item) && t.amount > 0)
      .map((t) => ({
        target: t,
        plan: solve(
          graph, t.item, t.amount / UNIT_SECONDS[timeUnit],
          machineOverrides, { proliferator }, machineTiers, recipeOverridesByTarget[t.id],
        ),
      })),
    [targets, timeUnit, machineOverrides, proliferator, machineTiers, recipeOverridesByTarget],
  );

  const plans = useMemo(() => solved.map((s) => s.plan), [solved]);
  const combined = useMemo(() => (plans.length ? combinePlans(plans) : null), [plans]);
  const integerMultiplier = useMemo(() => {
    const values = collectMachineCounts(plans);
    return values.length ? findIntegerMultiplierForValues(values) : null;
  }, [plans]);
  const shared = useMemo(() => buildSharedComponents(plans), [plans]);

  return {
    targets, addTarget, removeTarget, setTargetItem, setTargetAmount, setSingleTarget,
    timeUnit, setTimeUnit, scaleAllAmounts,
    machineOverrides, setMachineOverrides,
    machineTiers, setMachineTier, resetFamilyOverrides,
    recipeOverridesByTarget, setRecipeOverride,
    proliferatorId, setProliferatorId,
    focusedItem, setFocusedItem,
    solved, combined, integerMultiplier, shared,
  };
}

export { UNIT_SECONDS };
```

- [ ] **Step 3: Add the target-list i18n keys (both locales)**

In `src/web/i18n/locales/en/ui.ts` `calculator` object, add (alongside the keys added earlier):

```ts
    addTarget: 'Add target',
    removeTarget: 'Remove target',
    targets: 'Targets',
```

In `src/web/i18n/locales/zh/ui.ts` `calculator` object, add:

```ts
    addTarget: '添加目标',
    removeTarget: '移除目标',
    targets: '目标',
```

- [ ] **Step 4: Rewrite `CalculatorTab` + `handleCalculateItem` in App.tsx**

In `src/web/App.tsx`:

Update `handleCalculateItem` to use the new setter:

```tsx
  const handleCalculateItem = useCallback((id: string) => {
    if (!graph.itemToRecipe.has(id)) return;
    calc.setSingleTarget(id);
    setTab('calculator');
  }, [calc, setTab]);
```

Replace the entire `CalculatorTab` function with:

```tsx
function CalculatorTab({ calc }: { calc: ReturnType<typeof useCalculator> }) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const proliferator = proliferators.find((p) => p.id === calc.proliferatorId) ?? null;
  const multi = calc.solved.length > 1;

  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-5">
      {/* Targets */}
      <div className="mb-4">
        <Label className="mb-1">{t('calculator.targets')}</Label>
        <div className="flex flex-col gap-2">
          {calc.targets.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2">
              <ItemSelector items={graph.allProducts} value={row.item} onChange={(id) => calc.setTargetItem(row.id, id)} />
              <Input
                type="number" min={0} step="any"
                value={Number.isFinite(row.amount) ? row.amount : ''}
                onChange={(e) => calc.setTargetAmount(row.id, Number(e.target.value) || 0)}
                className="w-24 flex-shrink-0 sm:w-28"
              />
              {calc.targets.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => calc.removeTarget(row.id)} aria-label={t('calculator.removeTarget')}>
                  <XIcon className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <Button variant="outline" size="sm" className="self-start" onClick={() => calc.addTarget('iron-ingot')}>
            <PlusIcon className="mr-1 size-4" />{t('calculator.addTarget')}
          </Button>
          <div className="w-full sm:w-auto">
            <Label className="mb-1">{t('calculator.targetRate')}</Label>
            <Select value={calc.timeUnit} onValueChange={(v) => calc.setTimeUnit(v as typeof calc.timeUnit)}>
              <SelectTrigger className="w-full sm:min-w-[8rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="second">{t('calculator.perSecond')}</SelectItem>
                <SelectItem value="minute">{t('calculator.perMinute')}</SelectItem>
                <SelectItem value="hour">{t('calculator.perHour')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-auto">
            <Label className="mb-1">{t('calculator.proliferator')}</Label>
            <Select value={calc.proliferatorId} onValueChange={calc.setProliferatorId}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[13rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('calculator.none')}</SelectItem>
                {proliferators.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ItemIcon id={p.tier} size={16} />
                      <span className="truncate">{name(p.id)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <MachineDefaults
        tiers={calc.machineTiers}
        machineOverrides={calc.machineOverrides}
        onTierChange={calc.setMachineTier}
        onResetFamily={calc.resetFamilyOverrides}
      />

      {calc.combined ? (
        <>
          <Summary
            totals={calc.combined}
            timeUnit={calc.timeUnit}
            integerMultiplier={calc.integerMultiplier}
            onApplyMultiplier={(k) => calc.scaleAllAmounts(k)}
            proliferator={proliferator}
          />

          <SharedComponents
            result={calc.shared}
            timeUnit={calc.timeUnit}
            focusedItem={calc.focusedItem}
            onFocusItem={(item) => calc.setFocusedItem(calc.focusedItem === item ? null : item)}
          />

          {calc.solved.map(({ target, plan }) => (
            <div key={target.id} className="mb-4">
              {multi && (
                <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <ItemIcon id={target.item} size={20} tinted />
                  <span className="truncate">{name(target.item)}</span>
                  <span className="text-muted-foreground">· {target.amount} {t(`calculator.per${calc.timeUnit === 'second' ? 'Second' : calc.timeUnit === 'minute' ? 'Minute' : 'Hour'}`)}</span>
                </div>
              )}
              <RatioStrip plan={plan} />
              <ProductionChain
                node={plan.root}
                timeUnit={calc.timeUnit}
                machineOverrides={calc.machineOverrides}
                onMachineChange={(item, machine) => calc.setMachineOverrides((prev) => ({ ...prev, [item]: machine }))}
                onRecipeChange={(path, recipeId) => calc.setRecipeOverride(target.id, path, recipeId)}
                sharedCounts={calc.shared.sharedCounts}
                focusedItem={calc.focusedItem}
                onFocusItem={(item) => calc.setFocusedItem(calc.focusedItem === item ? null : item)}
              />
            </div>
          ))}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          {t('calculator.empty')}
        </div>
      )}
    </div>
  );
}
```

Update the imports at the top of `App.tsx`:
- Remove the now-unused `RateInput` import and the `findIntegerMultiplier` import.
- Add the new component + icon imports:

```ts
import { SharedComponents } from './components/SharedComponents.js';
import { Button, Input } from './ui/index.js';
import PlusIcon from 'lucide-react/dist/esm/icons/plus';
import XIcon from 'lucide-react/dist/esm/icons/x';
```

Merge `Button` and `Input` into the existing `./ui/index.js` import block rather than adding a duplicate import line. The existing `useMemo` import on line 1 may become unused in `App` — remove it from the React import if tsc flags it.

- [ ] **Step 5: Typecheck + tests + build**

Run: `npx tsc -b && npm test && npm run build`
Expected: PASS. Single target = today; the empty state shows only when all rows are invalid/zero.

- [ ] **Step 6: Commit**

```bash
git add src/web/hooks/useCalculator.ts src/web/App.tsx src/web/i18n/locales/en/ui.ts src/web/i18n/locales/zh/ui.ts
git commit -m "feat(calculator): multiple targets + shared-components view"
```

---

### Task 7: Verification + self-review

- [ ] **Step 1: Full build + test + typecheck**

Run: `npm run build && npm test`
Expected: `tsc -b` + `vite build` succeed; all tests pass.

- [ ] **Step 2: Browser smoke test**

Run `npm run dev`; open `…/#calculator`. Verify:
- **Single target** (default Electromagnetic Matrix @ 60/min) looks/behaves like before: Summary, RatioStrip, chain with recipe/machine overrides; no shared-components card; no per-target header.
- **Add target** (e.g. Processor or Energy Matrix), set rates → combined Summary updates; a "Shared components" card appears listing shared items nested most-complex→raw with ×N + combined rate; per-target chains gain ×N badges on shared nodes; per-target headers appear.
- **Click-to-trace**: clicking a shared item (card or chain badge) glows all its occurrences across chains and the card; clicking again clears.
- **Remove** a target → updates; back to single-target look at one row.
- **Item Lookup → Calculate** sets a single target and switches to the Calculator.
- Language switch to 中文 translates all new labels.
- The **Planner tab is gone**; `#planner` falls back to the Calculator.

- [ ] **Step 3: Run `/review` on the branch diff and address findings.**

- [ ] **Step 4: Final commit (if review produced changes)**

```bash
git add <changed files>
git commit -m "chore(calculator): address self-review findings"
```

---

## Self-Review (plan vs. spec)

**Spec coverage:**
- §3 input (target list, shared time-unit, proliferator, machine defaults, deep-link) → Task 6.
- §4 per-target output (combined Summary, per-target chains, highlight, click-to-trace, integer-ratio applies to all) → Tasks 2, 4, 6 (`scaleAllAmounts`).
- §5 shared-components engine (detection ≥2, combined rate, nesting/nearest-ancestor, depth order, dedup, empty for 0/1) → Task 1.
- §6 files (add shared-components.ts + SharedComponents.tsx; modify useCalculator/App/useHashTab/Summary/ProductionChain/i18n; remove planner) → Tasks 1–6.
- §7 state → Task 6 (`useCalculator`).
- §8 testing/purity/parity → Task 1 (engine + parity test), Task 7 (browser). No DOM tests (constraint honored).

**Deviations from spec (intentional, noted in-plan):** `SharedComponentsResult` exposes `sharedCounts: Map` instead of `sharedItemIds: Set` (carries the `×N` count for the badge); membership via `.has()`.

**Placeholder scan:** none — every code step has complete code.

**Type consistency:** `CombinedTotals`, `SharedComponentNode`, `SharedComponentsResult` (with `sharedCounts`), `CalcTarget`, `SolvedTarget` are defined in Tasks 1/6 and consumed consistently. `Summary` is totals-based from Task 4 onward (caller updated in Task 4, re-pointed to `combined` in Task 6). `ProductionChain`'s new props (`sharedCounts`/`focusedItem`/`onFocusItem`) are defined in Task 2 and supplied in Task 6. `setSingleTarget`/`scaleAllAmounts` used by App are defined on the hook.
