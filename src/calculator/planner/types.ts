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
