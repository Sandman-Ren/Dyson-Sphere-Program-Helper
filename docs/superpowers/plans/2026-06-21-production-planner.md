# Production Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-target "Planner" tab that consolidates a production plan, nets byproducts, and suggests modular shared-production blocks with a dependency graph.

**Architecture:** A new **pure** engine under `src/calculator/planner/` solves a consolidated `A·x = b` balance (Gaussian elimination over a chosen recipe set, byproducts netted, raws/loops handled), then a grouping layer scores intermediates by fan-out and partitions the plan into self-contained blocks. A React tab (`src/web/components/planner/`) driven by a `usePlanner` hook renders block cards, a block dependency graph (reusing the `@xyflow/react` stack), and a totals panel. The single-target Calculator tab is untouched; shared per-recipe machine/proliferator math is extracted from `solver.ts` into a shared module both engines use.

**Tech Stack:** React 19, TypeScript 5.6, Vite 6, Tailwind v4, @xyflow/react + @dagrejs/dagre, react-i18next, Vitest.

## Global Constraints

- **Engine purity:** files under `src/calculator/` must not import from `src/web`. Vitest-covered.
- **Local imports use the `.js` extension** (e.g. `from '../recipe-graph.js'`), matching the bundler resolution.
- **Always-dark theme:** never use the `dark:` prefix; never hardcode colors — use semantic Tailwind classes / CSS variables (`text-foreground`, `bg-card`, `border-border`, `text-primary`, `text-amber`, `text-muted-foreground`).
- **lucide icons** import one-per-file from `lucide-react/dist/esm/icons/<name>`, never the barrel.
- **UI primitives** from `src/web/ui/index.js` (`Button`, `Card`, `Input`, `Label`, `Select…`, `Tabs…`, `Tooltip…`, `Badge`) instead of raw HTML controls.
- **i18n:** never hardcode display text. UI strings go in `src/web/i18n/locales/en/ui.ts` (source of truth) and `src/web/i18n/locales/zh/ui.ts` (typed `: UiResource`, must keep key parity). Game-data names render via `useNames()`; non-React callers use `displayName()`.
- **Validation:** run `npx tsc -b` and `npm test` from `repositories/dsp-helper/main` before considering any task done.
- **Git discipline (user rule):** stage files individually with `git add <file>`; do not `git add -A`. Commit per task as shown; never push unless the user asks.
- **Numeric tolerance:** use `EPS = 1e-9` for float comparisons in the engine.

All commands below run from `repositories/dsp-helper/main`.

---

### Task 1: Extract shared per-recipe machine & proliferator math

Pull `proliferatorEffect`, `tierMachine`, and the inline machine-resolution logic out of `solver.ts` into a shared module so the planner computes identical numbers. Behavior-preserving refactor — guarded by the existing `solver.test.ts`.

**Files:**
- Create: `src/calculator/recipe-runtime.ts`
- Modify: `src/calculator/solver.ts` (remove the moved helpers; import them; use `resolveMachine`)
- Modify: `src/calculator/index.ts` (re-export the shared helpers)
- Test: `src/calculator/recipe-runtime.test.ts`

**Interfaces:**
- Produces:
  - `proliferatorEffect(prolif: Proliferator | null, recipeId: string, machineModules: number, graph: RecipeGraph): { outputMultiplier: number; speedMultiplier: number; powerMultiplier: number; applied: boolean }`
  - `tierMachine(graph: RecipeGraph, recipe: Recipe, machineTiers: MachineTiers | undefined): Machine | null`
  - `resolveMachine(graph: RecipeGraph, recipe: Recipe, itemId: string, machineOverrides: MachineOverrides | undefined, machineTiers: MachineTiers | undefined): Machine | null`

- [ ] **Step 1: Write the failing test**

Create `src/calculator/recipe-runtime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildRecipeGraph } from './recipe-graph.js';
import { resolveMachine, proliferatorEffect } from './recipe-runtime.js';
import type { Recipe, Machine } from '../data/schema.js';
import recipesData from './../data/generated/recipes.json';
import machinesData from './../data/generated/machines.json';
import metaData from './../data/generated/meta.json';

const recipes = recipesData as Recipe[];
const machines = machinesData as Machine[];
const meta = metaData as { excludedRecipes: string[]; proliferableRecipes: string[] };
const graph = buildRecipeGraph(recipes, machines, meta);

describe('resolveMachine', () => {
  it('honors a per-item override when it can run the recipe', () => {
    const ingot = graph.itemToRecipe.get('iron-ingot')!;
    const m = resolveMachine(graph, ingot, 'iron-ingot', { 'iron-ingot': 'arc-smelter' }, undefined);
    expect(m?.id).toBe('arc-smelter');
  });

  it('falls back to the family tier, then the default machine', () => {
    const ingot = graph.itemToRecipe.get('iron-ingot')!;
    expect(resolveMachine(graph, ingot, 'iron-ingot', undefined, { smelter: 'arc-smelter' })?.id).toBe('arc-smelter');
    expect(resolveMachine(graph, ingot, 'iron-ingot', undefined, undefined)?.id).toBe('plane-smelter');
  });
});

describe('proliferatorEffect', () => {
  it('returns the no-op effect when there is no proliferator', () => {
    const fx = proliferatorEffect(null, 'magnetic-coil', 1, graph);
    expect(fx).toEqual({ outputMultiplier: 1, speedMultiplier: 1, powerMultiplier: 1, applied: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recipe-runtime`
Expected: FAIL — `recipe-runtime.js` does not exist / `resolveMachine` not exported.

- [ ] **Step 3: Create the shared module**

Create `src/calculator/recipe-runtime.ts` (move the two helpers from `solver.ts` verbatim, add `resolveMachine`):

```ts
import type { RecipeGraph } from './recipe-graph.js';
import type { Machine, Proliferator, Recipe } from '../data/schema.js';
import { familyOfRecipe, type MachineTiers } from './machine-families.js';
import type { MachineOverrides } from './types.js';

/** The globally-preferred machine for a recipe's family, if it can run the recipe. */
export function tierMachine(
  graph: RecipeGraph,
  recipe: Recipe,
  machineTiers: MachineTiers | undefined,
): Machine | null {
  if (!machineTiers) return null;
  const family = familyOfRecipe(recipe);
  if (!family) return null;
  const preferredId = machineTiers[family];
  if (!preferredId || !recipe.producers.includes(preferredId)) return null;
  return graph.machineById.get(preferredId) ?? null;
}

/**
 * Resolve the machine for a recipe: a valid per-item override wins, then the
 * family tier, then the recipe's default machine.
 */
export function resolveMachine(
  graph: RecipeGraph,
  recipe: Recipe,
  itemId: string,
  machineOverrides: MachineOverrides | undefined,
  machineTiers: MachineTiers | undefined,
): Machine | null {
  const machineOverrideId = machineOverrides?.[itemId];
  return (
    (machineOverrideId && recipe.producers.includes(machineOverrideId)
      ? graph.machineById.get(machineOverrideId)
      : undefined) ??
    tierMachine(graph, recipe, machineTiers) ??
    graph.defaultMachine(recipe)
  );
}

/**
 * Resolve the proliferator effect for a single recipe.
 *
 * - "products" mode multiplies output (only on eligible recipes).
 * - "speed" mode multiplies machine speed.
 * Both raise power draw by the proliferator's `consumption` factor.
 */
export function proliferatorEffect(
  prolif: Proliferator | null,
  recipeId: string,
  machineModules: number,
  graph: RecipeGraph,
): { outputMultiplier: number; speedMultiplier: number; powerMultiplier: number; applied: boolean } {
  const none = { outputMultiplier: 1, speedMultiplier: 1, powerMultiplier: 1, applied: false };
  if (!prolif || machineModules <= 0) return none;

  if (prolif.mode === 'products') {
    if (!graph.proliferableRecipes.has(recipeId)) return none;
    return {
      outputMultiplier: 1 + prolif.productivity,
      speedMultiplier: 1,
      powerMultiplier: 1 + prolif.consumption,
      applied: true,
    };
  }
  return {
    outputMultiplier: 1,
    speedMultiplier: 1 + prolif.speed,
    powerMultiplier: 1 + prolif.consumption,
    applied: true,
  };
}
```

- [ ] **Step 4: Update `solver.ts` to use the shared module**

In `src/calculator/solver.ts`: delete the local `tierMachine` (lines ~9-21) and `proliferatorEffect` (lines ~31-57) functions. Add the import near the top (after the existing imports):

```ts
import { proliferatorEffect, resolveMachine } from './recipe-runtime.js';
```

Then replace the inline machine-resolution block in `solveNode` (the `const machineOverrideId = …` / `const machine = …` block) with:

```ts
  const machine = resolveMachine(graph, recipe, itemId, machineOverrides, machineTiers);
```

Leave the rest of `solveNode` unchanged (it still calls `proliferatorEffect(prolif, recipe.id, machine?.modules ?? 0, graph)`). Remove the now-unused `familyOfRecipe` / `MachineTiers` / `Machine` / `Proliferator` imports from `solver.ts` only if TypeScript flags them as unused.

- [ ] **Step 5: Re-export from `index.ts`**

In `src/calculator/index.ts`, add:

```ts
export { proliferatorEffect, tierMachine, resolveMachine } from './recipe-runtime.js';
```

- [ ] **Step 6: Run tests + typecheck to verify no regression**

Run: `npx tsc -b && npm test`
Expected: PASS — all existing `solver.test.ts` cases and the new `recipe-runtime.test.ts` pass.

- [ ] **Step 7: Commit**

```bash
git add src/calculator/recipe-runtime.ts src/calculator/recipe-runtime.test.ts src/calculator/solver.ts src/calculator/index.ts
git commit -m "refactor(calculator): extract shared recipe-runtime helpers"
```

---

### Task 2: Planner types + Gaussian linear solver

Define the planner data contract and a small dense linear solver (partial-pivot Gaussian elimination) used by the balance solve.

**Files:**
- Create: `src/calculator/planner/types.ts`
- Create: `src/calculator/planner/matrix.ts` (solver in this task; balance logic added in Task 3)
- Test: `src/calculator/planner/matrix.test.ts`

**Interfaces:**
- Produces (types):
  - `PlannerTarget { item: string; ratePerSecond: number }`
  - `PlannerRecipeOverrides = Record<string, string>` (item id → recipe id)
  - `ItemBalance { item: string; demand: number; supplied: number; consumed: number; surplus: number }`
  - `SolvedRecipe { recipe: Recipe; mainItem: string; machine: Machine | null; runsPerSecond: number; machinesNeeded: number; powerKW: number; proliferated: boolean }`
  - `PlannerError { item: string; kind: 'singular' | 'infeasible' | 'deficit'; message: string }`
  - `BalancedPlan { recipes: SolvedRecipe[]; producerOf: Map<string, SolvedRecipe>; balances: ItemBalance[]; totalMachines: Record<string, number>; rawResources: Record<string, number>; totalPowerKW: number; proliferatorSpraysPerSecond: number; surpluses: ItemBalance[]; errors: PlannerError[] }`
- Produces (solver): `solveLinearSystem(a: number[][], b: number[]): number[] | null` — returns `null` when the matrix is singular.

- [ ] **Step 1: Write the failing test**

Create `src/calculator/planner/matrix.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { solveLinearSystem } from './matrix.js';

describe('solveLinearSystem', () => {
  it('solves a 2x2 system', () => {
    // x + y = 3 ; x - y = 1  → x=2, y=1
    const x = solveLinearSystem([[1, 1], [1, -1]], [3, 1]);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(2, 9);
    expect(x![1]).toBeCloseTo(1, 9);
  });

  it('handles a system needing pivoting (leading zero)', () => {
    // 0x + 1y = 2 ; 1x + 1y = 3  → x=1, y=2
    const x = solveLinearSystem([[0, 1], [1, 1]], [2, 3]);
    expect(x![0]).toBeCloseTo(1, 9);
    expect(x![1]).toBeCloseTo(2, 9);
  });

  it('returns null for a singular matrix', () => {
    expect(solveLinearSystem([[1, 1], [2, 2]], [1, 2])).toBeNull();
  });

  it('solves the trivial 1x1 system', () => {
    expect(solveLinearSystem([[4]], [8])![0]).toBeCloseTo(2, 9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- planner/matrix`
Expected: FAIL — `matrix.js` / `solveLinearSystem` not found.

- [ ] **Step 3: Write the types**

Create `src/calculator/planner/types.ts`:

```ts
import type { Recipe, Machine } from '../../data/schema.js';

/** One production target: an item id and a desired rate (items/s). */
export interface PlannerTarget {
  item: string;
  ratePerSecond: number;
}

/** Per-item active-recipe override: produced-item id → recipe id. */
export type PlannerRecipeOverrides = Record<string, string>;

/** Net balance for a single item across the whole plan (items/s). */
export interface ItemBalance {
  item: string;
  demand: number;    // external (target) demand
  supplied: number;  // total produced incl. byproducts
  consumed: number;  // total consumed by active recipes
  surplus: number;   // supplied - consumed - demand
}

/** A solved recipe in the consolidated plan. */
export interface SolvedRecipe {
  recipe: Recipe;
  /** The item this recipe is the chosen producer of (its balance row). */
  mainItem: string;
  machine: Machine | null;
  runsPerSecond: number;   // recipe runs/s (the x vector)
  machinesNeeded: number;  // fractional building count
  powerKW: number;
  proliferated: boolean;
}

export interface PlannerError {
  item: string;
  kind: 'singular' | 'infeasible' | 'deficit';
  message: string;
}

/** The consolidated, byproduct-netted plan (pre-grouping). */
export interface BalancedPlan {
  recipes: SolvedRecipe[];
  /** Every produced item → the recipe that produces it (incl. byproduct items). */
  producerOf: Map<string, SolvedRecipe>;
  balances: ItemBalance[];
  totalMachines: Record<string, number>;
  rawResources: Record<string, number>;
  totalPowerKW: number;
  proliferatorSpraysPerSecond: number;
  surpluses: ItemBalance[];
  errors: PlannerError[];
}
```

- [ ] **Step 4: Write the linear solver**

Create `src/calculator/planner/matrix.ts`:

```ts
const EPS = 1e-9;

/**
 * Solve a dense square linear system A·x = b by Gaussian elimination with
 * partial pivoting. Returns null when the matrix is singular (no unique
 * solution). A and b are not mutated.
 */
export function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  // Augmented matrix copy.
  const m = a.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    // Partial pivot: largest magnitude in this column at/below the diagonal.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < EPS) return null; // singular
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];

    // Eliminate below.
    for (let r = col + 1; r < n; r++) {
      const factor = m[r]![col]! / m[col]![col]!;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) m[r]![c]! -= factor * m[col]![c]!;
    }
  }

  // Back-substitution.
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = m[row]![n]!;
    for (let c = row + 1; c < n; c++) sum -= m[row]![c]! * x[c]!;
    x[row] = sum / m[row]![row]!;
  }
  return x;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- planner/matrix`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/calculator/planner/types.ts src/calculator/planner/matrix.ts src/calculator/planner/matrix.test.ts
git commit -m "feat(planner): add planner types and Gaussian linear solver"
```

---

### Task 3: Balance solve (consolidation + byproduct netting + loops)

Build the consolidated `A·x = b` balance from a recipe graph and a target list, then derive machines/power/raw/surplus. This is the engine core.

**Files:**
- Modify: `src/calculator/planner/matrix.ts` (add `balance`)
- Test: `src/calculator/planner/matrix.test.ts` (add cases)

**Interfaces:**
- Consumes: `solveLinearSystem` (Task 2); `proliferatorEffect`, `resolveMachine` (Task 1); `RecipeGraph`; `MachineOverrides` from `../types.js`; `MachineTiers` from `../machine-families.js`.
- Produces:
  - `interface BalanceOptions { machineOverrides?: MachineOverrides; recipeOverrides?: PlannerRecipeOverrides; machineTiers?: MachineTiers; proliferator?: Proliferator | null }`
  - `balance(graph: RecipeGraph, targets: PlannerTarget[], options?: BalanceOptions): BalancedPlan`

- [ ] **Step 1: Write the failing tests**

Append to `src/calculator/planner/matrix.test.ts`:

```ts
import { balance } from './matrix.js';
import { buildRecipeGraph } from '../recipe-graph.js';
import type { Recipe, Machine, Proliferator } from '../../data/schema.js';
import recipesData from '../../data/generated/recipes.json';
import machinesData from '../../data/generated/machines.json';
import metaData from '../../data/generated/meta.json';
import proliferatorsData from '../../data/generated/proliferators.json';

const realRecipes = recipesData as Recipe[];
const realMachines = machinesData as Machine[];
const realMeta = metaData as { excludedRecipes: string[]; proliferableRecipes: string[] };
const realProliferators = proliferatorsData as Proliferator[];
const realGraph = buildRecipeGraph(realRecipes, realMachines, realMeta);

// A tiny synthetic dataset for deterministic numeric assertions.
const SMELTER: Machine = {
  id: 's', name: 'S', speed: 1, usageKW: 100, drainKW: 0, modules: 0, powerType: 'electric',
};
function synth(recipes: Recipe[]) {
  return buildRecipeGraph(recipes, [SMELTER], { excludedRecipes: [], proliferableRecipes: [] });
}

describe('balance — consolidation', () => {
  it('consolidates a shared intermediate into a single recipe entry', () => {
    // a and b both consume 1 shared per craft; shared is crafted from raw.
    const g = synth([
      { id: 'a', name: 'a', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'a', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'b', name: 'b', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'b', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'shared', name: 'shared', time: 1, in: [{ id: 'raw', amount: 1 }], out: [{ id: 'shared', amount: 1 }], producers: ['s'], flags: [] },
    ]);
    const plan = balance(g, [{ item: 'a', ratePerSecond: 2 }, { item: 'b', ratePerSecond: 3 }]);
    const sharedRecipes = plan.recipes.filter((r) => r.mainItem === 'shared');
    expect(sharedRecipes).toHaveLength(1);            // one entry, not two
    expect(sharedRecipes[0]!.runsPerSecond).toBeCloseTo(5, 9); // 2 + 3
    expect(plan.rawResources['raw']).toBeCloseTo(5, 9);
  });
});

describe('balance — byproduct netting', () => {
  it('offsets demand with byproduct surplus', () => {
    // main: raw -> main + 1 bp (byproduct). bp also has its own recipe raw2 -> bp.
    // Demand 10 main + 4 bp. main runs = 10 → yields 10 bp → covers 4 demand,
    // leaving 6 surplus, and the bp recipe runs 0.
    const g = synth([
      { id: 'main', name: 'main', time: 1, in: [{ id: 'raw', amount: 1 }], out: [{ id: 'main', amount: 1 }, { id: 'bp', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'bp', name: 'bp', time: 1, in: [{ id: 'raw2', amount: 1 }], out: [{ id: 'bp', amount: 1 }], producers: ['s'], flags: [] },
    ]);
    const plan = balance(g, [{ item: 'main', ratePerSecond: 10 }, { item: 'bp', ratePerSecond: 4 }]);
    expect(plan.producerOf.get('main')!.runsPerSecond).toBeCloseTo(10, 9);
    expect(plan.producerOf.get('bp')!.runsPerSecond).toBeCloseTo(0, 9);  // fully covered by byproduct
    const bpBalance = plan.balances.find((b) => b.item === 'bp')!;
    expect(bpBalance.surplus).toBeCloseTo(6, 9);
    expect(plan.surpluses.some((s) => s.item === 'bp')).toBe(true);
  });
});

describe('balance — loop', () => {
  it('terminates and balances a 2-recipe loop', () => {
    // r1: raw + 1 y -> 2 x ; r2: 1 x -> 1 y. Demand 2 x.
    // x balance: 2*r1 - 1*r2 = 2 ; y balance: 1*r2 - 1*r1 = 0 → r1=r2 → r1=r2=2.
    const g = synth([
      { id: 'r1', name: 'r1', time: 1, in: [{ id: 'raw', amount: 1 }, { id: 'y', amount: 1 }], out: [{ id: 'x', amount: 2 }], producers: ['s'], flags: [] },
      { id: 'r2', name: 'r2', time: 1, in: [{ id: 'x', amount: 1 }], out: [{ id: 'y', amount: 1 }], producers: ['s'], flags: [] },
    ]);
    const plan = balance(g, [{ item: 'x', ratePerSecond: 2 }]);
    expect(plan.producerOf.get('x')!.runsPerSecond).toBeCloseTo(2, 9);
    expect(plan.producerOf.get('y')!.runsPerSecond).toBeCloseTo(2, 9);
    expect(plan.errors).toHaveLength(0);
  });
});

describe('balance — real data smoke', () => {
  it('produces consolidated totals for two sharing targets', () => {
    const plan = balance(realGraph, [
      { item: 'electromagnetic-matrix', ratePerSecond: 1 },
      { item: 'energy-matrix', ratePerSecond: 1 },
    ]);
    expect(plan.errors).toHaveLength(0);
    expect(Object.keys(plan.totalMachines).length).toBeGreaterThan(3);
    expect(plan.rawResources['iron-ore']).toBeGreaterThan(0);
    // magnetic-coil is shared by both matrices → exactly one recipe entry.
    expect(plan.recipes.filter((r) => r.mainItem === 'magnetic-coil')).toHaveLength(1);
  });

  it('applies an extra-products proliferator (fewer raws)', () => {
    const mk3 = realProliferators.find((p) => p.id === 'proliferator-3-products')!;
    const base = balance(realGraph, [{ item: 'magnetic-coil', ratePerSecond: 10 }]);
    const sprayed = balance(realGraph, [{ item: 'magnetic-coil', ratePerSecond: 10 }], { proliferator: mk3 });
    expect(sprayed.rawResources['iron-ore']).toBeLessThan(base.rawResources['iron-ore']);
    expect(sprayed.proliferatorSpraysPerSecond).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- planner/matrix`
Expected: FAIL — `balance` not exported.

- [ ] **Step 3: Implement `balance`**

Add to the top of `src/calculator/planner/matrix.ts` (imports) and append the function:

```ts
import type { RecipeGraph } from '../recipe-graph.js';
import type { Proliferator, Recipe } from '../../data/schema.js';
import type { MachineOverrides } from '../types.js';
import type { MachineTiers } from '../machine-families.js';
import { proliferatorEffect, resolveMachine } from '../recipe-runtime.js';
import type {
  PlannerTarget, PlannerRecipeOverrides, BalancedPlan, SolvedRecipe, ItemBalance, PlannerError,
} from './types.js';

export interface BalanceOptions {
  machineOverrides?: MachineOverrides;
  recipeOverrides?: PlannerRecipeOverrides;
  machineTiers?: MachineTiers;
  proliferator?: Proliferator | null;
}

/** The chosen producing recipe for an item: a valid override, else the primary. */
function recipeForItem(
  graph: RecipeGraph,
  itemId: string,
  recipeOverrides: PlannerRecipeOverrides | undefined,
): Recipe | undefined {
  const overrideId = recipeOverrides?.[itemId];
  const override = overrideId ? graph.recipeById.get(overrideId) : undefined;
  if (override && override.out.some((o) => o.id === itemId)) return override;
  return graph.itemToRecipe.get(itemId);
}

/**
 * Solve a consolidated production plan for a set of targets.
 *
 * Builds an items×recipes net-production matrix over the chosen recipe set (one
 * active recipe per produced item; raw items are free sources), solves A·x = b
 * for recipe run-rates, nets byproducts, and derives machine/power/raw totals.
 */
export function balance(
  graph: RecipeGraph,
  targets: PlannerTarget[],
  options: BalanceOptions = {},
): BalancedPlan {
  const { machineOverrides, recipeOverrides, machineTiers, proliferator = null } = options;
  const errors: PlannerError[] = [];

  // External demand per item (merge duplicate targets).
  const demand = new Map<string, number>();
  for (const t of targets) {
    if (t.ratePerSecond > 0) demand.set(t.item, (demand.get(t.item) ?? 0) + t.ratePerSecond);
  }

  // 1. Discover every produced item reachable from the targets (BFS over inputs).
  const produced = new Set<string>();    // items with an active producing recipe
  const recipeByItem = new Map<string, Recipe>();
  const queue: string[] = [...demand.keys()];
  const seen = new Set<string>(queue);
  while (queue.length) {
    const item = queue.shift()!;
    const recipe = recipeForItem(graph, item, recipeOverrides);
    if (!recipe) continue; // truly raw (no recipe) → free source
    produced.add(item);
    recipeByItem.set(item, recipe);
    for (const inp of recipe.in) {
      if (!seen.has(inp.id)) { seen.add(inp.id); queue.push(inp.id); }
    }
  }

  // 2. Assign one main item per chosen recipe. Targets claim first so a target
  //    item is always balanced (never demoted to byproduct-only).
  const order = [...produced].sort((a, b) => {
    const ta = demand.has(a) ? 0 : 1;
    const tb = demand.has(b) ? 0 : 1;
    return ta - tb || a.localeCompare(b);
  });
  const claimed = new Set<string>();          // recipe ids already claimed
  const mains: { recipe: Recipe; mainItem: string }[] = [];
  for (const item of order) {
    const recipe = recipeByItem.get(item)!;
    if (claimed.has(recipe.id)) continue;     // byproduct-only item
    claimed.add(recipe.id);
    mains.push({ recipe, mainItem: item });
  }

  // 3. Resolve machine + proliferator effect per chosen recipe.
  const n = mains.length;
  const machines = mains.map((m) => resolveMachine(graph, m.recipe, m.mainItem, machineOverrides, machineTiers));
  const fx = mains.map((m) => proliferatorEffect(proliferator, m.recipe.id, machines[mains.indexOf(m)]?.modules ?? 0, graph));

  // Helper: net amount of `item` produced per run of recipe j (out*outMult − in).
  const outAmount = (j: number, item: string) =>
    (mains[j]!.recipe.out.find((o) => o.id === item)?.amount ?? 0) * fx[j]!.outputMultiplier;
  const inAmount = (j: number, item: string) =>
    mains[j]!.recipe.in.find((i) => i.id === item)?.amount ?? 0;

  // 4. Build the square system: row k balances mains[k].mainItem.
  const a: number[][] = [];
  const bvec: number[] = [];
  for (let k = 0; k < n; k++) {
    const rowItem = mains[k]!.mainItem;
    const row = new Array<number>(n).fill(0);
    for (let j = 0; j < n; j++) row[j] = outAmount(j, rowItem) - inAmount(j, rowItem);
    a.push(row);
    bvec.push(demand.get(rowItem) ?? 0);
  }

  // 5. Solve.
  const x = n === 0 ? [] : solveLinearSystem(a, bvec);
  const runs = x ?? new Array<number>(n).fill(0);
  if (n > 0 && x === null) {
    errors.push({ item: '', kind: 'singular', message: 'Recipe set is linearly dependent; cannot solve uniquely.' });
  }

  // 6. Derive per-recipe outputs + running totals.
  const recipes: SolvedRecipe[] = [];
  const producerOf = new Map<string, SolvedRecipe>();
  const totalMachines: Record<string, number> = {};
  let totalPowerKW = 0;
  let proliferatorSpraysPerSecond = 0;

  for (let j = 0; j < n; j++) {
    const { recipe, mainItem } = mains[j]!;
    const machine = machines[j]!;
    const effect = fx[j]!;
    const run = Math.max(0, runs[j]!);
    if (runs[j]! < -1e-6) {
      errors.push({ item: mainItem, kind: 'infeasible', message: `Negative run-rate for ${mainItem}.` });
    }
    const speed = (machine?.speed ?? 1) * effect.speedMultiplier;
    const machinesNeeded = run * (recipe.time / speed);
    let powerKW = 0;
    if (machine && machine.powerType === 'electric') {
      powerKW = machinesNeeded * machine.usageKW * effect.powerMultiplier;
    }
    if (machine) totalMachines[machine.id] = (totalMachines[machine.id] ?? 0) + machinesNeeded;
    totalPowerKW += powerKW;
    if (effect.applied && proliferator) {
      const inputItemsPerSecond = recipe.in.reduce((sum, i) => sum + i.amount, 0) * run;
      proliferatorSpraysPerSecond += inputItemsPerSecond / proliferator.sprays;
    }
    const solved: SolvedRecipe = {
      recipe, mainItem, machine, runsPerSecond: run, machinesNeeded, powerKW,
      proliferated: effect.applied,
    };
    recipes.push(solved);
    for (const o of recipe.out) if (!producerOf.has(o.id)) producerOf.set(o.id, solved);
  }

  // 7. Balances + raw resources + surpluses.
  const allItems = new Set<string>([...seen, ...demand.keys()]);
  const balances: ItemBalance[] = [];
  const rawResources: Record<string, number> = {};
  for (const item of allItems) {
    let supplied = 0;
    let consumed = 0;
    for (let j = 0; j < n; j++) {
      supplied += outAmount(j, item) * runs[j]!;
      consumed += inAmount(j, item) * runs[j]!;
    }
    const ext = demand.get(item) ?? 0;
    const surplus = supplied - consumed - ext;
    balances.push({ item, demand: ext, supplied, consumed, surplus });

    const recipe = recipeByItem.get(item);
    if (!recipe) {
      // No recipe → truly raw: extraction equals consumption + demand.
      const need = consumed + ext;
      if (need > 1e-9) rawResources[item] = need;
    } else if (recipe.flags.includes('mining')) {
      // Mined ore: list extraction (its production) as a raw resource.
      if (supplied > 1e-9) rawResources[item] = supplied;
    } else if (surplus < -1e-6 && !producerOf.has(item)) {
      errors.push({ item, kind: 'deficit', message: `${item} is consumed but not produced.` });
    }
  }
  const surpluses = balances.filter((b) => b.surplus > 1e-6 && !graph.minedResources.has(b.item));

  return {
    recipes, producerOf, balances,
    totalMachines, rawResources, totalPowerKW, proliferatorSpraysPerSecond,
    surpluses, errors,
  };
}
```

Note: the `fx` line uses `mains.indexOf(m)` — replace with an index-based map to avoid O(n²) and identity issues. Use this instead:

```ts
  const fx = mains.map((m, j) => proliferatorEffect(proliferator, m.recipe.id, machines[j]?.modules ?? 0, graph));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- planner/matrix`
Expected: PASS (all consolidation, byproduct, loop, and real-data cases).

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/calculator/planner/matrix.ts src/calculator/planner/matrix.test.ts
git commit -m "feat(planner): consolidated byproduct-netting balance solver"
```

---

### Task 4: Intermediate scoring (fan-out, throughput, suggestions)

Score every produced intermediate and flag which to suggest as shared blocks.

**Files:**
- Create: `src/calculator/planner/blocks.ts` (scoring here; grouping in Task 5)
- Test: `src/calculator/planner/blocks.test.ts`

**Interfaces:**
- Consumes: `BalancedPlan` (Task 3).
- Produces:
  - `interface BlockSuggestion { item: string; fanOut: number; throughput: number; score: number; suggested: boolean }`
  - `scoreIntermediates(plan: BalancedPlan, targetItems: Set<string>): BlockSuggestion[]` — sorted by score desc. A target item is never a suggestion (it is always its own block). `suggested` is true when `fanOut >= 2` and `throughput >= median throughput` of scored items.

- [ ] **Step 1: Write the failing test**

Create `src/calculator/planner/blocks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildRecipeGraph } from '../recipe-graph.js';
import { balance } from './matrix.js';
import { scoreIntermediates } from './blocks.js';
import type { Recipe, Machine } from '../../data/schema.js';

const S: Machine = { id: 's', name: 'S', speed: 1, usageKW: 100, drainKW: 0, modules: 0, powerType: 'electric' };
const synth = (r: Recipe[]) => buildRecipeGraph(r, [S], { excludedRecipes: [], proliferableRecipes: [] });

const SHARED = synth([
  { id: 'a', name: 'a', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'a', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'b', name: 'b', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'b', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'shared', name: 'shared', time: 1, in: [{ id: 'raw', amount: 1 }], out: [{ id: 'shared', amount: 1 }], producers: ['s'], flags: [] },
]);

describe('scoreIntermediates', () => {
  it('flags a high-fan-out shared item as a suggestion', () => {
    const plan = balance(SHARED, [{ item: 'a', ratePerSecond: 2 }, { item: 'b', ratePerSecond: 2 }]);
    const scores = scoreIntermediates(plan, new Set(['a', 'b']));
    const shared = scores.find((s) => s.item === 'shared')!;
    expect(shared.fanOut).toBe(2);
    expect(shared.throughput).toBeCloseTo(4, 9);
    expect(shared.suggested).toBe(true);
  });

  it('never suggests a target item', () => {
    const plan = balance(SHARED, [{ item: 'a', ratePerSecond: 2 }, { item: 'b', ratePerSecond: 2 }]);
    const scores = scoreIntermediates(plan, new Set(['a', 'b']));
    expect(scores.some((s) => s.item === 'a')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- planner/blocks`
Expected: FAIL — `blocks.js` / `scoreIntermediates` not found.

- [ ] **Step 3: Implement scoring**

Create `src/calculator/planner/blocks.ts`:

```ts
import type { BalancedPlan } from './types.js';

export interface BlockSuggestion {
  item: string;
  fanOut: number;       // distinct active recipes consuming this item
  throughput: number;   // total items/s consumed across the plan
  score: number;        // fanOut × throughput
  suggested: boolean;
}

/**
 * Score every produced intermediate by how worth centralizing it is.
 * Fan-out (distinct consumers) is the centralization signal; throughput breaks
 * ties. Target items are excluded — they are always their own block.
 */
export function scoreIntermediates(plan: BalancedPlan, targetItems: Set<string>): BlockSuggestion[] {
  // item → set of consuming recipe ids, and total consumed rate.
  const consumers = new Map<string, Set<string>>();
  const throughput = new Map<string, number>();
  for (const sr of plan.recipes) {
    if (sr.runsPerSecond <= 0) continue;
    for (const inp of sr.recipe.in) {
      const set = consumers.get(inp.id) ?? new Set<string>();
      set.add(sr.recipe.id);
      consumers.set(inp.id, set);
      throughput.set(inp.id, (throughput.get(inp.id) ?? 0) + inp.amount * sr.runsPerSecond);
    }
  }

  const items = [...plan.producerOf.keys()].filter(
    (item) => !targetItems.has(item) && !plan.producerOf.get(item)!.recipe.flags.includes('mining'),
  );

  const throughputs = items.map((i) => throughput.get(i) ?? 0).filter((t) => t > 0).sort((a, b) => a - b);
  const median = throughputs.length ? throughputs[Math.floor(throughputs.length / 2)]! : 0;

  const out: BlockSuggestion[] = items.map((item) => {
    const fanOut = consumers.get(item)?.size ?? 0;
    const tp = throughput.get(item) ?? 0;
    return { item, fanOut, throughput: tp, score: fanOut * tp, suggested: fanOut >= 2 && tp >= median && tp > 0 };
  });
  return out.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- planner/blocks`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calculator/planner/blocks.ts src/calculator/planner/blocks.test.ts
git commit -m "feat(planner): fan-out scoring for shared-block suggestions"
```

---

### Task 5: Block carving + commonality index

Partition the consolidated plan into self-contained blocks (one export each) and compute the commonality score. Recipe runs are partitioned by consumption share so block sums reconcile with global totals.

**Files:**
- Modify: `src/calculator/planner/blocks.ts` (add `groupPlan`, `commonalityIndex`)
- Modify: `src/calculator/planner/types.ts` (add `Block`, `GroupedPlan`)
- Test: `src/calculator/planner/blocks.test.ts` (add cases)

**Interfaces:**
- Consumes: `BalancedPlan`, `PlannerTarget` (Task 3).
- Produces (types):
  - `interface BlockImport { item: string; rate: number; raw: boolean }`
  - `interface BlockFeed { block: string; rate: number }`
  - `interface Block { item: string; kind: 'target' | 'shared'; exportRate: number; recipes: SolvedRecipe[]; machines: Record<string, number>; powerKW: number; imports: BlockImport[]; feeds: BlockFeed[] }`
  - `interface GroupedPlan { blocks: Block[]; commonalityIndex: number; totalMachines: Record<string, number>; rawResources: Record<string, number>; totalPowerKW: number; surpluses: ItemBalance[]; errors: PlannerError[] }`
- Produces (fns):
  - `groupPlan(plan: BalancedPlan, targets: PlannerTarget[], blockItems: Set<string>): GroupedPlan`
  - `commonalityIndex(plan: BalancedPlan, targets: PlannerTarget[]): number`

Note: `blockItems` must always include every target item; `groupPlan` adds them defensively.

- [ ] **Step 1: Add the types**

Append to `src/calculator/planner/types.ts`:

```ts
export interface BlockImport {
  item: string;
  rate: number;   // items/s imported into this block
  raw: boolean;   // true when the import is a raw/mined resource
}

export interface BlockFeed {
  block: string;  // consumer block's export item id
  rate: number;   // items/s of this block's export consumed by that block
}

/** A self-contained production cell exporting exactly one item. */
export interface Block {
  item: string;                    // the export item id
  kind: 'target' | 'shared';
  exportRate: number;              // items/s leaving the block (external + to other blocks)
  recipes: SolvedRecipe[];         // internal recipes (run-rates scaled to this block's share)
  machines: Record<string, number>;
  powerKW: number;
  imports: BlockImport[];
  feeds: BlockFeed[];
}

export interface GroupedPlan {
  blocks: Block[];
  commonalityIndex: number;        // 0..1 Martin & Ishii commonality of the target set
  totalMachines: Record<string, number>;
  rawResources: Record<string, number>;
  totalPowerKW: number;
  surpluses: ItemBalance[];
  errors: PlannerError[];
}
```

- [ ] **Step 2: Write the failing tests**

Append to `src/calculator/planner/blocks.test.ts`:

```ts
import { groupPlan, commonalityIndex } from './blocks.js';

describe('groupPlan', () => {
  it('carves a shared block fed into both targets and reconciles totals', () => {
    const plan = balance(SHARED, [{ item: 'a', ratePerSecond: 2 }, { item: 'b', ratePerSecond: 3 }]);
    const grouped = groupPlan(plan, [{ item: 'a', ratePerSecond: 2 }, { item: 'b', ratePerSecond: 3 }], new Set(['a', 'b', 'shared']));

    const block = (id: string) => grouped.blocks.find((bl) => bl.item === id)!;
    expect(grouped.blocks.map((b) => b.item).sort()).toEqual(['a', 'b', 'shared']);
    // shared block exports 5/s total, consumed 2 by a and 3 by b.
    expect(block('shared').exportRate).toBeCloseTo(5, 9);
    expect(block('shared').feeds.sort((x, y) => x.block.localeCompare(y.block)))
      .toEqual([{ block: 'a', rate: 2 }, { block: 'b', rate: 3 }]);
    // a imports 2 shared; b imports 3 shared.
    expect(block('a').imports).toEqual([{ item: 'shared', rate: 2, raw: false }]);
    // block run-rates sum back to the global shared run-rate (5).
    expect(block('shared').recipes.find((r) => r.mainItem === 'shared')!.runsPerSecond).toBeCloseTo(5, 9);
  });

  it('inlines a shared item into its single consumer when not a block', () => {
    const plan = balance(SHARED, [{ item: 'a', ratePerSecond: 2 }, { item: 'b', ratePerSecond: 3 }]);
    // 'shared' demoted to inline → split across a and b blocks.
    const grouped = groupPlan(plan, [{ item: 'a', ratePerSecond: 2 }, { item: 'b', ratePerSecond: 3 }], new Set(['a', 'b']));
    expect(grouped.blocks.map((b) => b.item).sort()).toEqual(['a', 'b']);
    const a = grouped.blocks.find((b) => b.item === 'a')!;
    // a's block now contains the shared recipe at the portion feeding a (2/s).
    expect(a.recipes.find((r) => r.mainItem === 'shared')!.runsPerSecond).toBeCloseTo(2, 9);
    expect(a.imports.some((i) => i.item === 'raw' && i.raw)).toBe(true);
  });
});

describe('commonalityIndex', () => {
  it('is 0 for a single target and >0 when targets share intermediates', () => {
    const one = balance(SHARED, [{ item: 'a', ratePerSecond: 1 }]);
    expect(commonalityIndex(one, [{ item: 'a', ratePerSecond: 1 }])).toBeCloseTo(0, 9);

    const two = balance(SHARED, [{ item: 'a', ratePerSecond: 1 }, { item: 'b', ratePerSecond: 1 }]);
    expect(commonalityIndex(two, [{ item: 'a', ratePerSecond: 1 }, { item: 'b', ratePerSecond: 1 }])).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Implement carving + commonality**

Append to `src/calculator/planner/blocks.ts` (add the type imports at the top):

```ts
import type {
  BalancedPlan, Block, BlockImport, BlockFeed, GroupedPlan, PlannerTarget, SolvedRecipe,
} from './types.js';
```

```ts
const EPS = 1e-9;

/**
 * For each produced item, the fraction of its total consumption attributable to
 * each block. A block-item's recipe belongs wholly to its own block; an inline
 * item's recipe is split across the blocks that ultimately consume it.
 *
 * Computed by memoized recursion from consumers down to producers; cycles fall
 * back to whole attribution to the first block reached (totals stay correct —
 * only the per-block split is approximate inside a loop).
 */
function buildBlockShares(
  plan: BalancedPlan,
  demand: Map<string, number>,
  blockItems: Set<string>,
): Map<string, Map<string, number>> {
  // item → (block → consumed rate of item on behalf of that block)
  const shares = new Map<string, Map<string, number>>();
  const inProgress = new Set<string>();

  const add = (m: Map<string, number>, block: string, rate: number) =>
    m.set(block, (m.get(block) ?? 0) + rate);

  function sharesOf(item: string): Map<string, number> {
    const cached = shares.get(item);
    if (cached) return cached;
    const result = new Map<string, number>();
    shares.set(item, result);
    if (inProgress.has(item)) return result; // cycle guard
    inProgress.add(item);

    // External demand for a target item is attributed to that target's block.
    const ext = demand.get(item) ?? 0;
    if (ext > 0 && blockItems.has(item)) add(result, item, ext);

    // Each recipe that consumes `item`.
    for (const sr of plan.recipes) {
      if (sr.runsPerSecond <= 0) continue;
      const used = (sr.recipe.in.find((i) => i.id === item)?.amount ?? 0) * sr.runsPerSecond;
      if (used <= EPS) continue;
      if (blockItems.has(sr.mainItem)) {
        // Consumer recipe lives inside a block → attribute wholly to that block.
        add(result, sr.mainItem, used);
      } else {
        // Inline consumer → distribute by where its own output goes.
        const downstream = sharesOf(sr.mainItem);
        const total = sum(downstream);
        if (total <= EPS) continue;
        for (const [block, rate] of downstream) add(result, block, used * (rate / total));
      }
    }
    inProgress.delete(item);
    return result;
  }

  for (const item of plan.producerOf.keys()) sharesOf(item);
  return shares;
}

const sum = (m: Map<string, number>) => {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
};

/** Partition the consolidated plan into self-contained blocks. */
export function groupPlan(
  plan: BalancedPlan,
  targets: PlannerTarget[],
  blockItemsIn: Set<string>,
): GroupedPlan {
  const demand = new Map<string, number>();
  for (const t of targets) if (t.ratePerSecond > 0) demand.set(t.item, (demand.get(t.item) ?? 0) + t.ratePerSecond);

  // Block items always include every target.
  const blockItems = new Set(blockItemsIn);
  for (const item of demand.keys()) blockItems.add(item);
  // Only keep block items that are actually produced in this plan.
  for (const item of [...blockItems]) if (!plan.producerOf.has(item)) blockItems.delete(item);

  const shares = buildBlockShares(plan, demand, blockItems);

  // Per recipe, its run-rate apportioned to each block.
  // Block-item recipe → wholly its own block. Inline recipe → split by its main item's shares.
  function recipeBlockRuns(sr: SolvedRecipe): Map<string, number> {
    const m = new Map<string, number>();
    if (sr.runsPerSecond <= 0) return m;
    if (blockItems.has(sr.mainItem)) { m.set(sr.mainItem, sr.runsPerSecond); return m; }
    const downstream = shares.get(sr.mainItem);
    const total = downstream ? sum(downstream) : 0;
    if (!downstream || total <= EPS) return m;
    for (const [block, rate] of downstream) m.set(block, sr.runsPerSecond * (rate / total));
    return m;
  }

  // Initialize a block per block-item.
  const blocks = new Map<string, Block>();
  for (const item of blockItems) {
    blocks.set(item, {
      item,
      kind: demand.has(item) ? 'target' : 'shared',
      exportRate: 0,
      recipes: [],
      machines: {},
      powerKW: 0,
      imports: [],
      feeds: [],
    });
  }

  // Assign scaled recipes to blocks; accumulate machines/power; collect imports.
  const importAgg = new Map<string, Map<string, { rate: number; raw: boolean }>>(); // block → item → import
  const feedAgg = new Map<string, Map<string, number>>(); // producerBlock → consumerBlock → rate

  for (const sr of plan.recipes) {
    const dist = recipeBlockRuns(sr);
    for (const [blockId, runs] of dist) {
      if (runs <= EPS) continue;
      const block = blocks.get(blockId)!;
      const scale = runs / sr.runsPerSecond;
      const scaled: SolvedRecipe = {
        ...sr,
        runsPerSecond: runs,
        machinesNeeded: sr.machinesNeeded * scale,
        powerKW: sr.powerKW * scale,
      };
      block.recipes.push(scaled);
      block.powerKW += scaled.powerKW;
      if (scaled.machine) block.machines[scaled.machine.id] = (block.machines[scaled.machine.id] ?? 0) + scaled.machinesNeeded;

      // Inputs that cross the block boundary (a different block-item or a raw).
      for (const inp of sr.recipe.in) {
        const rate = inp.amount * runs;
        if (rate <= EPS) continue;
        const producer = plan.producerOf.get(inp.id);
        const isRaw = !producer || producer.recipe.flags.includes('mining') || !blockItems.has(inp.id);
        const crossesBoundary = blockItems.has(inp.id) || isRaw;
        if (!crossesBoundary) continue; // produced inline within this block — not an import
        const raw = !producer || producer.recipe.flags.includes('mining');
        const byItem = importAgg.get(blockId) ?? new Map();
        importAgg.set(blockId, byItem);
        const cur = byItem.get(inp.id) ?? { rate: 0, raw };
        cur.rate += rate;
        byItem.set(inp.id, cur);

        // If the import is another block's export, record the feed edge.
        if (blockItems.has(inp.id) && !raw) {
          const feeds = feedAgg.get(inp.id) ?? new Map();
          feedAgg.set(inp.id, feeds);
          feeds.set(blockId, (feeds.get(blockId) ?? 0) + rate);
        }
      }
    }
  }

  // Export rate per block = external demand + total fed to other blocks.
  for (const block of blocks.values()) {
    const fed = feedAgg.get(block.item);
    let exportRate = demand.get(block.item) ?? 0;
    if (fed) for (const r of fed.values()) exportRate += r;
    block.exportRate = exportRate;
    block.feeds = fed ? [...fed].map(([b, rate]) => ({ block: b, rate })) : [];
    const imps = importAgg.get(block.item);
    block.imports = imps ? [...imps].map(([item, v]): BlockImport => ({ item, rate: v.rate, raw: v.raw })) : [];
    block.imports.sort((a, b) => b.rate - a.rate);
    block.feeds.sort((a, b) => b.rate - a.rate);
  }

  return {
    blocks: [...blocks.values()].sort((a, b) => b.exportRate - a.exportRate),
    commonalityIndex: commonalityIndex(plan, targets),
    totalMachines: plan.totalMachines,
    rawResources: plan.rawResources,
    totalPowerKW: plan.totalPowerKW,
    surpluses: plan.surpluses,
    errors: plan.errors,
  };
}

/**
 * Martin & Ishii commonality index over the target set:
 *   CI = 1 − uniqueIntermediates / Σ_t intermediatesPerTarget
 * 0 when nothing is shared (incl. a single target), → 1 with heavy sharing.
 */
export function commonalityIndex(plan: BalancedPlan, targets: PlannerTarget[]): number {
  const targetItems = targets.filter((t) => t.ratePerSecond > 0).map((t) => t.item);
  if (targetItems.length < 2) return 0;

  // Produced (non-raw) intermediates reachable from each target, excluding the target itself.
  const reachable = (root: string): Set<string> => {
    const out = new Set<string>();
    const stack = [root];
    const seen = new Set<string>([root]);
    while (stack.length) {
      const item = stack.pop()!;
      const sr = plan.producerOf.get(item);
      if (!sr) continue;
      for (const inp of sr.recipe.in) {
        const p = plan.producerOf.get(inp.id);
        if (p && !p.recipe.flags.includes('mining')) out.add(inp.id);
        if (!seen.has(inp.id)) { seen.add(inp.id); stack.push(inp.id); }
      }
    }
    return out;
  };

  const sets = targetItems.map(reachable);
  const counts = new Map<string, number>();
  let totalAcross = 0;
  for (const s of sets) {
    totalAcross += s.size;
    for (const item of s) counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  if (totalAcross === 0) return 0;
  const unique = [...counts.values()].filter((c) => c === 1).length;
  return 1 - unique / totalAcross;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- planner/blocks`
Expected: PASS (all scoring + grouping + commonality cases).

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/calculator/planner/blocks.ts src/calculator/planner/types.ts src/calculator/planner/blocks.test.ts
git commit -m "feat(planner): block carving and commonality index"
```

---

### Task 6: Planner public API

Expose a clean barrel for the web layer.

**Files:**
- Create: `src/calculator/planner/index.ts`

- [ ] **Step 1: Write the barrel**

Create `src/calculator/planner/index.ts`:

```ts
export { balance } from './matrix.js';
export type { BalanceOptions } from './matrix.js';
export { solveLinearSystem } from './matrix.js';
export { scoreIntermediates, groupPlan, commonalityIndex } from './blocks.js';
export type {
  PlannerTarget, PlannerRecipeOverrides, ItemBalance, SolvedRecipe, PlannerError,
  BalancedPlan, Block, BlockImport, BlockFeed, GroupedPlan,
} from './types.js';
export type { BlockSuggestion } from './blocks.js';
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/calculator/planner/index.ts
git commit -m "feat(planner): public API barrel"
```

---

### Task 7: `usePlanner` hook

State + memoized solve for the Planner tab, mirroring `useCalculator`. Reuses the persisted machine tiers and proliferator selection.

**Files:**
- Create: `src/web/hooks/usePlanner.ts`
- Test: `src/web/hooks/usePlanner.test.ts`

**Interfaces:**
- Consumes: `balance`, `groupPlan`, `scoreIntermediates`, planner types (Task 6); `graph`, `proliferators` from `../data.js`; `MachineTiers` from the calculator.
- Produces: `usePlanner(): PlannerState` with at least:
  - `targets: PlannerTargetRow[]` where `PlannerTargetRow { id: string; item: string; amount: number }`
  - `addTarget(item: string)`, `removeTarget(rowId: string)`, `setTargetItem(rowId, item)`, `setTargetAmount(rowId, amount)`
  - `timeUnit: TimeUnit`, `setTimeUnit`
  - `proliferatorId: string`, `setProliferatorId`
  - `machineTiers`, `setMachineTier`, `resetFamilyOverrides`, `machineOverrides`, `setMachineOverrides`
  - `blockItems: Set<string>`, `toggleBlock(item: string)`
  - `suggestions: BlockSuggestion[]`
  - `plan: GroupedPlan | null`

The tier persistence + machine-override + recipe-override helpers are identical in shape to `useCalculator`; reuse the same `localStorage` key `dsp-machine-tiers` so both tabs share tier defaults.

- [ ] **Step 1: Write the failing test**

Create `src/web/hooks/usePlanner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlanner } from './usePlanner.js';

describe('usePlanner', () => {
  it('produces a grouped plan once a target is added', () => {
    const { result } = renderHook(() => usePlanner());
    expect(result.current.plan).toBeNull();

    act(() => result.current.addTarget('magnetic-coil'));
    act(() => result.current.setTargetAmount(result.current.targets[0]!.id, 60));

    expect(result.current.plan).not.toBeNull();
    expect(result.current.plan!.blocks.some((b) => b.item === 'magnetic-coil')).toBe(true);
  });

  it('toggles a suggested item in and out of the block set', () => {
    const { result } = renderHook(() => usePlanner());
    act(() => result.current.addTarget('electromagnetic-matrix'));
    act(() => result.current.setTargetAmount(result.current.targets[0]!.id, 60));
    const before = result.current.blockItems.has('magnetic-coil');
    act(() => result.current.toggleBlock('magnetic-coil'));
    expect(result.current.blockItems.has('magnetic-coil')).toBe(!before);
  });
});
```

If `@testing-library/react` is not already a dev dependency, install it first:

Run: `npm install --save-dev @testing-library/react`

(Check `package.json` first — only install if absent. If the project has no React hook tests yet and you prefer to avoid a new dependency, convert these into a thin non-React test that calls `balance`+`groupPlan` directly and skip `renderHook`; but the hook itself must still be implemented per Step 3.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- usePlanner`
Expected: FAIL — `usePlanner.js` not found.

- [ ] **Step 3: Implement the hook**

Create `src/web/hooks/usePlanner.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  familyOfMachine, MACHINE_FAMILY_ORDER,
  type MachineFamily, type MachineOverrides, type MachineTiers,
} from '../../calculator/index.js';
import {
  balance, groupPlan, scoreIntermediates,
  type GroupedPlan, type PlannerTarget, type BlockSuggestion,
} from '../../calculator/planner/index.js';
import { graph, proliferators } from '../data.js';
import { UNIT_SECONDS, type TimeUnit } from './useCalculator.js';

const TIERS_KEY = 'dsp-machine-tiers';
let rowSeq = 0;

export interface PlannerTargetRow {
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

export interface PlannerState {
  targets: PlannerTargetRow[];
  addTarget: (item: string) => void;
  removeTarget: (rowId: string) => void;
  setTargetItem: (rowId: string, item: string) => void;
  setTargetAmount: (rowId: string, amount: number) => void;
  timeUnit: TimeUnit;
  setTimeUnit: (u: TimeUnit) => void;
  proliferatorId: string;
  setProliferatorId: (id: string) => void;
  machineTiers: MachineTiers;
  setMachineTier: (family: MachineFamily, machineId: string | null) => void;
  resetFamilyOverrides: (family: MachineFamily) => void;
  machineOverrides: MachineOverrides;
  setMachineOverrides: React.Dispatch<React.SetStateAction<MachineOverrides>>;
  blockItems: Set<string>;
  toggleBlock: (item: string) => void;
  suggestions: BlockSuggestion[];
  plan: GroupedPlan | null;
}

export function usePlanner(): PlannerState {
  const [targets, setTargets] = useState<PlannerTargetRow[]>([]);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('minute');
  const [proliferatorId, setProliferatorId] = useState<string>('none');
  const [machineTiers, setMachineTiers] = useState<MachineTiers>(loadMachineTiers);
  const [machineOverrides, setMachineOverrides] = useState<MachineOverrides>({});
  // User promotions/demotions, layered over the auto-suggested set.
  const [promoted, setPromoted] = useState<Set<string>>(new Set());
  const [demoted, setDemoted] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { localStorage.setItem(TIERS_KEY, JSON.stringify(machineTiers)); } catch { /* ignore */ }
  }, [machineTiers]);

  const addTarget = useCallback((item: string) => {
    setTargets((prev) => [...prev, { id: `t${rowSeq++}`, item, amount: 60 }]);
  }, []);
  const removeTarget = useCallback((rowId: string) => {
    setTargets((prev) => prev.filter((t) => t.id !== rowId));
  }, []);
  const setTargetItem = useCallback((rowId: string, item: string) => {
    setTargets((prev) => prev.map((t) => (t.id === rowId ? { ...t, item } : t)));
  }, []);
  const setTargetAmount = useCallback((rowId: string, amount: number) => {
    setTargets((prev) => prev.map((t) => (t.id === rowId ? { ...t, amount: Math.max(0, amount) } : t)));
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

  const toggleBlock = useCallback((item: string) => {
    setPromoted((p) => {
      const next = new Set(p);
      setDemoted((d) => {
        const nd = new Set(d);
        // Flip based on current effective membership computed in the reducer scope.
        if (next.has(item)) { next.delete(item); }
        else if (nd.has(item)) { nd.delete(item); }
        else if (autoBlockRef.current.has(item)) { nd.add(item); }
        else { next.add(item); }
        return nd;
      });
      return next;
    });
  }, []);

  // The numeric targets fed to the engine.
  const numericTargets = useMemo<PlannerTarget[]>(
    () => targets
      .filter((t) => graph.itemToRecipe.has(t.item) && t.amount > 0)
      .map((t) => ({ item: t.item, ratePerSecond: t.amount / UNIT_SECONDS[timeUnit] })),
    [targets, timeUnit],
  );

  const proliferator = useMemo(
    () => proliferators.find((p) => p.id === proliferatorId) ?? null,
    [proliferatorId],
  );

  const balanced = useMemo(() => {
    if (numericTargets.length === 0) return null;
    return balance(graph, numericTargets, { machineOverrides, machineTiers, proliferator });
  }, [numericTargets, machineOverrides, machineTiers, proliferator]);

  const targetItems = useMemo(() => new Set(numericTargets.map((t) => t.item)), [numericTargets]);

  const suggestions = useMemo(
    () => (balanced ? scoreIntermediates(balanced, targetItems) : []),
    [balanced, targetItems],
  );

  // Effective auto-suggested block set (before user overrides).
  const autoBlock = useMemo(() => {
    const set = new Set<string>(targetItems);
    for (const s of suggestions) if (s.suggested) set.add(s.item);
    return set;
  }, [suggestions, targetItems]);
  // Ref so toggleBlock can read the latest auto set without re-creating the callback.
  const autoBlockRef = useRef(autoBlock);
  useEffect(() => { autoBlockRef.current = autoBlock; }, [autoBlock]);

  const blockItems = useMemo(() => {
    const set = new Set(autoBlock);
    for (const item of demoted) set.delete(item);
    for (const item of promoted) set.add(item);
    for (const item of targetItems) set.add(item); // targets always blocks
    return set;
  }, [autoBlock, demoted, promoted, targetItems]);

  const plan = useMemo<GroupedPlan | null>(() => {
    if (!balanced) return null;
    return groupPlan(balanced, numericTargets, blockItems);
  }, [balanced, numericTargets, blockItems]);

  return {
    targets, addTarget, removeTarget, setTargetItem, setTargetAmount,
    timeUnit, setTimeUnit, proliferatorId, setProliferatorId,
    machineTiers, setMachineTier, resetFamilyOverrides, machineOverrides, setMachineOverrides,
    blockItems, toggleBlock, suggestions, plan,
  };
}
```

Add `useRef` to the React import at the top: `import { useCallback, useEffect, useMemo, useRef, useState } from 'react';`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- usePlanner`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/hooks/usePlanner.ts src/web/hooks/usePlanner.test.ts
git commit -m "feat(planner): usePlanner hook (state + memoized solve)"
```

---

### Task 8: i18n strings for the Planner

Add the `planner` namespace block + the new tab label to both locales.

**Files:**
- Modify: `src/web/i18n/locales/en/ui.ts`
- Modify: `src/web/i18n/locales/zh/ui.ts`
- Test: `src/data/generated/i18n.test.ts` already enforces key parity (no edit needed; it must still pass).

- [ ] **Step 1: Add the English strings**

In `src/web/i18n/locales/en/ui.ts`, add `planner: 'Planner'` to the `tabs` object and add a new top-level `planner` block (place it after the `chain` block):

```ts
  planner: {
    title: 'Production planner',
    addTarget: 'Add target',
    empty: 'Add one or more target items to plan a consolidated factory.',
    targets: 'Targets',
    remove: 'Remove',
    commonality: 'Commonality',
    commonalityHint: 'Share of intermediate components common to your targets',
    blocks: 'Production blocks',
    sharedBlock: 'shared block',
    targetBlock: 'target',
    exports: 'exports',
    imports: 'Imports',
    feeds: 'Feeds',
    promote: 'Make shared block',
    demote: 'Inline into consumers',
    suggestions: 'Suggested shared blocks',
    fanOut: '{{count}} consumers',
    graphView: 'Dependency graph',
    cardsView: 'Blocks',
    surplusWarning: 'Surplus byproducts',
    noBlocks: 'No production blocks yet.',
  },
```

- [ ] **Step 2: Add the matching Chinese strings**

In `src/web/i18n/locales/zh/ui.ts`, add `planner: '生产规划'` to its `tabs` object and the parallel `planner` block (same keys):

```ts
  planner: {
    title: '生产规划',
    addTarget: '添加目标',
    empty: '添加一个或多个目标物品以规划合并工厂。',
    targets: '目标',
    remove: '移除',
    commonality: '共用度',
    commonalityHint: '各目标之间共用的中间组件比例',
    blocks: '生产模块',
    sharedBlock: '共用模块',
    targetBlock: '目标',
    exports: '产出',
    imports: '输入',
    feeds: '供应至',
    promote: '设为共用模块',
    demote: '并入下游',
    suggestions: '建议的共用模块',
    fanOut: '{{count}} 个下游',
    graphView: '依赖图',
    cardsView: '模块',
    surplusWarning: '副产物过剩',
    noBlocks: '暂无生产模块。',
  },
```

- [ ] **Step 3: Typecheck + parity test**

Run: `npx tsc -b && npm test -- i18n`
Expected: PASS — `zh` typed as `UiResource` compiles (key parity holds).

- [ ] **Step 4: Commit**

```bash
git add src/web/i18n/locales/en/ui.ts src/web/i18n/locales/zh/ui.ts
git commit -m "feat(planner): i18n strings (en + zh)"
```

---

### Task 9: Block card + totals components

Presentational components for one block and the totals panel. Reuses `ItemIcon`, `useNames`, `Card`, `Badge`, `Button`, and the `num`/`rate`/`power` formatters.

**Files:**
- Create: `src/web/components/planner/BlockCard.tsx`
- Create: `src/web/components/planner/PlannerTotals.tsx`

**Interfaces:**
- Consumes: `Block`, `GroupedPlan`, `BlockSuggestion` (planner types); `TimeUnit`.
- Produces:
  - `BlockCard({ block, suggestion, timeUnit, onToggle }: { block: Block; suggestion: BlockSuggestion | undefined; timeUnit: TimeUnit; onToggle: (item: string) => void })`
  - `PlannerTotals({ plan, timeUnit }: { plan: GroupedPlan; timeUnit: TimeUnit })`

- [ ] **Step 1: Write `BlockCard`**

Create `src/web/components/planner/BlockCard.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right';
import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down';
import type { Block } from '../../../calculator/planner/index.js';
import type { BlockSuggestion } from '../../../calculator/planner/index.js';
import type { TimeUnit } from '../../hooks/useCalculator.js';
import { ItemIcon } from '../ItemIcon.js';
import { useNames } from '../../i18n/useNames.js';
import { Card, Badge, Button } from '../../ui/index.js';
import { num, rate, power } from '../../lib/format.js';

interface BlockCardProps {
  block: Block;
  suggestion: BlockSuggestion | undefined;
  timeUnit: TimeUnit;
  onToggle: (item: string) => void;
}

/** One self-contained production block: export, machines, imports, and feeds. */
export function BlockCard({ block, suggestion, timeUnit, onToggle }: BlockCardProps) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const machineEntries = Object.entries(block.machines).sort((a, b) => b[1] - a[1]);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <ItemIcon id={block.item} size={28} tinted />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{name(block.item)}</span>
            <Badge className={block.kind === 'target' ? 'bg-primary/15 text-primary' : 'bg-amber/15 text-amber'}>
              {block.kind === 'target' ? t('planner.targetBlock') : t('planner.sharedBlock')}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {t('planner.exports')} {rate(block.exportRate, timeUnit)} · {power(block.powerKW)}
          </div>
        </div>
        {block.kind !== 'target' && (
          <Button variant="outline" size="sm" onClick={() => onToggle(block.item)}>
            {t('planner.demote')}
          </Button>
        )}
      </div>

      {machineEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {machineEntries.map(([id, count]) => (
            <span key={id} className="flex items-center gap-1.5">
              <ItemIcon id={id} size={16} />
              <span className="text-muted-foreground">{name(id)}</span>
              <span className="font-medium tabular-nums">× {num(Math.ceil(count - 1e-9))}</span>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FlowList icon={<ArrowDownIcon className="size-3.5" />} label={t('planner.imports')}
          rows={block.imports.map((i) => ({ id: i.item, value: rate(i.rate, timeUnit) }))} />
        <FlowList icon={<ArrowRightIcon className="size-3.5" />} label={t('planner.feeds')}
          rows={block.feeds.map((f) => ({ id: f.block, value: rate(f.rate, timeUnit) }))} />
      </div>
      {suggestion && (
        <div className="text-xs text-muted-foreground">{t('planner.fanOut', { count: suggestion.fanOut })}</div>
      )}
    </Card>
  );
}

function FlowList({ icon, label, rows }: { icon: React.ReactNode; label: string; rows: { id: string; value: string }[] }) {
  const { name } = useNames();
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5 text-sm">
            <ItemIcon id={r.id} size={16} tinted />
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={name(r.id)}>{name(r.id)}</span>
            <span className="shrink-0 tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `PlannerTotals`**

Create `src/web/components/planner/PlannerTotals.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import FactoryIcon from 'lucide-react/dist/esm/icons/factory';
import PickaxeIcon from 'lucide-react/dist/esm/icons/pickaxe';
import ZapIcon from 'lucide-react/dist/esm/icons/zap';
import LayersIcon from 'lucide-react/dist/esm/icons/layers';
import AlertTriangleIcon from 'lucide-react/dist/esm/icons/triangle-alert';
import type { GroupedPlan } from '../../../calculator/planner/index.js';
import type { TimeUnit } from '../../hooks/useCalculator.js';
import { ItemIcon } from '../ItemIcon.js';
import { useNames } from '../../i18n/useNames.js';
import { Card } from '../../ui/index.js';
import { num, rate, power } from '../../lib/format.js';

export function PlannerTotals({ plan, timeUnit }: { plan: GroupedPlan; timeUnit: TimeUnit }) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const machines = Object.entries(plan.totalMachines).sort((a, b) => b[1] - a[1]);
  const raws = Object.entries(plan.rawResources).sort((a, b) => b[1] - a[1]);
  const commonalityPct = Math.round(plan.commonalityIndex * 100);

  return (
    <Card className="mb-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<LayersIcon className="size-4 text-primary" />} label={t('planner.commonality')}>
          <div className="text-lg font-semibold tabular-nums">{commonalityPct}%</div>
          <div className="text-xs text-muted-foreground">{t('planner.commonalityHint')}</div>
        </Stat>
        <Stat icon={<FactoryIcon className="size-4 text-primary" />} label={t('summary.buildings')}>
          {machines.length === 0 && <Empty />}
          {machines.map(([id, count]) => (
            <Row key={id} id={id} value={`× ${num(Math.ceil(count - 1e-9))}`} />
          ))}
        </Stat>
        <Stat icon={<PickaxeIcon className="size-4 text-amber" />} label={t('summary.rawResources')}>
          {raws.length === 0 && <Empty />}
          {raws.map(([id, r]) => (
            <Row key={id} id={id} value={rate(r, timeUnit)} />
          ))}
        </Stat>
        <Stat icon={<ZapIcon className="size-4 text-primary" />} label={t('summary.powerDraw')}>
          <div className="text-lg font-semibold">{power(plan.totalPowerKW)}</div>
          <div className="text-xs text-muted-foreground">{t('summary.peakElectric')}</div>
        </Stat>
      </div>

      {plan.surpluses.length > 0 && (
        <div className="mt-4 rounded-md border border-amber/40 bg-amber/10 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber">
            <AlertTriangleIcon className="size-4" />{t('planner.surplusWarning')}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {plan.surpluses.map((s) => (
              <span key={s.item} className="flex items-center gap-1.5">
                <ItemIcon id={s.item} size={16} tinted />
                <span className="text-muted-foreground">{name(s.item)}</span>
                <span className="tabular-nums">+{rate(s.surplus, timeUnit)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({ id, value }: { id: string; value: string }) {
  const { name } = useNames();
  return (
    <div className="flex items-center gap-2 text-sm">
      <ItemIcon id={id} size={18} tinted />
      <span className="min-w-0 flex-1 truncate text-muted-foreground" title={name(id)}>{name(id)}</span>
      <span className="shrink-0 whitespace-nowrap text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}
function Empty() { return <div className="text-xs text-muted-foreground">—</div>; }
```

- [ ] **Step 3: Verify the lucide icon names resolve**

Run: `ls node_modules/lucide-react/dist/esm/icons/triangle-alert.js node_modules/lucide-react/dist/esm/icons/arrow-right.js node_modules/lucide-react/dist/esm/icons/arrow-down.js node_modules/lucide-react/dist/esm/icons/layers.js`
Expected: all four files exist. If `triangle-alert.js` is absent, use `alert-triangle.js` and import `AlertTriangleIcon from 'lucide-react/dist/esm/icons/alert-triangle'` instead.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/components/planner/BlockCard.tsx src/web/components/planner/PlannerTotals.tsx
git commit -m "feat(planner): block card and totals components"
```

---

### Task 10: Block dependency graph

A React Flow graph where nodes are blocks and edges are shared-item flows. Lays out with dagre (no precomputed layout — the block set is small and dynamic).

**Files:**
- Create: `src/web/components/planner/BlockGraph.tsx`

**Interfaces:**
- Consumes: `GroupedPlan` (Task 5); `@xyflow/react`, `@dagrejs/dagre`.
- Produces: `BlockGraph({ plan, onSelect }: { plan: GroupedPlan; onSelect?: (item: string) => void })`

- [ ] **Step 1: Write the graph component**

Create `src/web/components/planner/BlockGraph.tsx`:

```tsx
import { useMemo } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls,
  type Node, type Edge, type NodeMouseHandler,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { GroupedPlan } from '../../../calculator/planner/index.js';
import { displayName } from '../../data.js';

const NODE_W = 180;
const NODE_H = 44;

/** Lay blocks out top-down with dagre; edges follow feed relationships. */
function layout(plan: GroupedPlan): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const block of plan.blocks) g.setNode(block.item, { width: NODE_W, height: NODE_H });
  const edges: Edge[] = [];
  for (const block of plan.blocks) {
    for (const feed of block.feeds) {
      g.setEdge(block.item, feed.block);
      edges.push({
        id: `${block.item}->${feed.block}`,
        source: block.item,
        target: feed.block,
        type: 'smoothstep',
      });
    }
  }
  dagre.layout(g);

  const nodes: Node[] = plan.blocks.map((block) => {
    const pos = g.node(block.item);
    return {
      id: block.item,
      position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 },
      data: { label: displayName(block.item) },
      style: {
        width: NODE_W,
        height: NODE_H,
        fontSize: 12,
        borderRadius: 8,
        border: block.kind === 'target' ? '1px solid var(--primary)' : '1px solid var(--border)',
        background: 'var(--card)',
        color: 'var(--foreground)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
    };
  });
  return { nodes, edges };
}

function BlockGraphInner({ plan, onSelect }: { plan: GroupedPlan; onSelect?: (item: string) => void }) {
  const { nodes, edges } = useMemo(() => layout(plan), [plan]);
  const onNodeClick: NodeMouseHandler = (_, node) => onSelect?.(node.id);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      fitView
      minZoom={0.2}
      maxZoom={1.75}
      nodesDraggable={false}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={28} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function BlockGraph(props: { plan: GroupedPlan; onSelect?: (item: string) => void }) {
  return (
    <ReactFlowProvider>
      <BlockGraphInner {...props} />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: PASS. (If `@dagrejs/dagre` lacks types in this usage, check how `tech-tree` imports it and mirror that import style.)

- [ ] **Step 3: Commit**

```bash
git add src/web/components/planner/BlockGraph.tsx
git commit -m "feat(planner): block dependency graph (react-flow + dagre)"
```

---

### Task 11: Planner tab (target list + view toggle) and wiring

Assemble the tab: targets editor, settings, suggestions, block cards / graph toggle, totals. Wire it into the app shell and hash router.

**Files:**
- Create: `src/web/components/planner/PlannerTab.tsx`
- Modify: `src/web/App.tsx` (lazy-load tab, add trigger + content)
- Modify: `src/web/hooks/useHashTab.ts` (add `'planner'` to `VALID`)

**Interfaces:**
- Consumes: `usePlanner` (Task 7); `BlockCard`, `PlannerTotals` (Task 9); `BlockGraph` (Task 10); `ItemSelector`, `RateInput`, `MachineDefaults`, `ItemIcon`; UI primitives.
- Produces: `PlannerTab()` (self-contained; owns its `usePlanner` instance).

- [ ] **Step 1: Add `'planner'` to the hash router**

In `src/web/hooks/useHashTab.ts`, change:

```ts
const VALID = new Set(['calculator', 'tech-tree', 'item-lookup', 'planner']);
```

- [ ] **Step 2: Write `PlannerTab`**

Create `src/web/components/planner/PlannerTab.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PlusIcon from 'lucide-react/dist/esm/icons/plus';
import XIcon from 'lucide-react/dist/esm/icons/x';
import { usePlanner } from '../../hooks/usePlanner.js';
import { graph, proliferators } from '../../data.js';
import { ItemSelector } from '../ItemSelector.js';
import { MachineDefaults } from '../MachineDefaults.js';
import { ItemIcon } from '../ItemIcon.js';
import { BlockCard } from './BlockCard.js';
import { PlannerTotals } from './PlannerTotals.js';
import { BlockGraph } from './BlockGraph.js';
import { useNames } from '../../i18n/useNames.js';
import {
  Button, Card, Input, Label,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tabs, TabsList, TabsTrigger,
} from '../../ui/index.js';
import type { TimeUnit } from '../../hooks/useCalculator.js';

export function PlannerTab() {
  const plan = usePlanner();
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const [view, setView] = useState<'cards' | 'graph'>('cards');
  const [adding, setAdding] = useState(false);

  const suggestionById = new Map(plan.suggestions.map((s) => [s.item, s]));

  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-5">
      {/* Targets editor */}
      <Card className="mb-4 p-4">
        <Label className="mb-2">{t('planner.targets')}</Label>
        <div className="flex flex-col gap-2">
          {plan.targets.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2">
              <ItemSelector items={graph.allProducts} value={row.item} onChange={(id) => plan.setTargetItem(row.id, id)} />
              <Input
                type="number" min={0} step="any"
                value={Number.isFinite(row.amount) ? row.amount : ''}
                onChange={(e) => plan.setTargetAmount(row.id, Number(e.target.value) || 0)}
                className="w-24"
              />
              <Button variant="ghost" size="sm" onClick={() => plan.removeTarget(row.id)} aria-label={t('planner.remove')}>
                <XIcon className="size-4" />
              </Button>
            </div>
          ))}
          {adding ? (
            <ItemSelector
              items={graph.allProducts}
              value=""
              onChange={(id) => { plan.addTarget(id); setAdding(false); }}
            />
          ) : (
            <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
              <PlusIcon className="mr-1 size-4" />{t('planner.addTarget')}
            </Button>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div className="w-full sm:w-auto">
            <Label className="mb-1">{t('calculator.targetRate')}</Label>
            <Select value={plan.timeUnit} onValueChange={(v) => plan.setTimeUnit(v as TimeUnit)}>
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
            <Select value={plan.proliferatorId} onValueChange={plan.setProliferatorId}>
              <SelectTrigger className="w-full sm:min-w-[13rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('calculator.none')}</SelectItem>
                {proliferators.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ItemIcon id={p.tier} size={16} /><span className="truncate">{name(p.id)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <MachineDefaults
        tiers={plan.machineTiers}
        machineOverrides={plan.machineOverrides}
        onTierChange={plan.setMachineTier}
        onResetFamily={plan.resetFamilyOverrides}
      />

      {plan.plan ? (
        <>
          <PlannerTotals plan={plan.plan} timeUnit={plan.timeUnit} />

          {/* Suggestions that are not currently blocks → offer to promote. */}
          {plan.suggestions.filter((s) => s.suggested && !plan.blockItems.has(s.item)).length > 0 && (
            <Card className="mb-4 p-3">
              <Label className="mb-2">{t('planner.suggestions')}</Label>
              <div className="flex flex-wrap gap-2">
                {plan.suggestions.filter((s) => s.suggested && !plan.blockItems.has(s.item)).map((s) => (
                  <Button key={s.item} variant="outline" size="sm" onClick={() => plan.toggleBlock(s.item)}>
                    <ItemIcon id={s.item} size={16} tinted />
                    <span className="ml-1.5">{name(s.item)}</span>
                  </Button>
                ))}
              </div>
            </Card>
          )}

          <div className="mb-3 flex items-center justify-between">
            <Label>{t('planner.blocks')}</Label>
            <Tabs value={view} onValueChange={(v) => setView(v as 'cards' | 'graph')}>
              <TabsList>
                <TabsTrigger value="cards">{t('planner.cardsView')}</TabsTrigger>
                <TabsTrigger value="graph">{t('planner.graphView')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {view === 'cards' ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {plan.plan.blocks.map((block) => (
                <BlockCard
                  key={block.item}
                  block={block}
                  suggestion={suggestionById.get(block.item)}
                  timeUnit={plan.timeUnit}
                  onToggle={plan.toggleBlock}
                />
              ))}
            </div>
          ) : (
            <div className="h-[60vh] rounded-lg border border-border">
              <BlockGraph plan={plan.plan} />
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          {t('planner.empty')}
        </div>
      )}
    </div>
  );
}
```

Note: `ItemSelector` requires a non-empty `value`; the "add" instance passes `value=""` which renders the placeholder — confirm the placeholder branch (it already handles falsy `value`). The `Button` `size="sm"` + icon usage matches existing call sites.

- [ ] **Step 3: Wire the tab into `App.tsx`**

In `src/web/App.tsx`:

1. Add the lazy import beside the other lazy tabs (after the `ItemLookup` lazy line):

```ts
const PlannerTab = lazy(() => import('./components/planner/PlannerTab.js').then((m) => ({ default: m.PlannerTab })));
```

2. Add a tab trigger inside `<TabsList>` (after the `calculator` trigger):

```tsx
            <TabsTrigger value="planner" className="flex-1 sm:flex-none">{t('tabs.planner')}</TabsTrigger>
```

3. Add the tab content (after the `calculator` `<TabsContent>` block):

```tsx
        <TabsContent value="planner" className="flex-1 overflow-auto">
          <Suspense fallback={<Loading what={t('tabs.planner')} />}>
            <PlannerTab />
          </Suspense>
        </TabsContent>
```

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/components/planner/PlannerTab.tsx src/web/App.tsx src/web/hooks/useHashTab.ts
git commit -m "feat(planner): planner tab and app wiring"
```

---

### Task 12: Manual verification + self-review

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: `tsc -b` + `vite build` succeed with no errors.

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`, open `http://localhost:5173/dsp-helper/#planner`. Verify:
- Add two targets that share intermediates (e.g. **Electromagnetic Matrix** and **Energy Matrix**), set rates.
- Totals show commonality %, buildings, raws, power.
- A suggestion (e.g. **Magnetic Coil**) appears; clicking it adds a shared block; the card shows imports/feeds; a "demote" button returns it to inline.
- Switch to the **Dependency graph** view — blocks render with feed edges; target blocks are primary-bordered.
- Switch language to 中文 — all planner labels translate, names update.
- Confirm the **Calculator** tab still works unchanged.

- [ ] **Step 3: Run `/review` on the diff**

Per the user's behavioral rule, run `/review` (or the `code-review` skill) over the full feature diff and address any findings before finishing.

- [ ] **Step 4: Final commit (if review produced changes)**

```bash
git add <changed files>
git commit -m "chore(planner): address self-review findings"
```

---

## Self-Review (plan vs. spec)

**Spec coverage:**
- §2 placement / new tab / reuse settings → Tasks 8, 11 (tab, hash route), 7 (shared tiers key).
- §2 shared proliferator/tier refactor → Task 1.
- §3 matrix balance solve, byproduct netting, loops, raws, surplus → Tasks 2–3.
- §4 scoring, auto-suggest + override, block carving, commonality → Tasks 4–5, 7 (promote/demote state).
- §5 block cards, dependency graph, totals, i18n → Tasks 8–11.
- §6 file structure → matches Tasks 1–11 exactly.
- §7 testing/purity → engine tests in Tasks 1–5; purity preserved (no `src/web` imports in `src/calculator`).
- §8 tunable params → encoded as the `fanOut>=2 && >= median` rule in Task 4 (documented, easily changed).

**Deferred (per spec, intentionally absent):** belt/station throughput sizing; LP auto-recipe-selection; spatial layout.

**Known v1 limitation (documented in Task 5):** per-block run-rate attribution inside a recipe **loop** is approximate (cycle guard); global totals remain exact.

**Type consistency:** `BalancedPlan` / `SolvedRecipe` / `Block` / `GroupedPlan` / `BlockSuggestion` names and fields are defined in Tasks 2 & 5 and consumed unchanged in Tasks 6–11. `PlannerTarget {item, ratePerSecond}` (engine) vs `PlannerTargetRow {id, item, amount}` (UI rows) are deliberately distinct; the hook maps rows → engine targets in Task 7.
