/**
 * Data contract for the DSP Helper.
 *
 * The generated JSON in `src/data/generated/` is produced by
 * `scripts/transform-data.ts` from the (MIT-licensed) FactorioLab DSP dataset.
 * These interfaces describe the *normalized* shape this app consumes — not the
 * raw FactorioLab schema. See docs/data-pipeline.md for the mapping.
 */

/** One ingredient or product: an item id and a per-craft amount. */
export interface RecipeItem {
  id: string;
  amount: number;
}

/** A crafting recipe. `time` is seconds at machine speed 1. */
export interface Recipe {
  id: string;
  name: string;
  /** Crafting time in seconds at speed 1. */
  time: number;
  /** Ingredients consumed per craft. Empty for mining recipes. */
  in: RecipeItem[];
  /** Products produced per craft. For tech recipes this is hash points. */
  out: RecipeItem[];
  /** Building ids (see machines.json) able to run this recipe. */
  producers: string[];
  /**
   * mining   — extracted from a vein/sea/gas-giant (a raw resource source)
   * technology — consumed in a Matrix Lab to produce research hash
   * locked   — gated behind a technology unlock
   */
  flags: RecipeFlag[];
  /** Vein richness cost for mining recipes (informational). */
  cost?: number;
}

export type RecipeFlag = 'mining' | 'technology' | 'locked';

/** An item, component, building, or resource. */
export interface Item {
  id: string;
  name: string;
  /** components | buildings | technologies | upgrades | effects */
  category: string;
  /** Row within the category, used for picker grouping/ordering. */
  row: number;
  /** Inventory stack size (0 for fluids/unstackable). */
  stack: number;
}

/** A production building, derived from items that carry a `machine` block. */
export interface Machine {
  id: string;
  name: string;
  /** Crafting-speed multiplier (1 = baseline). */
  speed: number;
  /** Working electric power draw, in kW. */
  usageKW: number;
  /** Idle electric power draw, in kW. */
  drainKW: number;
  /** Number of effect (proliferator) slots. */
  modules: number;
  /** electric | none. `none` = self-powered / no grid draw (e.g. ray receiver). */
  powerType: 'electric' | 'none';
}

/** A proliferator (effect module) applied to recipes. */
export interface Proliferator {
  id: string;
  name: string;
  /** Tier key shared by the two modes, e.g. "proliferator-3". */
  tier: string;
  /** Extra-products bonus (e.g. 0.25 = +25%), 0 for speed-only variants. */
  productivity: number;
  /** Production-speed bonus (e.g. 1 = +100%), 0 for product-only variants. */
  speed: number;
  /** Extra power multiplier added while active (e.g. 1.5 = +150%). */
  consumption: number;
  /** Sprays delivered per proliferator unit. */
  sprays: number;
  /** 'products' | 'speed' */
  mode: 'products' | 'speed';
}

/** A research technology node. */
export interface Technology {
  id: string;
  name: string;
  /** Technology ids that must be researched first. */
  prerequisites: string[];
  /** Recipe ids unlocked when this tech completes. */
  recipeUnlock: string[];
  /** Research cost, mirrored from the matching `technology`-flagged recipe. */
  cost: TechCost;
  row: number;
  /** True for repeatable upgrade techs (mining/research productivity, etc.). */
  upgrade: boolean;
}

export interface TechCost {
  /** Time in seconds per hash tick at one Matrix Lab. */
  time: number;
  /** Matrices consumed per hash tick. */
  matrices: RecipeItem[];
  /** Total hash points required (the recipe's output amount). */
  hash: number;
}

/** Conveyor belt throughput (items/s per lane). */
export interface Belt {
  id: string;
  name: string;
  speed: number;
}

/** Sprite-sheet coordinate for an item/recipe icon. */
export interface Icon {
  id: string;
  x: number;
  y: number;
  color: string;
}

/** Dataset metadata and sensible calculator defaults. */
export interface Meta {
  game: string;
  version: string;
  /** Recipe ids excluded by default (advanced/duplicate variants). */
  excludedRecipes: string[];
  /** Best-tier machine ids, one per machine family. */
  maxMachineRank: string[];
  /** Lowest-tier machine ids, one per machine family. */
  minMachineRank: string[];
  /** Default proliferator id (or null). */
  defaultProliferator: string | null;
}
