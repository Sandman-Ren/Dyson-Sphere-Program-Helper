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
