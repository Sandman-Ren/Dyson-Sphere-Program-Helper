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

/** The chosen producing recipe for an item: a valid override, else the primary.
 *
 * Preference order:
 * 1. A valid per-item recipe override.
 * 2. A non-excluded recipe where `itemId` is the sole output (dedicated recipe).
 * 3. The graph's `itemToRecipe` primary (first-registered, which may be a multi-output recipe).
 *
 * WHY THIS DIVERGES FROM solver.ts
 * solver.ts uses `graph.itemToRecipe` directly (the first-registered recipe for an
 * item, which may be a multi-output recipe). That is fine for a single-item chain
 * where there is only one "main" row in the system.
 *
 * The planner builds a square items×recipes matrix: every produced item gets its
 * own balance row and one recipe column. If a multi-output recipe is assigned as
 * the "main" recipe for one of its byproduct items, the *same recipe column* ends
 * up as the pivot for two different rows — coupling those rows and often making
 * the matrix singular (or over-constrained). Preferring a dedicated single-output
 * recipe for each item keeps the system well-posed.
 *
 * Consequence: the Planner and Calculator tabs may occasionally select different
 * default recipes for the same item (e.g. an item that is both a primary product
 * and a byproduct of another recipe). This is intentional.
 */
function recipeForItem(
  graph: RecipeGraph,
  itemId: string,
  recipeOverrides: PlannerRecipeOverrides | undefined,
): Recipe | undefined {
  const overrideId = recipeOverrides?.[itemId];
  const override = overrideId ? graph.recipeById.get(overrideId) : undefined;
  if (override && override.out.some((o) => o.id === itemId)) return override;
  // Prefer a recipe that produces this item as its sole output over one that
  // produces it as a byproduct (multi-output recipes registered first in the graph
  // may displace a dedicated single-output recipe in itemToRecipe).
  const primary = graph.itemToRecipe.get(itemId);
  if (primary && primary.out.length === 1) return primary; // already a dedicated recipe
  const dedicated = (graph.itemToAllRecipes.get(itemId) ?? []).find(
    (r) => r.out.length === 1 && graph.allRecipes.includes(r),
  );
  return dedicated ?? primary;
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
  const fx = mains.map((m, j) => proliferatorEffect(proliferator, m.recipe.id, machines[j]?.modules ?? 0, graph));

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
  // Clamp negative run-rates to zero: a negative result means a byproduct more
  // than covers demand, so the dedicated recipe simply doesn't run.
  const clampedRuns = runs.map((r) => Math.max(0, r));
  const recipes: SolvedRecipe[] = [];
  const producerOf = new Map<string, SolvedRecipe>();
  const totalMachines: Record<string, number> = {};
  let totalPowerKW = 0;
  let proliferatorSpraysPerSecond = 0;

  for (let j = 0; j < n; j++) {
    const { recipe, mainItem } = mains[j]!;
    const machine = machines[j]!;
    const effect = fx[j]!;
    const run = clampedRuns[j]!;
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
      supplied += outAmount(j, item) * clampedRuns[j]!;
      consumed += inAmount(j, item) * clampedRuns[j]!;
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
