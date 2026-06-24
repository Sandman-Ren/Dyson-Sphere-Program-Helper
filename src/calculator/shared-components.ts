import type { ProductionPlan, ProductionNode } from './types.js';

export interface CombinedTotals {
  totalMachines: Record<string, number>;
  rawResources: Record<string, number>;
  totalPowerKW: number;
  proliferatorSpraysPerSecond: number;
}

/** Sum machines, raws, power and sprays across per-target plans. */
export function combinePlans(plans: ProductionPlan[]): CombinedTotals {
  const totalMachines: Record<string, number> = {};
  const rawResources: Record<string, number> = {};
  let totalPowerKW = 0;
  let proliferatorSpraysPerSecond = 0;
  for (const plan of plans) {
    for (const [id, c] of Object.entries(plan.totalMachines)) totalMachines[id] = (totalMachines[id] ?? 0) + c;
    for (const [id, r] of Object.entries(plan.rawResources)) rawResources[id] = (rawResources[id] ?? 0) + r;
    totalPowerKW += plan.totalPowerKW;
    proliferatorSpraysPerSecond += plan.proliferatorSpraysPerSecond;
  }
  return { totalMachines, rawResources, totalPowerKW, proliferatorSpraysPerSecond };
}

/** Every node's fractional building count across all plans (for the integer-ratio multiplier). */
export function collectMachineCounts(plans: ProductionPlan[]): number[] {
  const values: number[] = [];
  const walk = (n: ProductionNode): void => {
    if (n.machinesNeeded > 0) values.push(n.machinesNeeded);
    for (const c of n.children) walk(c);
  };
  for (const plan of plans) walk(plan.root);
  return values;
}

export interface SharedComponentNode {
  item: string;
  combinedRatePerSecond: number;
  targetCount: number;
  children: SharedComponentNode[];
  reference: boolean;
}
export interface SharedComponentsResult {
  roots: SharedComponentNode[];
  /** shared item id → number of distinct targets producing it (≥2). */
  sharedCounts: Map<string, number>;
}

const isCrafted = (n: ProductionNode): boolean => n.recipe !== null && !n.mined;

/**
 * Build the nested tree of components shared across ≥2 targets, ordered
 * most-complex → raw, with combined rates and dedup reference nodes.
 */
export function buildSharedComponents(plans: ProductionPlan[]): SharedComponentsResult {
  const combinedRate = new Map<string, number>();
  const targetsByItem = new Map<string, Set<number>>();
  const nodesByItem = new Map<string, ProductionNode[]>();
  const depthByItem = new Map<string, number>();

  // Collect rates, per-target presence, occurrences, and production depth.
  const collect = (n: ProductionNode, ti: number): void => {
    (nodesByItem.get(n.item) ?? nodesByItem.set(n.item, []).get(n.item)!).push(n);
    if (isCrafted(n)) {
      combinedRate.set(n.item, (combinedRate.get(n.item) ?? 0) + n.ratePerSecond);
      let s = targetsByItem.get(n.item);
      if (!s) targetsByItem.set(n.item, (s = new Set()));
      s.add(ti);
    }
    for (const c of n.children) collect(c, ti);
  };
  const depth = (n: ProductionNode): number => {
    let d = 0;
    for (const c of n.children) d = Math.max(d, 1 + depth(c));
    depthByItem.set(n.item, Math.max(depthByItem.get(n.item) ?? 0, d));
    return d;
  };
  plans.forEach((p, ti) => { collect(p.root, ti); depth(p.root); });

  const sharedCounts = new Map<string, number>();
  for (const [item, s] of targetsByItem) if (s.size >= 2) sharedCounts.set(item, s.size);
  const isShared = (item: string): boolean => sharedCounts.has(item);

  // Nearest shared descendants of each shared item (skip non-shared nodes).
  const childrenOf = new Map<string, Set<string>>();
  const findNearest = (node: ProductionNode, acc: Set<string>): void => {
    for (const c of node.children) {
      if (isShared(c.item)) acc.add(c.item);
      else findNearest(c, acc);
    }
  };
  for (const item of sharedCounts.keys()) {
    const acc = new Set<string>();
    for (const occ of nodesByItem.get(item) ?? []) findNearest(occ, acc);
    acc.delete(item);
    childrenOf.set(item, acc);
  }

  const childIds = new Set<string>();
  for (const set of childrenOf.values()) for (const c of set) childIds.add(c);
  const rootItems = [...sharedCounts.keys()].filter((i) => !childIds.has(i));

  // Order: deepest (most complex) first, then larger rate, then id.
  const cmp = (a: string, b: string): number =>
    (depthByItem.get(b) ?? 0) - (depthByItem.get(a) ?? 0) ||
    (combinedRate.get(b) ?? 0) - (combinedRate.get(a) ?? 0) ||
    a.localeCompare(b);

  const placed = new Set<string>();
  const build = (item: string): SharedComponentNode => {
    const node: SharedComponentNode = {
      item,
      combinedRatePerSecond: combinedRate.get(item) ?? 0,
      targetCount: sharedCounts.get(item) ?? 0,
      children: [],
      reference: false,
    };
    if (placed.has(item)) { node.reference = true; return node; } // dedup
    placed.add(item);
    node.children = [...(childrenOf.get(item) ?? [])].sort(cmp).map(build);
    return node;
  };

  const roots = rootItems.sort(cmp).map(build);
  return { roots, sharedCounts };
}
