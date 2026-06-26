# Variable Targets & Bottleneck Reflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pin the available supply rate of components (raw or intermediate) and mark production targets as "Variable" so production reflows from the bottleneck, with coupled sliders dividing a shared supply pool.

**Architecture:** A new pure engine module (`bottleneck.ts`) measures each variable target's per-unit *footprint* on every component via a single unit-solve (the chain is linear in rate), then runs a deterministic sequential allocation sweep over a shared pinned-supply pool. The React hook wires state and the derived pipeline; downstream `Summary`/`SharedComponents`/`ProductionChain` consume normal plans and are unchanged except for an inline-pin affordance.

**Tech Stack:** TypeScript 5.6, React 19, Vite 6, Tailwind v4, radix-ui (unified package), Vitest. Package manager: npm. Calculator layer is pure (no React).

## Global Constraints

- **Always-dark theme.** Never use the `dark:` prefix. Never hardcode colors — use semantic classes / CSS variables (`text-foreground`, `bg-card`, `border-border`, `text-primary`, `text-amber`, `text-muted-foreground`, `bg-secondary`, `bg-primary`). There is **no red token**; over-allocation uses `text-amber` / `bg-amber`.
- **Local module imports use the `.js` extension** (e.g. `from '../data.js'`).
- **lucide icons** imported one-per-file from `lucide-react/dist/esm/icons/<name>`.
- Use **UI primitives** in `src/web/ui/` over raw form controls.
- The **calculator layer stays pure** — no imports from `src/web`.
- **All display text via i18n** (`useTranslation('ui')` / `t()`); `en` is source of truth, `zh` is typed `: UiResource` (key parity enforced at compile time). Game-data names via `useNames()`.
- All rates inside the calculator/hook pipeline are in **items per second**; convert to/from display units (`UNIT_SECONDS`) only at the UI boundary.
- Run `npx tsc -b` and `npm test` before considering a change done.
- Work on branch `feat/variable-targets-bottleneck-reflow` (already created). Commit per task; **never push**; merge is `--no-ff` local only.
- All paths below are relative to `repositories/dsp-helper/main/`.

---

### Task 1: Pure footprint extraction (`extractConsumption`)

Measures how much of every item a solved plan consumes, excluding the root output node (the root's rate is delivered output, not consumption).

**Files:**
- Create: `src/calculator/bottleneck.ts`
- Test: `src/calculator/bottleneck.test.ts`

**Interfaces:**
- Consumes: `ProductionPlan`, `ProductionNode` from `./types.js` (existing).
- Produces: `extractConsumption(plan: ProductionPlan): Map<string, number>` — component id → total consumption (items/s), summed over every node **except the root**, across all occurrences.

- [ ] **Step 1: Write the failing test**

Create `src/calculator/bottleneck.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractConsumption } from './bottleneck.js';
import type { ProductionPlan, ProductionNode } from './types.js';

// Minimal node factory — only the fields extractConsumption reads.
function node(item: string, ratePerSecond: number, children: ProductionNode[] = []): ProductionNode {
  return {
    item, recipe: null, machine: null, ratePerSecond, machinesNeeded: 0,
    children, powerKW: 0, mined: false, proliferated: false,
  };
}
function plan(root: ProductionNode): ProductionPlan {
  return { root, totalMachines: {}, rawResources: {}, totalPowerKW: 0, proliferatorSpraysPerSecond: 0 };
}

describe('extractConsumption', () => {
  it('excludes the root output node', () => {
    const p = plan(node('gear', 1, [node('iron', 2)]));
    const c = extractConsumption(p);
    expect(c.get('gear')).toBeUndefined(); // root output is not consumption
    expect(c.get('iron')).toBe(2);
  });

  it('sums a component appearing at multiple nodes', () => {
    const p = plan(node('thing', 1, [
      node('iron', 3, [node('copper', 1)]),
      node('plate', 2, [node('iron', 4)]),
    ]));
    const c = extractConsumption(p);
    expect(c.get('iron')).toBe(7); // 3 + 4
    expect(c.get('copper')).toBe(1);
    expect(c.get('plate')).toBe(2);
  });

  it('counts an intermediate even when its own subtree has another tracked item', () => {
    const p = plan(node('out', 1, [node('mid', 5, [node('raw', 10)])]));
    const c = extractConsumption(p);
    expect(c.get('mid')).toBe(5);
    expect(c.get('raw')).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bottleneck`
Expected: FAIL — `extractConsumption` is not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

Create `src/calculator/bottleneck.ts`:

```ts
import type { ProductionPlan, ProductionNode } from './types.js';

/**
 * Total consumption (items/s) of every item in a solved plan, summed across all
 * occurrences, EXCLUDING the root node. The root's rate is the plan's delivered
 * output, not internal consumption; every other node's rate is the amount its
 * parent consumes. The result therefore means "consumption of item X".
 */
export function extractConsumption(plan: ProductionPlan): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (n: ProductionNode): void => {
    out.set(n.item, (out.get(n.item) ?? 0) + n.ratePerSecond);
    for (const c of n.children) walk(c);
  };
  // Skip the root itself; start from its children.
  for (const c of plan.root.children) walk(c);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bottleneck`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calculator/bottleneck.ts src/calculator/bottleneck.test.ts
git commit -m "feat(calc): extractConsumption — per-item consumption of a plan, root-excluded"
```

---

### Task 2: Pure allocation sweep (`computeAllocation`)

The deterministic sequential sweep that divides the shared pool among variable targets and reports per-component utilization. Guarantees global feasibility.

**Files:**
- Modify: `src/calculator/bottleneck.ts`
- Modify: `src/calculator/index.ts` (export the new API)
- Test: `src/calculator/bottleneck.test.ts` (extend)

**Interfaces:**
- Consumes: `extractConsumption` (Task 1) for callers; `computeAllocation` itself takes plain maps.
- Produces:

```ts
export interface VariableInput {
  id: string;                     // target id, for mapping results back
  footprint: Map<string, number>; // item id → consumption per 1 unit/s output (full map; non-pinned ignored)
  intent: number;                 // desired rate, items/s. May be +Infinity to mean "take max".
  fallback: number;               // finite rate (items/s) used when the target is unbounded
}
export interface AllocationTarget {
  id: string;
  effectiveRate: number;          // resolved rate, items/s (always finite, >= 0)
  sliderMax: number | null;       // headroom in items/s for bounded targets; null when unbounded
  bounded: boolean;               // true iff it consumes >0 of at least one pinned component
}
export interface AllocationComponent {
  supply: number; fixedUse: number; variableUse: number; total: number;
  free: number;                   // max(0, supply - total)
  overAllocated: boolean;         // total > supply + EPS
}
export interface AllocationResult {
  targets: Map<string, AllocationTarget>;     // keyed by target id
  components: Map<string, AllocationComponent>; // keyed by component id
}
export function computeAllocation(
  pinned: Map<string, number>,   // component id → available supply, items/s
  fixedUse: Map<string, number>, // component id → consumption by all fixed targets, items/s
  variable: VariableInput[],     // in target order (allocation priority)
): AllocationResult;
```

- [ ] **Step 1: Write the failing test**

Append to `src/calculator/bottleneck.test.ts`:

```ts
import { computeAllocation, type VariableInput } from './bottleneck.js';

const vi = (id: string, fp: Record<string, number>, intent: number, fallback = 0): VariableInput =>
  ({ id, footprint: new Map(Object.entries(fp)), intent, fallback });

describe('computeAllocation', () => {
  it('single bounded target takes its max', () => {
    const r = computeAllocation(new Map([['ore', 100]]), new Map(), [vi('t1', { ore: 2 }, Infinity)]);
    expect(r.targets.get('t1')!.effectiveRate).toBe(50);
    expect(r.targets.get('t1')!.sliderMax).toBe(50);
    expect(r.targets.get('t1')!.bounded).toBe(true);
    expect(r.components.get('ore')!.variableUse).toBe(100);
    expect(r.components.get('ore')!.free).toBe(0);
    expect(r.components.get('ore')!.overAllocated).toBe(false);
  });

  it('fixed use is subtracted first; over-allocation flags', () => {
    const r = computeAllocation(new Map([['ore', 100]]), new Map([['ore', 120]]), [vi('t1', { ore: 1 }, Infinity)]);
    expect(r.targets.get('t1')!.effectiveRate).toBe(0); // nothing left
    const ore = r.components.get('ore')!;
    expect(ore.fixedUse).toBe(120);
    expect(ore.overAllocated).toBe(true);
    expect(ore.free).toBe(0);
  });

  it('sequential sweep is globally feasible for 3 targets / 2 components', () => {
    const pinned = new Map([['c1', 100], ['c2', 100]]);
    const r = computeAllocation(pinned, new Map(), [
      vi('t1', { c1: 2, c2: 1 }, Infinity),
      vi('t2', { c1: 1, c2: 2 }, Infinity),
      vi('t3', { c1: 1, c2: 1 }, Infinity),
    ]);
    expect(r.targets.get('t1')!.effectiveRate).toBe(50);
    expect(r.targets.get('t2')!.effectiveRate).toBe(0);
    expect(r.targets.get('t3')!.effectiveRate).toBe(0);
    // global feasibility
    expect(r.components.get('c1')!.total).toBeLessThanOrEqual(100 + 1e-9);
    expect(r.components.get('c2')!.total).toBeLessThanOrEqual(100 + 1e-9);
  });

  it('lowering an earlier target frees headroom for a later one', () => {
    const pinned = new Map([['c1', 100], ['c2', 100]]);
    const r = computeAllocation(pinned, new Map(), [
      vi('t1', { c1: 2, c2: 1 }, 10),   // intent capped at 10
      vi('t2', { c1: 1, c2: 2 }, Infinity),
    ]);
    expect(r.targets.get('t1')!.effectiveRate).toBe(10);  // 10, not 50
    // remaining c1 = 100-20=80, c2 = 100-10=90 → t2 max = min(80/1, 90/2)=45
    expect(r.targets.get('t2')!.effectiveRate).toBe(45);
  });

  it('an unbounded target (no pinned footprint) uses its fallback, sliderMax null', () => {
    const r = computeAllocation(new Map([['ore', 100]]), new Map(), [vi('t1', { water: 3 }, Infinity, 12)]);
    const t = r.targets.get('t1')!;
    expect(t.bounded).toBe(false);
    expect(t.sliderMax).toBeNull();
    expect(t.effectiveRate).toBe(12); // fallback, never Infinity
  });

  it('a finite intent on a bounded target is clamped to headroom', () => {
    const r = computeAllocation(new Map([['ore', 100]]), new Map(), [vi('t1', { ore: 2 }, 30)]);
    expect(r.targets.get('t1')!.effectiveRate).toBe(30);   // 30 <= 50
    expect(r.targets.get('t1')!.sliderMax).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bottleneck`
Expected: FAIL — `computeAllocation` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/calculator/bottleneck.ts`:

```ts
const EPS = 1e-9;

export interface VariableInput {
  id: string;
  footprint: Map<string, number>;
  intent: number;
  fallback: number;
}
export interface AllocationTarget {
  id: string;
  effectiveRate: number;
  sliderMax: number | null;
  bounded: boolean;
}
export interface AllocationComponent {
  supply: number; fixedUse: number; variableUse: number; total: number;
  free: number; overAllocated: boolean;
}
export interface AllocationResult {
  targets: Map<string, AllocationTarget>;
  components: Map<string, AllocationComponent>;
}

export function computeAllocation(
  pinned: Map<string, number>,
  fixedUse: Map<string, number>,
  variable: VariableInput[],
): AllocationResult {
  // Running pool after fixed-target draw. May start negative (over-allocated).
  const remaining = new Map<string, number>();
  for (const [c, supply] of pinned) remaining.set(c, supply - (fixedUse.get(c) ?? 0));

  const variableUse = new Map<string, number>();
  const targets = new Map<string, AllocationTarget>();

  for (const v of variable) {
    // Only pinned components with a positive footprint constrain this target.
    const constraints: Array<[string, number]> = [];
    for (const [c, fp] of v.footprint) {
      if (fp > EPS && pinned.has(c)) constraints.push([c, fp]);
    }

    if (constraints.length === 0) {
      const eff = Number.isFinite(v.intent) ? Math.max(0, v.intent) : Math.max(0, v.fallback);
      targets.set(v.id, { id: v.id, effectiveRate: eff, sliderMax: null, bounded: false });
      continue;
    }

    let headroom = Infinity;
    for (const [c, fp] of constraints) {
      headroom = Math.min(headroom, Math.max(0, remaining.get(c) ?? 0) / fp);
    }
    const eff = Math.max(0, Math.min(v.intent, headroom)); // Infinity intent → headroom
    for (const [c, fp] of constraints) {
      remaining.set(c, (remaining.get(c) ?? 0) - fp * eff);
      variableUse.set(c, (variableUse.get(c) ?? 0) + fp * eff);
    }
    targets.set(v.id, { id: v.id, effectiveRate: eff, sliderMax: headroom, bounded: true });
  }

  const components = new Map<string, AllocationComponent>();
  for (const [c, supply] of pinned) {
    const fu = fixedUse.get(c) ?? 0;
    const vu = variableUse.get(c) ?? 0;
    const total = fu + vu;
    components.set(c, {
      supply, fixedUse: fu, variableUse: vu, total,
      free: Math.max(0, supply - total),
      overAllocated: total > supply + EPS,
    });
  }
  return { targets, components };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bottleneck`
Expected: PASS (all tests, including Task 1's).

- [ ] **Step 5: Export from the calculator barrel**

Modify `src/calculator/index.ts` — add after the existing `solver` exports:

```ts
export { extractConsumption, computeAllocation } from './bottleneck.js';
export type {
  VariableInput, AllocationTarget, AllocationComponent, AllocationResult,
} from './bottleneck.js';
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add src/calculator/bottleneck.ts src/calculator/bottleneck.test.ts src/calculator/index.ts
git commit -m "feat(calc): computeAllocation — sequential bottleneck allocation sweep"
```

---

### Task 3: Persistence — snapshot v2 (target modes + pinned supply)

Extend the setup snapshot to carry each target's mode + followMax and the shared pinned-supply pool, with backward-compatible v1 loading.

**Files:**
- Modify: `src/web/lib/setups.ts`
- Test: `src/web/lib/setups.test.ts`

**Interfaces:**
- Produces (updated types):

```ts
export type TargetMode = 'fixed' | 'variable';
export interface SnapshotTarget { item: string; amount: number; unit: TimeUnit; mode: TargetMode; followMax: boolean; }
export interface PinnedSupplyEntry { amount: number; unit: TimeUnit; }
export interface SetupSnapshot {
  v: 2;
  targets: SnapshotTarget[];
  displayUnit: TimeUnit;
  proliferatorId: string;
  machineOverrides: MachineOverrides;
  recipeOverrides: RecipeOverrides[];
  pinnedSupply: Record<string, PinnedSupplyEntry>;
}
```
- `decodeSetupUrl` / `loadStoredSetups` accept snapshot `v === 1 || v === 2`. `sanitizeSnapshot` always returns `v: 2`.

- [ ] **Step 1: Write the failing tests**

In `src/web/lib/setups.test.ts`: update the existing `snap` literal to v2 shape, fix the garbage test (v:2 is now valid — use v:3), and add coverage. Replace the file's body with:

```ts
import { describe, it, expect } from 'vitest';
import {
  encodeSetupUrl, decodeSetupUrl, sanitizeSnapshot, canonicalSnapshotKey,
  type SetupSnapshot, type SnapshotValidators,
} from './setups.js';

const validators: SnapshotValidators = {
  isValidItem: (id) => ['iron-ingot', 'copper-ingot', 'circuit-board', 'proliferator-mk3'].includes(id),
  isValidMachine: (id) => ['assembler-mk1', 'smelter-1'].includes(id),
  isValidProliferator: (id) => id === 'none' || id === 'proliferator-mk3',
  // Proliferators are valid items but NOT pinnable.
  isPinnableItem: (id) => ['iron-ingot', 'copper-ingot', 'circuit-board'].includes(id),
};

const snap: SetupSnapshot = {
  v: 2,
  targets: [
    { item: 'iron-ingot', amount: 60, unit: 'minute', mode: 'fixed', followMax: false },
    { item: 'circuit-board', amount: 30, unit: 'second', mode: 'variable', followMax: true },
  ],
  displayUnit: 'minute',
  proliferatorId: 'proliferator-mk3',
  machineOverrides: { 'iron-ingot': 'smelter-1' },
  recipeOverrides: [{}, { 'root/copper-ingot': 'copper-ingot-alt' }],
  pinnedSupply: { 'copper-ingot': { amount: 120, unit: 'minute' } },
};

describe('setups', () => {
  it('round-trips through URL encode/decode', () => {
    expect(decodeSetupUrl(encodeSetupUrl(snap))).toEqual(snap);
  });

  it('decodeSetupUrl accepts v1 and v2 but rejects other versions and garbage', () => {
    expect(decodeSetupUrl('not-base64-$$$')).toBeNull();
    expect(decodeSetupUrl(encodeSetupUrl({ ...snap, v: 3 as unknown as 2 }))).toBeNull();
    // a real v1 payload still decodes (no mode/pinnedSupply fields)
    const v1 = { v: 1, targets: [{ item: 'iron-ingot', amount: 5, unit: 'minute' }], displayUnit: 'minute',
      proliferatorId: 'none', machineOverrides: {}, recipeOverrides: [{}] };
    expect(decodeSetupUrl(encodeSetupUrl(v1 as unknown as SetupSnapshot))).not.toBeNull();
  });

  it('canonicalSnapshotKey is insensitive to machineOverrides key order', () => {
    const a = { ...snap, machineOverrides: { x: 'assembler-mk1', y: 'smelter-1' } };
    const b = { ...snap, machineOverrides: { y: 'smelter-1', x: 'assembler-mk1' } };
    expect(canonicalSnapshotKey(a)).toBe(canonicalSnapshotKey(b));
  });

  it('sanitizeSnapshot upgrades a v1 payload to all-fixed + empty pool', () => {
    const v1 = { v: 1, targets: [{ item: 'iron-ingot', amount: 5, unit: 'minute' }], displayUnit: 'minute',
      proliferatorId: 'none', machineOverrides: {}, recipeOverrides: [{}] };
    const out = sanitizeSnapshot(v1, validators);
    expect(out.v).toBe(2);
    expect(out.targets[0]).toEqual({ item: 'iron-ingot', amount: 5, unit: 'minute', mode: 'fixed', followMax: false });
    expect(out.pinnedSupply).toEqual({});
  });

  it('sanitizeSnapshot keeps modes aligned when an unknown-item target is dropped', () => {
    const dirty = {
      v: 2,
      targets: [
        { item: 'not-real', amount: 1, unit: 'minute', mode: 'variable', followMax: true },
        { item: 'iron-ingot', amount: 2, unit: 'minute', mode: 'variable', followMax: true },
      ],
      displayUnit: 'minute', proliferatorId: 'none', machineOverrides: {},
      recipeOverrides: [{ a: 'b' }, { c: 'd' }],
      pinnedSupply: {},
    };
    const out = sanitizeSnapshot(dirty, validators);
    expect(out.targets).toEqual([{ item: 'iron-ingot', amount: 2, unit: 'minute', mode: 'variable', followMax: true }]);
    expect(out.recipeOverrides).toEqual([{ c: 'd' }]); // override stayed aligned with its target
  });

  it('sanitizeSnapshot drops invalid mode, unknown/proliferator pinned ids, and bad amounts', () => {
    const dirty = {
      v: 2,
      targets: [{ item: 'iron-ingot', amount: 10, unit: 'minute', mode: 'sideways', followMax: 'yes' }],
      displayUnit: 'minute', proliferatorId: 'none', machineOverrides: {}, recipeOverrides: [{}],
      pinnedSupply: {
        'copper-ingot': { amount: 50, unit: 'minute' },
        'ghost-item': { amount: 5, unit: 'minute' },        // unknown → dropped
        'proliferator-mk3': { amount: 20, unit: 'minute' }, // valid item but not pinnable → dropped
        'circuit-board': { amount: -3, unit: 'fortnight' }, // bad amount/unit → clamped/defaulted
      },
    };
    const out = sanitizeSnapshot(dirty, validators);
    expect(out.targets[0].mode).toBe('fixed');     // invalid mode → fixed
    expect(out.targets[0].followMax).toBe(false);  // invalid followMax → false
    expect(out.pinnedSupply).toEqual({
      'copper-ingot': { amount: 50, unit: 'minute' },
      'circuit-board': { amount: 0, unit: 'minute' },
    });
  });

  it('sanitizeSnapshot falls back to one empty fixed target when none survive', () => {
    const out = sanitizeSnapshot({ v: 2, targets: [] }, validators);
    expect(out.targets).toEqual([{ item: '', amount: 60, unit: 'minute', mode: 'fixed', followMax: false }]);
    expect(out.recipeOverrides).toEqual([{}]);
    expect(out.pinnedSupply).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- setups`
Expected: FAIL — types/shape mismatch, `sanitizeSnapshot` returns `v:1`, pinnedSupply unhandled.

- [ ] **Step 3: Update `setups.ts`**

Modify `src/web/lib/setups.ts`:

a) Replace the type block (lines ~1-16) with:

```ts
import type { MachineOverrides, RecipeOverrides } from '../../calculator/index.js';
import type { TimeUnit } from '../hooks/useCalculator.js';

export type TargetMode = 'fixed' | 'variable';
export interface SnapshotTarget { item: string; amount: number; unit: TimeUnit; mode: TargetMode; followMax: boolean; }
export interface PinnedSupplyEntry { amount: number; unit: TimeUnit; }

export interface SetupSnapshot {
  v: 2;
  targets: SnapshotTarget[];
  displayUnit: TimeUnit;
  proliferatorId: string;
  machineOverrides: MachineOverrides;
  recipeOverrides: RecipeOverrides[];
  pinnedSupply: Record<string, PinnedSupplyEntry>;
}

export interface StoredSetup { id: string; name: string; snapshot: SetupSnapshot; }
export interface StoredSetups { v: 1; setups: StoredSetup[]; activeId: string | null; }

export interface SnapshotValidators {
  isValidItem(id: string): boolean;
  isValidMachine(id: string): boolean;
  isValidProliferator(id: string): boolean;
  /** Whether an item may be pinned as available supply (known item, not a proliferator). */
  isPinnableItem(id: string): boolean;
}
```

Note: a **separate** `isPinnableItem` is required because the app's real `isValidItem` is `graph.itemToRecipe.has(id)`, which returns **true** for proliferator items (they are craftable) — reusing it would let pinned proliferator ids survive load, while switching `isValidItem` itself would also drop proliferator *targets*. `isPinnableItem` is supplied by the app in Task 7.

Note: `StoredSetups.v` (the container) stays `1` — its shape is unchanged; only the nested `SetupSnapshot.v` bumps to `2`.

b) In `decodeSetupUrl`, relax the version gate:

```ts
export function decodeSetupUrl(raw: string): SetupSnapshot | null {
  try {
    const parsed = JSON.parse(fromBase64Url(raw));
    if (!parsed || (parsed.v !== 1 && parsed.v !== 2) || !Array.isArray(parsed.targets)) return null;
    return parsed as SetupSnapshot;
  } catch {
    return null;
  }
}
```

c) `loadStoredSetups` already gates on the **container** `parsed.v !== 1` (line ~34) — leave it; the container is still v1. (Per-snapshot upgrade happens in `applySnapshot`/`sanitizeSnapshot`.)

d) Add a unit guard near the existing `isUnit` (it already exists) and rewrite `sanitizeSnapshot`:

```ts
const isMode = (m: unknown): m is TargetMode => m === 'fixed' || m === 'variable';

export function sanitizeSnapshot(input: unknown, v: SnapshotValidators): SetupSnapshot {
  const src = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
  const rawTargets = Array.isArray(src.targets) ? src.targets : [];
  const rawRecipes = Array.isArray(src.recipeOverrides) ? src.recipeOverrides : [];

  const targets: SnapshotTarget[] = [];
  const recipeOverrides: RecipeOverrides[] = [];
  rawTargets.forEach((t, i) => {
    const tt = (t && typeof t === 'object') ? t as Record<string, unknown> : {};
    const item = typeof tt.item === 'string' ? tt.item : '';
    if (item && !v.isValidItem(item)) return; // drop unknown product (keeps mode+override aligned)
    const amount = typeof tt.amount === 'number' && Number.isFinite(tt.amount) && tt.amount >= 0 ? tt.amount : 0;
    const unit = isUnit(tt.unit) ? tt.unit : 'minute';
    const mode = isMode(tt.mode) ? tt.mode : 'fixed';      // v1 payloads have no mode → fixed
    const followMax = tt.followMax === true;
    targets.push({ item, amount, unit, mode, followMax });
    recipeOverrides.push(sanitizeRecord(rawRecipes[i]));
  });
  if (targets.length === 0) {
    targets.push({ item: '', amount: 60, unit: 'minute', mode: 'fixed', followMax: false });
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

  const pinnedSupply: Record<string, PinnedSupplyEntry> = {};
  const ps = (src.pinnedSupply && typeof src.pinnedSupply === 'object')
    ? src.pinnedSupply as Record<string, unknown> : {};
  for (const [item, entry] of Object.entries(ps)) {
    if (!v.isPinnableItem(item)) continue;                 // unknown OR proliferator ids excluded
    const e = (entry && typeof entry === 'object') ? entry as Record<string, unknown> : {};
    const amount = typeof e.amount === 'number' && Number.isFinite(e.amount) && e.amount >= 0 ? e.amount : 0;
    const unit = isUnit(e.unit) ? e.unit : 'minute';
    pinnedSupply[item] = { amount, unit };
  }

  const proliferatorId = typeof src.proliferatorId === 'string' && v.isValidProliferator(src.proliferatorId)
    ? src.proliferatorId : 'none';
  const displayUnit = isUnit(src.displayUnit) ? src.displayUnit : 'minute';

  return { v: 2, targets, displayUnit, proliferatorId, machineOverrides, recipeOverrides, pinnedSupply };
}
```

Note: proliferator-item exclusion is enforced by the dedicated `isPinnableItem` validator, supplied by the app in Task 7 (`itemById.has(id) && !proliferatorItemIds.has(id)`). `isValidItem` is left untouched so proliferator *targets* still validate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- setups`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`
Expected: errors only in `useCalculator.ts` consumers of `SetupSnapshot` (fixed in Task 5). If `tsc -b` fails solely there, that is expected at this point — note it and proceed; the commit below is for setups only.

```bash
git add src/web/lib/setups.ts src/web/lib/setups.test.ts
git commit -m "feat(setups): snapshot v2 — target modes + pinned supply, v1 back-compat"
```

---

### Task 4: Slider UI primitive

Add a theme-aware `Slider` to the UI kit (radix-ui unified package includes `Slider`).

**Files:**
- Modify: `src/web/ui/index.tsx`

**Interfaces:**
- Produces: `Slider` — props are `React.ComponentProps<typeof RSlider.Root>` (radix Slider Root: `value`, `onValueChange`, `onValueCommit`, `min`, `max`, `step`, `disabled`, …).

- [ ] **Step 1: Add the import**

Modify the radix import line in `src/web/ui/index.tsx`:

```ts
import { Tabs as RTabs, Select as RSelect, Tooltip as RTooltip, Dialog as RDialog, Slider as RSlider } from 'radix-ui';
```

- [ ] **Step 2: Add the Slider component**

Append to `src/web/ui/index.tsx`:

```tsx
// ---- Slider ----
export function Slider({ className, ...props }: React.ComponentProps<typeof RSlider.Root>) {
  return (
    <RSlider.Root
      className={cn('relative flex h-5 w-full touch-none select-none items-center', className)}
      {...props}
    >
      <RSlider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
        <RSlider.Range className="absolute h-full rounded-full bg-primary" />
      </RSlider.Track>
      <RSlider.Thumb
        className="block size-4 rounded-full border border-primary bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="value"
      />
    </RSlider.Root>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no new errors from `ui/index.tsx`. (`--background` is defined in `app.css`, so `bg-background` is valid.)

- [ ] **Step 4: Commit**

```bash
git add src/web/ui/index.tsx
git commit -m "feat(ui): add theme-aware Slider primitive"
```

---

### Task 5: Hook wiring — modes, pinned supply, allocation pipeline

Add target mode + followMax, the shared pool, the footprint/allocation derived pipeline, effective-rate solving, and snapshot round-trip.

**Files:**
- Modify: `src/web/hooks/useCalculator.ts`

**Interfaces:**
- Consumes: `extractConsumption`, `computeAllocation`, `VariableInput`, `AllocationResult` from `../../calculator/index.js`; `SetupSnapshot`, `PinnedSupplyEntry`, `TargetMode` from `../lib/setups.js`.
- Produces (additions to `CalculatorState`):

```ts
// CalcTarget gains:
mode: TargetMode;          // 'fixed' | 'variable'
followMax: boolean;        // variable: track sliderMax until the user drags

// new state/actions:
pinnedSupply: Record<string, PinnedSupplyEntry>;
setTargetMode: (id: string, mode: TargetMode) => void;
setVariableRate: (id: string, ratePerSecond: number) => void; // commits a slider drag (followMax→false)
setPinnedSupply: (item: string, amount: number, unit: TimeUnit) => void;
removePinnedSupply: (item: string) => void;
allocation: AllocationResult;            // { targets, components }
// SolvedTarget unchanged; `solved` now reflects effective rates.
```

- [ ] **Step 1: Update imports and the `CalcTarget` type**

In `src/web/hooks/useCalculator.ts`, **augment** the existing imports (do NOT remove the existing `shared-components.js` imports — `combinePlans, collectMachineCounts, buildSharedComponents` — nor the `data.js` import of `graph, proliferators`). Add `extractConsumption, computeAllocation` and the two types to the existing `../../calculator/index.js` import, and add the setups type import:

```ts
import {
  solve, findIntegerMultiplierForValues, familyOfMachine, MACHINE_FAMILY_ORDER,
  extractConsumption, computeAllocation,
  type MachineFamily, type MachineOverrides, type MachineTiers, type RecipeOverrides,
  type ProductionPlan, type VariableInput, type AllocationResult,
} from '../../calculator/index.js';
import type { SetupSnapshot, PinnedSupplyEntry, TargetMode } from '../lib/setups.js';
```

Update `CalcTarget`:

```ts
export interface CalcTarget {
  id: string;
  item: string;
  amount: number;
  unit: TimeUnit;
  mode: TargetMode;     // 'fixed' (today's behavior) | 'variable'
  followMax: boolean;   // variable only: intent tracks current sliderMax until dragged
}
```

Update `newTarget`:

```ts
const newTarget = (item: string, unit: TimeUnit = 'minute', amount = 60): CalcTarget =>
  ({ id: `t${rowSeq++}`, item, amount, unit, mode: 'fixed', followMax: false });
```

- [ ] **Step 2: Add state, actions, and the derived pipeline**

Add state near the other `useState` calls:

```ts
const [pinnedSupply, setPinnedSupplyState] = useState<Record<string, PinnedSupplyEntry>>({});
```

Add actions (near the other `useCallback`s):

```ts
const setTargetMode = useCallback((id: string, mode: TargetMode) => {
  setTargets((prev) => prev.map((t) => (
    t.id === id
      ? { ...t, mode, followMax: mode === 'variable' ? true : false }
      : t
  )));
}, []);

const setVariableRate = useCallback((id: string, ratePerSecond: number) => {
  // A slider commit pins an explicit intent (in the target's unit) and stops following max.
  setTargets((prev) => prev.map((t) => (
    t.id === id
      ? { ...t, followMax: false, amount: Math.max(0, ratePerSecond * UNIT_SECONDS[t.unit]) }
      : t
  )));
}, []);

const setPinnedSupply = useCallback((item: string, amount: number, unit: TimeUnit) => {
  setPinnedSupplyState((prev) => ({ ...prev, [item]: { amount: Math.max(0, amount), unit } }));
}, []);
const removePinnedSupply = useCallback((item: string) => {
  setPinnedSupplyState((prev) => {
    const next = { ...prev }; delete next[item]; return next;
  });
}, []);
```

Also extend the **existing** `setTargetItem` callback so adopting an item that is currently pinned removes that pin (keeps the pool free of dead self-coupling rows). Add this line at the end of `setTargetItem`'s body (after the existing `setTargets`/`setRecipeOverridesByTarget` calls):

```ts
setPinnedSupplyState((prev) => {
  if (!(item in prev)) return prev;
  const next = { ...prev }; delete next[item]; return next;
});
```

Add the derived pipeline (replace the existing `solved` memo and add the new ones). Place after `proliferator` is defined:

```ts
// Pinned pool in items/s. Defensively exclude any item that is ALSO a current
// target's output — pinning a target's own output would self-couple it to its
// own ceiling (the reverse pin/target guard, enforced regardless of how state
// was reached, including loaded URLs).
const targetItems = useMemo(() => new Set(targets.map((t) => t.item).filter(Boolean)), [targets]);
const pinnedIPS = useMemo(() => {
  const m = new Map<string, number>();
  for (const [item, e] of Object.entries(pinnedSupply)) {
    if (targetItems.has(item)) continue;
    m.set(item, e.amount / UNIT_SECONDS[e.unit]);
  }
  return m;
}, [pinnedSupply, targetItems]);

// Fixed targets: solve at real rate; reuse plan downstream. Variable: unit-solve for footprint.
const fixedSolved = useMemo(() =>
  targets
    .filter((t) => t.mode === 'fixed' && graph.itemToRecipe.has(t.item) && t.amount > 0)
    .map((t) => ({
      target: t,
      plan: solve(graph, t.item, t.amount / UNIT_SECONDS[t.unit],
        machineOverrides, { proliferator }, machineTiers, recipeOverridesByTarget[t.id]),
    })),
  [targets, machineOverrides, proliferator, machineTiers, recipeOverridesByTarget]);

const variableFootprints = useMemo(() => {
  const m = new Map<string, Map<string, number>>();
  for (const t of targets) {
    if (t.mode !== 'variable' || !graph.itemToRecipe.has(t.item)) continue;
    const unitPlan = solve(graph, t.item, 1,
      machineOverrides, { proliferator }, machineTiers, recipeOverridesByTarget[t.id]);
    m.set(t.id, extractConsumption(unitPlan));
  }
  return m;
}, [targets, machineOverrides, proliferator, machineTiers, recipeOverridesByTarget]);

const allocation = useMemo<AllocationResult>(() => {
  const fixedUse = new Map<string, number>();
  for (const { plan } of fixedSolved) {
    for (const [c, r] of extractConsumption(plan)) fixedUse.set(c, (fixedUse.get(c) ?? 0) + r);
  }
  const variableInputs: VariableInput[] = [];
  for (const t of targets) {
    if (t.mode !== 'variable') continue;
    const footprint = variableFootprints.get(t.id);
    if (!footprint) continue; // recipe-less variable target → not solvable, skip
    const amountIPS = t.amount / UNIT_SECONDS[t.unit];
    variableInputs.push({
      id: t.id, footprint,
      intent: t.followMax ? Infinity : amountIPS,
      fallback: amountIPS,
    });
  }
  return computeAllocation(pinnedIPS, fixedUse, variableInputs);
}, [targets, fixedSolved, variableFootprints, pinnedIPS]);

const solved = useMemo<SolvedTarget[]>(() => {
  // Reuse the already-solved fixed plans; only variable targets are solved here
  // (at their allocation-resolved effective rate), preserving target order.
  const fixedByeId = new Map(fixedSolved.map((s) => [s.target.id, s]));
  const out: SolvedTarget[] = [];
  for (const t of targets) {
    if (t.mode === 'fixed') {
      const s = fixedByeId.get(t.id);
      if (s) out.push(s);
      continue;
    }
    if (!graph.itemToRecipe.has(t.item)) continue;
    const rateIPS = allocation.targets.get(t.id)?.effectiveRate ?? 0;
    if (rateIPS <= 0) continue;
    out.push({
      target: t,
      plan: solve(graph, t.item, rateIPS,
        machineOverrides, { proliferator }, machineTiers, recipeOverridesByTarget[t.id]),
    });
  }
  return out;
}, [targets, fixedSolved, allocation, machineOverrides, proliferator, machineTiers, recipeOverridesByTarget]);
```

- [ ] **Step 3: Update snapshot get/apply**

Update `getSnapshot`:

```ts
const getSnapshot = useCallback((): SetupSnapshot => ({
  v: 2,
  targets: targets.map((t) => ({ item: t.item, amount: t.amount, unit: t.unit, mode: t.mode, followMax: t.followMax })),
  displayUnit,
  proliferatorId,
  machineOverrides,
  recipeOverrides: targets.map((t) => recipeOverridesByTarget[t.id] ?? {}),
  pinnedSupply,
}), [targets, displayUnit, proliferatorId, machineOverrides, recipeOverridesByTarget, pinnedSupply]);
```

Update `applySnapshot`:

```ts
const applySnapshot = useCallback((snapshot: SetupSnapshot) => {
  const restored = snapshot.targets.map((t) => ({
    id: `t${rowSeq++}`, item: t.item, amount: t.amount, unit: t.unit, mode: t.mode, followMax: t.followMax,
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
  setPinnedSupplyState({ ...snapshot.pinnedSupply });
}, []);
```

- [ ] **Step 4: Expose new fields in the returned object and the `CalculatorState` interface**

Add to `CalculatorState`:

```ts
pinnedSupply: Record<string, PinnedSupplyEntry>;
setTargetMode: (id: string, mode: TargetMode) => void;
setVariableRate: (id: string, ratePerSecond: number) => void;
setPinnedSupply: (item: string, amount: number, unit: TimeUnit) => void;
removePinnedSupply: (item: string) => void;
allocation: AllocationResult;
```

Add to the returned object literal: `pinnedSupply, setTargetMode, setVariableRate, setPinnedSupply, removePinnedSupply, allocation`.

Keep the existing `plans`, `combined`, `integerMultiplier`, `shared` memos — they already derive from `solved`, which now reflects effective rates, so no change is needed there.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors (Task 3's consumer errors now resolved). UI in `App.tsx` may not yet pass new props — that's fine; nothing references the new fields yet.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (existing tests green; no behavior change for all-fixed setups).

- [ ] **Step 7: Commit**

```bash
git add src/web/hooks/useCalculator.ts
git commit -m "feat(hook): target modes, pinned supply pool, allocation pipeline"
```

---

### Task 6: i18n strings (en + zh)

Add all new UI keys at once so later UI tasks compile against them. `en` is the source of truth; `zh` mirrors keys (compile-enforced).

**Files:**
- Modify: `src/web/i18n/locales/en/ui.ts`
- Modify: `src/web/i18n/locales/zh/ui.ts`

**Interfaces:**
- Produces i18n keys: `calculator.modeFixed`, `calculator.modeVariable`, `calculator.variableUnbounded`, `calculator.maxLabel`, and a new `supply.*` group + `chain.limitSupply` / `chain.supplyLimited`.

- [ ] **Step 1: Add keys to `en/ui.ts`**

In `src/web/i18n/locales/en/ui.ts`, inside the `calculator: { … }` object add:

```ts
    modeFixed: 'Fixed',
    modeVariable: 'Variable',
    variableUnbounded: 'Not limited by any pinned supply',
    maxLabel: 'max',
```

Inside `chain: { … }` add:

```ts
    limitSupply: 'Limit available supply',
    supplyLimited: 'Supply-limited',
```

After the `chain: { … }` block (top level of `ui`), add a new group:

```ts
  supply: {
    title: 'Available supply',
    add: 'Add supply',
    remove: 'Remove supply',
    empty: 'Pin a component’s available rate to make targets reflow from the bottleneck.',
    pick: 'Pick a component…',
    fixedUse: 'Fixed use',
    variableUse: 'Variable use',
    free: 'Free',
    overAllocated: 'Over-allocated',
    ceilingHint: 'Sets a throughput ceiling — the chain still builds this item from scratch.',
  },
```

- [ ] **Step 2: Mirror keys in `zh/ui.ts`**

In `src/web/i18n/locales/zh/ui.ts`, inside `calculator` add:

```ts
    modeFixed: '固定',
    modeVariable: '可变',
    variableUnbounded: '不受任何已固定供给限制',
    maxLabel: '最大',
```

Inside `chain` add:

```ts
    limitSupply: '限制可用供给',
    supplyLimited: '供给受限',
```

Add the `supply` group (match placement to `en`):

```ts
  supply: {
    title: '可用供给',
    add: '添加供给',
    remove: '移除供给',
    empty: '固定某个组件的可用产率，使目标根据瓶颈重新分配产量。',
    pick: '选择组件…',
    fixedUse: '固定占用',
    variableUse: '可变占用',
    free: '空闲',
    overAllocated: '超额分配',
    ceilingHint: '设置产量上限——生产链仍会从头制造该物品。',
  },
```

- [ ] **Step 3: Typecheck (key parity)**

Run: `npx tsc -b`
Expected: no errors. A missing/extra key on `zh` (typed `: UiResource`) would error here.

- [ ] **Step 4: Commit**

```bash
git add src/web/i18n/locales/en/ui.ts src/web/i18n/locales/zh/ui.ts
git commit -m "i18n: strings for variable targets & available supply"
```

---

### Task 7: Available Supply panel + App wiring

A new `Section` that is the source of truth for the pool, with a component picker (excluding proliferators and any current target's output) and per-component utilization bars.

**Files:**
- Create: `src/web/components/AvailableSupply.tsx`
- Modify: `src/web/App.tsx` (render the panel; build the proliferator-aware snapshot validator)

**Interfaces:**
- Consumes: `calc.pinnedSupply`, `calc.setPinnedSupply`, `calc.removePinnedSupply`, `calc.allocation.components` (Task 5); `graph.allProducts`, `proliferators` from `../data.js`; `ItemSelector`, `Section`, `Input`, `Select*`, `Button`, `ItemIcon`; `rate` from `../lib/format.js`; `UNIT_SECONDS` from the hook.
- Produces: `<AvailableSupply calc={…} />`.

- [ ] **Step 1: Build the panel component**

Create `src/web/components/AvailableSupply.tsx`:

```tsx
import { useMemo } from 'react';
import XIcon from 'lucide-react/dist/esm/icons/x';
import PlusIcon from 'lucide-react/dist/esm/icons/plus';
import { useTranslation } from 'react-i18next';
import type { useCalculator } from '../hooks/useCalculator.js';
import { UNIT_SECONDS } from '../hooks/useCalculator.js';
import { graph, proliferators } from '../data.js';
import { ItemSelector } from './ItemSelector.js';
import { ItemIcon } from './ItemIcon.js';
import { Section } from './Section.js';
import {
  Input, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, Button,
  Tooltip, TooltipTrigger, TooltipContent,
} from '../ui/index.js';
import { useNames } from '../i18n/useNames.js';
import { rate, num } from '../lib/format.js';
import { cn } from '../lib/cn.js';

type Calc = ReturnType<typeof useCalculator>;

/** Item ids that may not be pinned: proliferator items + every current target's output. */
function useUnpinnableItems(calc: Calc): Set<string> {
  return useMemo(() => {
    const s = new Set<string>();
    for (const p of proliferators) { s.add(p.id); if (p.tier) s.add(p.tier); }
    for (const t of calc.targets) if (t.item) s.add(t.item);
    return s;
  }, [calc.targets]);
}

export function AvailableSupply({ calc }: { calc: Calc }) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const unpinnable = useUnpinnableItems(calc);
  const entries = Object.entries(calc.pinnedSupply);

  // Pickable items: products that aren't already pinned and aren't unpinnable.
  const pickable = useMemo(
    () => graph.allProducts.filter((id) => !unpinnable.has(id) && !(id in calc.pinnedSupply)),
    [unpinnable, calc.pinnedSupply],
  );

  return (
    <Section title={t('supply.title')}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('supply.empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map(([item, entry]) => {
            const comp = calc.allocation.components.get(item);
            const supply = entry.amount / UNIT_SECONDS[entry.unit];
            const pct = (v: number) => (supply > 0 ? Math.min(100, (v / supply) * 100) : 0);
            const fixedPct = comp ? pct(comp.fixedUse) : 0;
            const varPct = comp ? pct(comp.variableUse) : 0;
            const over = comp?.overAllocated ?? false;
            return (
              <div key={item} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ItemIcon id={item} size={20} tinted className="shrink-0" />
                  <span className="min-w-0 truncate text-sm font-medium">{name(item)}</span>
                  <Input
                    type="number" min={0} step="any"
                    value={Number.isFinite(entry.amount) ? entry.amount : ''}
                    onChange={(e) => calc.setPinnedSupply(item, Number(e.target.value) || 0, entry.unit)}
                    className="ml-auto w-20 flex-shrink-0 sm:w-24"
                  />
                  <Select value={entry.unit} onValueChange={(v) => calc.setPinnedSupply(item, entry.amount, v as typeof entry.unit)}>
                    <SelectTrigger className="w-28 flex-shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="second">{t('calculator.perSecond')}</SelectItem>
                      <SelectItem value="minute">{t('calculator.perMinute')}</SelectItem>
                      <SelectItem value="hour">{t('calculator.perHour')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => calc.removePinnedSupply(item)} aria-label={t('supply.remove')}>
                    <XIcon className="size-4" />
                  </Button>
                </div>
                {/* Utilization bar: fixed | variable | free */}
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary" role="img"
                  aria-label={`${t('supply.fixedUse')} ${num(comp?.fixedUse ?? 0)}, ${t('supply.variableUse')} ${num(comp?.variableUse ?? 0)}`}>
                  <div className={cn('h-full', over ? 'bg-amber' : 'bg-primary/60')} style={{ width: `${fixedPct}%` }} />
                  <div className={cn('h-full', over ? 'bg-amber' : 'bg-primary')} style={{ width: `${varPct}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-3 text-[11px] tabular-nums text-muted-foreground">
                  <span>{t('supply.fixedUse')}: {rate(comp?.fixedUse ?? 0, calc.displayUnit)}</span>
                  <span>{t('supply.variableUse')}: {rate(comp?.variableUse ?? 0, calc.displayUnit)}</span>
                  <span>{t('supply.free')}: {rate(comp?.free ?? supply, calc.displayUnit)}</span>
                  {over && <span className="font-semibold text-amber">{t('supply.overAllocated')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <PlusIcon className="size-4 text-muted-foreground" />
        <ItemSelector
          items={pickable}
          value=""
          onChange={(id) => { if (id) calc.setPinnedSupply(id, 60, 'minute'); }}
        />
        <Tooltip>
          <TooltipTrigger asChild><span className="text-xs text-muted-foreground underline decoration-dotted">?</span></TooltipTrigger>
          <TooltipContent className="max-w-xs">{t('supply.ceilingHint')}</TooltipContent>
        </Tooltip>
      </div>
    </Section>
  );
}
```

Note: confirm `ItemSelector`'s prop names against `src/web/components/ItemSelector.tsx` (`items`, `value`, `onChange` per `App.tsx:185`). If `ItemSelector` does not clear after selection, that is acceptable — selecting an item immediately pins it and removes it from `pickable`.

- [ ] **Step 2: Render the panel + wire the proliferator-aware validator in `App.tsx`**

In `src/web/App.tsx`, import and render `<AvailableSupply calc={calc} />` directly below the Targets `</Section>` (before `<MachineDefaults … />`).

```tsx
import { AvailableSupply } from './components/AvailableSupply.js';
// …
      </Section>
      <AvailableSupply calc={calc} />
      <MachineDefaults … />
```

Extend the existing `setupValidators` literal in `App.tsx` (currently at ≈ lines 39-43) with the new `isPinnableItem` member required by the `SnapshotValidators` interface (Task 3). **Leave `isValidItem` unchanged** — it validates targets, and proliferators are legitimate target items. `isPinnableItem` rejects proliferator items (a known item that isn't a proliferator):

```ts
const proliferatorItemIds = new Set(proliferators.flatMap((p) => (p.tier ? [p.id, p.tier] : [p.id])));

const setupValidators: SnapshotValidators = {
  isValidItem: (id) => graph.itemToRecipe.has(id),
  isValidMachine: (id) => machineById.has(id),
  isValidProliferator: (id) => id === 'none' || proliferators.some((p) => p.id === id),
  isPinnableItem: (id) => graph.itemToRecipe.has(id) && !proliferatorItemIds.has(id),
};
```

(`graph`, `proliferators`, and `machineById` are already imported in `App.tsx`. `itemToRecipe.has` covers mined raw veins, which have mining recipes, so they remain pinnable.)

- [ ] **Step 3: Typecheck + manual check**

Run: `npx tsc -b` → no errors.
Run: `npm run dev`, open the Calculator. Pin a component (e.g. add iron ore at 1200/min). The panel shows a utilization bar. With no variable targets the bar shows only fixed use (0 if nothing consumes it). Confirm a proliferator item and any current target item are absent from the picker.

- [ ] **Step 4: Commit**

```bash
git add src/web/components/AvailableSupply.tsx src/web/App.tsx
git commit -m "feat(ui): Available supply panel with utilization bars"
```

---

### Task 8: Target row Fixed/Variable toggle + slider

Add the per-target mode toggle and, for variable targets, the slider (or numeric fallback when unbounded).

**Files:**
- Modify: `src/web/App.tsx`

**Interfaces:**
- Consumes: `calc.setTargetMode`, `calc.setVariableRate`, `calc.allocation.targets`, `calc.displayUnit`, `Slider` (Task 4), `UNIT_SECONDS`.
- Produces: updated target row rendering.

- [ ] **Step 1: Add imports**

In `src/web/App.tsx` add `Slider` to the `../ui/index.js` import and ensure `UNIT_SECONDS` is imported from the hook (it is already imported for the title rate).

- [ ] **Step 2: Replace the per-target amount/unit controls**

Replace the `<Input … />`/`<Select unit>` block (App.tsx ~lines 186-199) with mode-aware rendering. Inside the `calc.targets.map((row) => ( … ))`:

```tsx
{row.mode === 'variable' ? (
  (() => {
    const alloc = calc.allocation.targets.get(row.id);
    const unbounded = alloc ? !alloc.bounded : false;
    const max = alloc?.sliderMax ?? 0;                 // items/s
    const eff = alloc?.effectiveRate ?? 0;             // items/s
    const maxInUnit = max / UNIT_SECONDS[row.unit];
    const effInUnit = eff / UNIT_SECONDS[row.unit];
    return unbounded ? (
      <div className="flex items-center gap-2">
        <Input
          type="number" min={0} step="any"
          value={Number.isFinite(row.amount) ? row.amount : ''}
          onChange={(e) => calc.setVariableRate(row.id, (Number(e.target.value) || 0) / UNIT_SECONDS[row.unit])}
          className="w-20 flex-shrink-0 sm:w-24"
        />
        <span className="text-[11px] text-muted-foreground">{t('calculator.variableUnbounded')}</span>
      </div>
    ) : (
      <div className="flex min-w-[10rem] flex-1 items-center gap-2">
        <Slider
          className="flex-1"
          min={0}
          max={Math.max(maxInUnit, effInUnit, 0.0001)}
          step={Math.max(maxInUnit, effInUnit, 0.0001) / 1000}  /* radix requires a numeric step */
          value={[effInUnit]}
          onValueCommit={(v) => calc.setVariableRate(row.id, (v[0] ?? 0) / UNIT_SECONDS[row.unit])}
        />
        <span className="w-24 shrink-0 text-right text-xs font-medium tabular-nums text-primary">
          {rate(eff, calc.displayUnit)}
        </span>
      </div>
    );
  })()
) : (
  <>
    <Input
      type="number" min={0} step="any"
      value={Number.isFinite(row.amount) ? row.amount : ''}
      onChange={(e) => calc.setTargetAmount(row.id, Number(e.target.value) || 0)}
      className="w-20 flex-shrink-0 sm:w-24"
    />
    <Select value={row.unit} onValueChange={(v) => calc.setTargetUnit(row.id, v as typeof row.unit)}>
      <SelectTrigger className="w-28 flex-shrink-0"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="second">{t('calculator.perSecond')}</SelectItem>
        <SelectItem value="minute">{t('calculator.perMinute')}</SelectItem>
        <SelectItem value="hour">{t('calculator.perHour')}</SelectItem>
      </SelectContent>
    </Select>
  </>
)}
```

- [ ] **Step 3: Add the mode toggle**

Immediately after the controls above (still inside the row, before the remove button), add a Fixed/Variable toggle. Disable Variable for recipe-less items:

```tsx
<Select
  value={row.mode}
  onValueChange={(v) => calc.setTargetMode(row.id, v as 'fixed' | 'variable')}
>
  <SelectTrigger className="w-28 flex-shrink-0" aria-label={t('calculator.modeFixed')}><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="fixed">{t('calculator.modeFixed')}</SelectItem>
    <SelectItem value="variable" disabled={!graph.itemToRecipe.has(row.item)}>{t('calculator.modeVariable')}</SelectItem>
  </SelectContent>
</Select>
```

Ensure `graph` is in scope in `App.tsx` (it is imported already — confirm via the existing `graph.allProducts` usage in the target `ItemSelector`).

- [ ] **Step 4: Fix the per-chain title rate for variable targets**

In `App.tsx`'s `TargetChain` component, the title (≈ line 294) renders
`rate(target.amount / UNIT_SECONDS[target.unit], calc.displayUnit)`, which is the
stored intent — wrong for a variable target. Use the solved plan's root rate, which
is the effective rate for both modes:

```tsx
<span>{name(target.item)} · {rate(plan.root.ratePerSecond, calc.displayUnit)}</span>
```

(`plan` is already destructured from `entry` in `TargetChain`.)

- [ ] **Step 5: Typecheck + manual verification**

Run: `npx tsc -b` → no errors.
Run: `npm run dev`. Scenario:
1. Add target *Processor*, pin *Iron Ore* at a limiting rate.
2. Switch Processor to **Variable** → slider appears, fills to its max (followMax), and the Iron Ore utilization bar fills.
3. Add a second variable target sharing the ore → it initializes to 0 (pool already claimed); drag the first down → the second gains headroom on release.
4. A variable target consuming none of the pinned item shows the numeric fallback + "Not limited by any pinned supply".

- [ ] **Step 6: Commit**

```bash
git add src/web/App.tsx
git commit -m "feat(ui): per-target Fixed/Variable toggle and allocation slider"
```

---

### Task 9: Inline pin from the production chain

Let a chain node write its item + current rate into the shared pool (one source of truth).

**Files:**
- Modify: `src/web/components/ProductionChain.tsx`
- Modify: `src/web/App.tsx` (pass the new props through `TargetChain` → `ProductionChain`)

**Interfaces:**
- Consumes: a new callback + a pinned-set, threaded from the hook.
- Produces: `ProductionChainProps` gains:
  - `onPinSupply?: (item: string, ratePerSecond: number) => void`
  - `pinnedItems?: Set<string>`
  - `unpinnableItems?: Set<string>` (items that may not be pinned: proliferators + target outputs)

- [ ] **Step 1: Extend `ProductionChainProps` and thread to `ChainNode`**

In `src/web/components/ProductionChain.tsx`, add to `ProductionChainProps`:

```ts
  /** Pin this node's item as available supply at the given rate. */
  onPinSupply?: (item: string, ratePerSecond: number) => void;
  /** Items currently pinned (render the affordance as active). */
  pinnedItems?: Set<string>;
  /** Items that cannot be pinned (proliferators, target outputs). */
  unpinnableItems?: Set<string>;
```

Pass all three through `ProductionChain` → `ChainNode` and in the recursive `children.map(...)` call (add `onPinSupply={onPinSupply} pinnedItems={pinnedItems} unpinnableItems={unpinnableItems}` to both the top-level spread and the recursive `<ChainNode … />`).

- [ ] **Step 2: Render the pin affordance**

In `ChainNode`, add an import:

```ts
import PinIcon from 'lucide-react/dist/esm/icons/pin';
```

Destructure the new props in `ChainNode`'s parameter list. Then, right after the rate `<span … >{rate(node.ratePerSecond, timeUnit)}</span>` (App chain row, ~line 108), add:

```tsx
{onPinSupply && !unpinnableItems?.has(node.item) && (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={() => onPinSupply(node.item, node.ratePerSecond)}
        className={cn(
          'shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-amber',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          pinnedItems?.has(node.item) && 'text-amber',
        )}
        aria-label={t('chain.limitSupply')}
      >
        <PinIcon className="size-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent>{pinnedItems?.has(node.item) ? t('chain.supplyLimited') : t('chain.limitSupply')}</TooltipContent>
  </Tooltip>
)}
```

(Reuses the already-imported `Tooltip`/`TooltipTrigger`/`TooltipContent` and `cn`.)

- [ ] **Step 3: Wire props through `App.tsx`**

In `App.tsx`'s `TargetChain` component, where `<ProductionChain … />` is rendered, pass:

```tsx
onPinSupply={(item, ratePerSecond) => {
  // Seed the pool from this node at the display unit, converting items/s → that unit.
  calc.setPinnedSupply(item, ratePerSecond * UNIT_SECONDS[calc.displayUnit], calc.displayUnit);
}}
pinnedItems={new Set(Object.keys(calc.pinnedSupply))}
unpinnableItems={(() => {
  const s = new Set<string>();
  for (const p of proliferators) { s.add(p.id); if (p.tier) s.add(p.tier); }
  for (const t of calc.targets) if (t.item) s.add(t.item);
  return s;
})()}
```

Ensure `proliferators` and `UNIT_SECONDS` are imported in `App.tsx` (UNIT_SECONDS already is; add `proliferators` from `./data.js` if not present — it is used elsewhere, confirm via grep).

Find the `<ProductionChain` usage by grepping `ProductionChain` in `App.tsx` (it lives inside `TargetChain`, after the props already passed like `node`, `timeUnit`, `machineOverrides`, `onMachineChange`, `onRecipeChange`).

- [ ] **Step 4: Typecheck + manual verification**

Run: `npx tsc -b` → no errors.
Run: `npm run dev`. Expand a chain, click the pin icon on an intermediate (e.g. *Magnetic Coil*). It appears in the Available Supply panel at the node's current rate in the display unit. The same item's icon shows active (amber). The pin icon is absent on the root/target item and on proliferator rows.

- [ ] **Step 5: Run full suite + commit**

Run: `npm test` → PASS. Run: `npx tsc -b` → clean.

```bash
git add src/web/components/ProductionChain.tsx src/web/App.tsx
git commit -m "feat(ui): inline pin a chain component into the supply pool"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Linear footprint via unit-solve; root-excluded | 1 |
| `bottleneck.ts` pure module; sequential sweep; global feasibility; over-allocation; unbounded fallback; free clamped | 1, 2 |
| Export from calculator barrel | 2 |
| Snapshot v2: mode-per-target, followMax, pinnedSupply; v1 back-compat; sanitize/version gates | 3 |
| Slider primitive | 4 |
| Hook: CalcTarget.mode/followMax, pinnedSupply state+actions, footprint memo (per-target recipe slice), allocation, effective-rate solving gated on effectiveRate>0, snapshot round-trip, items/s internal | 5 |
| i18n en+zh parity | 6 |
| Available supply panel (source of truth), utilization bars (amber over-allocation, free clamped), proliferator + target-output exclusion | 7 |
| Target row Fixed/Variable toggle, slider, unbounded numeric fallback, Variable disabled for recipe-less items, start-at-max via followMax, commit-on-release (deferred full reflow) | 5, 8 |
| Inline pin → shared pool; bidirectional guard — supply picker excludes target outputs + proliferators (Task 7), the hook neutralizes any target-output pin in `pinnedIPS` and drops it on item adoption (Task 5), `isPinnableItem` rejects proliferators on load (Task 3); throughput-ceiling copy | 3, 5, 6, 7, 9 |
| Tests: bottleneck + persistence; existing solver.test green | 1, 2, 3 |

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — every code step shows full code. Grep-verification steps (ItemSelector props, validator wiring, `bg-background`, `proliferators` import) are explicit confirmations, not deferred work.

**3. Type consistency:** `extractConsumption`/`computeAllocation`/`VariableInput`/`AllocationResult` names match across Tasks 1, 2, 5. `SnapshotTarget`/`PinnedSupplyEntry`/`TargetMode` consistent across Tasks 3, 5. `setVariableRate`/`setPinnedSupply`/`removePinnedSupply`/`setTargetMode`/`allocation` consistent across Tasks 5, 7, 8, 9. `onPinSupply`/`pinnedItems`/`unpinnableItems` consistent across Task 9.

**Deviation flagged for the author/user:** the spec said a freshly-Variable target is initialized to `sliderMax` **once**. This plan implements that via a `followMax` flag that keeps the target tracking its live max until the user drags the slider (then it pins an explicit intent). This is a small, defensible refinement — it avoids a circular "compute max at toggle time" dependency and gives a more useful "fill the remaining pool" behavior — but it differs from a literal one-time initialization. Confirm this is acceptable before/while executing Task 5.

## Notes on verification commands

- `npm test -- <name>` runs Vitest filtered to files matching `<name>`.
- `npx tsc -b` is the project's typecheck/build; it must be clean before each commit.
- The React/UI tasks (4–9) have no RTL harness in this repo; they are verified by `tsc -b` + `npm run dev` manual checks. The load-bearing logic is covered by the pure tests in Tasks 1–3.

## Verification of this plan

This plan was reviewed by an independent subagent that opened every referenced file. It
confirmed the component signatures (`ItemSelector`, `Section`, `rate`/`num`, `ItemIcon`,
the UI kit, `useNames`), the radix `Slider` export, the graph/schema/data shapes, the
CSS tokens, the i18n parity setup, and that `intent=Infinity` is safe end-to-end. Defects
it found are already fixed inline: `graph.itemById` → `itemToRecipe`/top-level export (C1);
radix `Slider` needs a numeric `step` (C2); proliferator exclusion needs a separate
`isPinnableItem` validator, not the shared `isValidItem` (M1); the reverse self-coupling
guard is enforced in the hook (M2); the per-chain title uses the solved root rate (m1);
Task 5 imports augment rather than replace (m2); and `solved` reuses the fixed plans
instead of re-solving (m3).
