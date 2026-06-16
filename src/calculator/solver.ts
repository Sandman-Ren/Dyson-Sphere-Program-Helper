import type { RecipeGraph } from './recipe-graph.js';
import type { Machine, Proliferator, Recipe } from '../data/schema.js';
import { familyOfRecipe, type MachineTiers } from './machine-families.js';
import type {
  ProductionNode, ProductionPlan, MachineOverrides, ProliferatorSetting,
} from './types.js';

/** The globally-preferred machine for a recipe's family, if it can run the recipe. */
function tierMachine(
  graph: RecipeGraph,
  recipe: Recipe,
  machineTiers: MachineTiers | undefined,
): Machine | null {
  if (!machineTiers) return null;
  const family = familyOfRecipe(recipe);
  if (!family) return null;
  const preferredId = machineTiers[family];
  // Honor the tier only when the chosen machine can actually run this recipe.
  if (!preferredId || !recipe.producers.includes(preferredId)) return null;
  return graph.machineById.get(preferredId) ?? null;
}

/**
 * Resolve the proliferator effect for a single recipe.
 *
 * - "products" mode multiplies output (only on eligible recipes), so the same
 *   inputs yield more — fewer crafts are needed for a target rate.
 * - "speed" mode multiplies machine speed, so each building crafts faster.
 * Both raise power draw by the proliferator's `consumption` factor.
 */
function proliferatorEffect(
  prolif: Proliferator | null,
  recipeId: string,
  machineModules: number,
  graph: RecipeGraph,
): { outputMultiplier: number; speedMultiplier: number; powerMultiplier: number; applied: boolean } {
  const none = { outputMultiplier: 1, speedMultiplier: 1, powerMultiplier: 1, applied: false };
  if (!prolif || machineModules <= 0) return none;

  if (prolif.mode === 'products') {
    // Extra products only apply to the curated proliferable recipe list.
    if (!graph.proliferableRecipes.has(recipeId)) return none;
    return {
      outputMultiplier: 1 + prolif.productivity,
      speedMultiplier: 1,
      powerMultiplier: 1 + prolif.consumption,
      applied: true,
    };
  }
  // Speed mode applies to any recipe with a module slot.
  return {
    outputMultiplier: 1,
    speedMultiplier: 1 + prolif.speed,
    powerMultiplier: 1 + prolif.consumption,
    applied: true,
  };
}

/**
 * Recursively solve the production chain for a target item at a desired rate.
 *
 * @param graph - recipe/machine dependency graph
 * @param targetItem - the item id to produce
 * @param desiredRatePerSecond - items per second of the target
 * @param machineOverrides - per-item machine choice overrides
 * @param prolifSetting - global proliferator setting
 * @param machineTiers - global default machine per building family
 */
export function solve(
  graph: RecipeGraph,
  targetItem: string,
  desiredRatePerSecond: number,
  machineOverrides?: MachineOverrides,
  prolifSetting?: ProliferatorSetting,
  machineTiers?: MachineTiers,
): ProductionPlan {
  const totalMachines: Record<string, number> = {};
  const rawResources: Record<string, number> = {};
  let totalPowerKW = 0;
  let proliferatorSpraysPerSecond = 0;

  const prolif = prolifSetting?.proliferator ?? null;

  const root = solveNode(
    graph, targetItem, desiredRatePerSecond, new Set(),
    machineOverrides, prolif, machineTiers,
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
  machineOverrides: MachineOverrides | undefined,
  prolif: Proliferator | null,
  machineTiers: MachineTiers | undefined,
  addPower: (kw: number) => void,
  addMachine: (id: string, count: number) => void,
  addRaw: (id: string, rate: number) => void,
  addSprays: (sprays: number) => void,
): ProductionNode {
  const recipe = graph.itemToRecipe.get(itemId);
  const mined = graph.minedResources.has(itemId);

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

  const overrideId = machineOverrides?.[itemId];
  const machine =
    (overrideId ? graph.machineById.get(overrideId) : undefined) ??
    tierMachine(graph, recipe, machineTiers) ??
    graph.defaultMachine(recipe);

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
        machineOverrides, prolif, machineTiers, addPower, addMachine, addRaw, addSprays,
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
    if (Math.abs(v * q - Math.round(v * q)) < eps) return q;
  }
  return 1;
}

/** Smallest k so every machine count becomes (near-)integer, or null if > maxK. */
export function findIntegerMultiplier(plan: ProductionPlan, maxK = 100_000): number | null {
  let k = 1;
  for (const v of collectMachinesNeeded(plan.root)) {
    k = lcm(k, findDenominator(v));
    if (k > maxK) return null;
  }
  return k;
}
