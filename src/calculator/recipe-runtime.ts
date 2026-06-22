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
