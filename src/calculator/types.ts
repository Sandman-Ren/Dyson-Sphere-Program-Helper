import type { Recipe, Machine, Proliferator } from '../data/schema.js';

/** Per-item machine overrides: produced-item id → machine id. */
export type MachineOverrides = Record<string, string>;

/** How a proliferator is applied across the whole plan. */
export interface ProliferatorSetting {
  proliferator: Proliferator | null;
}

/** A node in the production chain tree. */
export interface ProductionNode {
  /** The item id this node produces. */
  item: string;
  recipe: Recipe | null;        // null for raw resources
  machine: Machine | null;      // null for raw resources
  ratePerSecond: number;        // items/s required of `item`
  machinesNeeded: number;       // fractional building count
  children: ProductionNode[];   // ingredient sub-trees
  powerKW: number;              // electric draw for this node's buildings
  /** True when this item is mined (a raw vein/sea/gas-giant resource). */
  mined: boolean;
  /** True when a proliferator effect was applied to this node. */
  proliferated: boolean;
}

/** The full production plan. */
export interface ProductionPlan {
  root: ProductionNode;
  /** machine id → total building count. */
  totalMachines: Record<string, number>;
  /** raw resource id → items/s extracted. */
  rawResources: Record<string, number>;
  /** Sum of electric power draw across every building, in kW. */
  totalPowerKW: number;
  /** Proliferator units/s consumed (estimate), or 0 when none applied. */
  proliferatorSpraysPerSecond: number;
}
