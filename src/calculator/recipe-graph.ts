import type { Recipe, Machine, Meta } from '../data/schema.js';

/** Lookup maps for navigating the recipe/machine dependency graph. */
export interface RecipeGraph {
  /** Map from produced item id to the recipe that makes it (primary recipe). */
  itemToRecipe: Map<string, Recipe>;
  /** All recipes that can produce a given item id (for the "produced by" view). */
  itemToAllRecipes: Map<string, Recipe[]>;
  /** All recipes that consume a given item id (for the "used in" view). */
  itemToConsumers: Map<string, Recipe[]>;
  /** Machine lookup by id. */
  machineById: Map<string, Machine>;
  /** Machines that can run a recipe, sorted by speed ascending. */
  producersFor: (recipe: Recipe) => Machine[];
  /** Best default machine for a recipe (best non–Dark-Fog tier). */
  defaultMachine: (recipe: Recipe) => Machine | null;
  /** All recipes (after excluding advanced/duplicate variants). */
  allRecipes: Recipe[];
  /** Every recipe in the raw dataset, including excluded variants. */
  rawRecipes: Recipe[];
  /** Sorted list of all producible item ids. */
  allProducts: string[];
  /** Item ids obtained by mining (raw resources). */
  minedResources: Set<string>;
  /** Recipe ids eligible for the extra-products proliferator mode. */
  proliferableRecipes: Set<string>;
}

/** Dark-Fog tier buildings are endgame drops — not a sensible default. */
const isDarkFog = (id: string) => id.startsWith('df-');

export function buildRecipeGraph(
  recipes: Recipe[],
  machines: Machine[],
  meta: Pick<Meta, 'excludedRecipes'> & { proliferableRecipes?: string[] },
): RecipeGraph {
  const excluded = new Set(meta.excludedRecipes);
  const machineById = new Map(machines.map((m) => [m.id, m]));

  const itemToRecipe = new Map<string, Recipe>();
  const itemToAllRecipes = new Map<string, Recipe[]>();
  const itemToConsumers = new Map<string, Recipe[]>();
  const minedResources = new Set<string>();
  const allRecipes: Recipe[] = [];

  for (const recipe of recipes) {
    // Tech (research) recipes are handled by the tech tree, not the calculator.
    if (recipe.flags.includes('technology')) continue;

    if (recipe.flags.includes('mining')) {
      for (const out of recipe.out) minedResources.add(out.id);
    }

    const isExcluded = excluded.has(recipe.id);
    if (!isExcluded) allRecipes.push(recipe);

    for (const out of recipe.out) {
      // Every recipe (even excluded) is discoverable in "produced by".
      const all = itemToAllRecipes.get(out.id) ?? [];
      all.push(recipe);
      itemToAllRecipes.set(out.id, all);

      // Primary recipe: prefer a craft recipe over a mining/pump recipe. The
      // mining variant (sulfuric acid ocean, organic crystal vein, gas-giant
      // collection) is a planet-specific bonus, not the universal source — so a
      // craft recipe upgrades an already-chosen mining primary. Among recipes of
      // the same kind, the first non-excluded one wins.
      if (!isExcluded) {
        const current = itemToRecipe.get(out.id);
        if (!current || (current.flags.includes('mining') && !recipe.flags.includes('mining'))) {
          itemToRecipe.set(out.id, recipe);
        }
      }
    }
    for (const inp of recipe.in) {
      const consumers = itemToConsumers.get(inp.id) ?? [];
      consumers.push(recipe);
      itemToConsumers.set(inp.id, consumers);
    }
  }

  // An item is only raw when its chosen primary is a mining recipe. Items that
  // default to a craft recipe (sulfuric acid, organic crystal, hydrogen,
  // deuterium) are produced, not mined — otherwise the solver would both list
  // them as raw and drill into their craft inputs.
  for (const [itemId, recipe] of itemToRecipe) {
    if (!recipe.flags.includes('mining')) minedResources.delete(itemId);
  }

  const producersFor = (recipe: Recipe): Machine[] =>
    recipe.producers
      .map((id) => machineById.get(id))
      .filter((m): m is Machine => m !== undefined)
      .sort((a, b) => a.speed - b.speed);

  const defaultMachine = (recipe: Recipe): Machine | null => {
    const producers = producersFor(recipe);
    if (producers.length === 0) return null;
    const standard = producers.filter((m) => !isDarkFog(m.id));
    const pool = standard.length > 0 ? standard : producers;
    return pool[pool.length - 1]!; // highest speed
  };

  const allProducts = [...itemToRecipe.keys()].sort();

  return {
    itemToRecipe,
    itemToAllRecipes,
    itemToConsumers,
    machineById,
    producersFor,
    defaultMachine,
    allRecipes,
    rawRecipes: recipes,
    allProducts,
    minedResources,
    proliferableRecipes: new Set(meta.proliferableRecipes ?? []),
  };
}
