import type { ProductionPlan, ProductionNode } from './types.js';

/**
 * Total consumption (items/s) of every item in a solved plan, summed across all
 * occurrences, EXCLUDING the root node. The root's rate is the plan's delivered
 * output, not internal consumption; every other node's rate is the amount its
 * parent consumes. The result therefore means "consumption of item X".
 */
export function extractConsumption(plan: ProductionPlan): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (n: ProductionNode): void => {
    out.set(n.item, (out.get(n.item) ?? 0) + n.ratePerSecond);
    for (const c of n.children) walk(c);
  };
  // Skip the root itself; start from its children.
  for (const c of plan.root.children) walk(c);
  return out;
}
