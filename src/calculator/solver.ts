import type { RecipeGraph } from './recipe-graph.js';
import type { Proliferator } from '../data/schema.js';
import type { MachineTiers } from './machine-families.js';
import type {
  ProductionNode, ProductionPlan, MachineOverrides, RecipeOverrides, ProliferatorSetting,
} from './types.js';
import { proliferatorEffect, resolveMachine } from './recipe-runtime.js';

/**
 * Recursively solve the production chain for a target item at a desired rate.
 *
 * @param graph - recipe/machine dependency graph
 * @param targetItem - the item id to produce
 * @param desiredRatePerSecond - items per second of the target
 * @param machineOverrides - per-item machine choice overrides
 * @param prolifSetting - global proliferator setting
 * @param machineTiers - global default machine per building family
 * @param recipeOverrides - per-occurrence recipe choice overrides (node path → recipe id)
 */
export function solve(
  graph: RecipeGraph,
  targetItem: string,
  desiredRatePerSecond: number,
  machineOverrides?: MachineOverrides,
  prolifSetting?: ProliferatorSetting,
  machineTiers?: MachineTiers,
  recipeOverrides?: RecipeOverrides,
): ProductionPlan {
  const totalMachines: Record<string, number> = {};
  const rawResources: Record<string, number> = {};
  let totalPowerKW = 0;
  let proliferatorSpraysPerSecond = 0;

  const prolif = prolifSetting?.proliferator ?? null;

  const root = solveNode(
    graph, targetItem, desiredRatePerSecond, new Set(), targetItem,
    machineOverrides, prolif, machineTiers, recipeOverrides,
    (kw) => { totalPowerKW += kw; },
    (id, count) => { totalMachines[id] = (totalMachines[id] ?? 0) + count; },
    (id, rate) => { rawResources[id] = (rawResources[id] ?? 0) + rate; },
    (sprays) => { proliferatorSpraysPerSecond += sprays; },
  );

  return { root, totalMachines, rawResources, totalPowerKW, proliferatorSpraysPerSecond };
}

function solveNode(
  graph: RecipeGraph,
  itemId: string,
  ratePerSecond: number,
  visited: Set<string>,
  path: string,
  machineOverrides: MachineOverrides | undefined,
  prolif: Proliferator | null,
  machineTiers: MachineTiers | undefined,
  recipeOverrides: RecipeOverrides | undefined,
  addPower: (kw: number) => void,
  addMachine: (id: string, count: number) => void,
  addRaw: (id: string, rate: number) => void,
  addSprays: (sprays: number) => void,
): ProductionNode {
  // Honor a per-occurrence recipe override only when it actually produces this
  // item; otherwise fall back to the default primary recipe.
  const overrideId = recipeOverrides?.[path];
  const override = overrideId ? graph.recipeById.get(overrideId) : undefined;
  const recipe = override && override.out.some((o) => o.id === itemId)
    ? override
    : graph.itemToRecipe.get(itemId);
  // The chosen recipe decides whether this node is a raw/mined source.
  const mined = recipe ? recipe.flags.includes('mining') : graph.minedResources.has(itemId);

  const leaf = (addToRaw: boolean): ProductionNode => {
    if (addToRaw) addRaw(itemId, ratePerSecond);
    return {
      item: itemId, recipe: null, machine: null,
      ratePerSecond, machinesNeeded: 0, children: [],
      powerKW: 0, mined, proliferated: false,
    };
  };

  // No recipe → a truly raw input. Cycle → break and treat as raw.
  if (!recipe) return leaf(true);
  if (visited.has(itemId)) return leaf(true);

  // Mined ores are surfaced in the raw-resources summary but still drilled down.
  if (mined) addRaw(itemId, ratePerSecond);

  visited = new Set(visited);
  visited.add(itemId);

  // Apply the per-item machine override only when that machine can run the
  // chosen recipe — a recipe switch must not keep a now-invalid machine.
  const machine = resolveMachine(graph, recipe, itemId, machineOverrides, machineTiers);

  const fx = proliferatorEffect(prolif, recipe.id, machine?.modules ?? 0, graph);

  const speed = (machine?.speed ?? 1) * fx.speedMultiplier;
  const resultAmount = (recipe.out.find((o) => o.id === itemId)?.amount ?? 1) * fx.outputMultiplier;
  const craftsPerSecond = ratePerSecond / resultAmount;
  const timePerCraft = recipe.time / speed;
  const machinesNeeded = craftsPerSecond * timePerCraft;

  if (machine) addMachine(machine.id, machinesNeeded);

  let powerKW = 0;
  if (machine && machine.powerType === 'electric') {
    powerKW = machinesNeeded * machine.usageKW * fx.powerMultiplier;
    addPower(powerKW);
  }

  if (fx.applied && prolif) {
    // DSP coats each individual input item; one proliferator unit covers
    // `sprays` items. Estimate consumption from this node's input throughput.
    const inputItemsPerSecond = recipe.in.reduce((sum, i) => sum + i.amount, 0) * craftsPerSecond;
    addSprays(inputItemsPerSecond / prolif.sprays);
  }

  const children: ProductionNode[] = [];
  for (const ingredient of recipe.in) {
    children.push(
      solveNode(
        graph, ingredient.id, craftsPerSecond * ingredient.amount, visited,
        `${path}>${ingredient.id}`,
        machineOverrides, prolif, machineTiers, recipeOverrides,
        addPower, addMachine, addRaw, addSprays,
      ),
    );
  }

  return {
    item: itemId, recipe, machine,
    ratePerSecond, machinesNeeded, children,
    powerKW, mined, proliferated: fx.applied,
  };
}

// ---- Integer-ratio helpers (scale a plan to whole buildings) ----

function collectMachinesNeeded(node: ProductionNode): number[] {
  const values: number[] = [];
  if (node.machinesNeeded > 0) values.push(node.machinesNeeded);
  for (const child of node.children) values.push(...collectMachinesNeeded(child));
  return values;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}
function lcm(a: number, b: number): number {
  return a && b ? (Math.abs(a) / gcd(a, b)) * Math.abs(b) : 0;
}
function findDenominator(v: number, maxDenom = 10000, eps = 0.001): number {
  for (let q = 1; q <= maxDenom; q++) {
    const scaled = v * q;
    const rounded = Math.round(scaled);
    // Require a *nonzero* whole number: accepting the smallest q that merely
    // rounds a tiny value toward 0 would collapse a needed count to 0.
    if (rounded !== 0 && Math.abs(scaled - rounded) < eps) return q;
  }
  return 1;
}

/** Smallest k so every value becomes (near-)integer, or null if > maxK. */
export function findIntegerMultiplierForValues(values: number[], maxK = 100_000): number | null {
  let k = 1;
  for (const v of values) {
    k = lcm(k, findDenominator(v));
    if (k > maxK) return null;
  }
  return k;
}

/**
 * Reduce a set of values to their minimum integer ratio.
 *
 * Scales by the LCM multiplier so every value is a whole number, then divides
 * through by the GCD to express the ratio in lowest terms. Returns `null` when
 * no multiplier within `maxK` brings every value within `eps` of an integer, or
 * when a nonzero value is too small to scale to a whole number — in both cases
 * the caller falls back to a decimal display rather than show a misleading ratio.
 */
export function computeIntegerRatios(values: number[]): number[] | null {
  if (values.length === 0) return [];
  const k = findIntegerMultiplierForValues(values);
  if (k === null) return null;

  const ints = values.map((v) => Math.round(v * k));
  // A nonzero count that scales to 0 can't be honestly shown as an integer.
  if (ints.some((n, i) => n === 0 && values[i] !== 0)) return null;

  let d = ints[0]!;
  for (let i = 1; i < ints.length; i++) d = gcd(d, ints[i]!);
  return d > 1 ? ints.map((v) => v / d) : ints;
}

/** Smallest k so every machine count becomes (near-)integer, or null if > maxK. */
export function findIntegerMultiplier(plan: ProductionPlan, maxK = 100_000): number | null {
  return findIntegerMultiplierForValues(collectMachinesNeeded(plan.root), maxK);
}
