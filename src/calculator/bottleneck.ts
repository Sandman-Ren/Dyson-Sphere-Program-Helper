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

const EPS = 1e-9;

export interface VariableInput {
  id: string;
  footprint: Map<string, number>;
  intent: number;
  fallback: number;
}
export interface AllocationTarget {
  id: string;
  effectiveRate: number;
  sliderMax: number | null;
  bounded: boolean;
}
export interface AllocationComponent {
  supply: number; fixedUse: number; variableUse: number; total: number;
  free: number; overAllocated: boolean;
}
export interface AllocationResult {
  targets: Map<string, AllocationTarget>;
  components: Map<string, AllocationComponent>;
}

/**
 * Deterministic sequential allocation sweep. Fixed targets draw from the pinned
 * pool first; variable targets then divide the remainder in target order, each
 * clamped to the running headroom so the pool is never over-divided (global
 * feasibility). An unbounded target (no positive footprint on any pinned
 * component) uses its finite fallback and never touches the pool.
 */
export function computeAllocation(
  pinned: Map<string, number>,
  fixedUse: Map<string, number>,
  variable: VariableInput[],
): AllocationResult {
  // Running pool after fixed-target draw. May start negative (over-allocated).
  const remaining = new Map<string, number>();
  for (const [c, supply] of pinned) remaining.set(c, supply - (fixedUse.get(c) ?? 0));

  const variableUse = new Map<string, number>();
  const targets = new Map<string, AllocationTarget>();

  for (const v of variable) {
    // Only pinned components with a positive footprint constrain this target.
    const constraints: Array<[string, number]> = [];
    for (const [c, fp] of v.footprint) {
      if (fp > EPS && pinned.has(c)) constraints.push([c, fp]);
    }

    if (constraints.length === 0) {
      const eff = Number.isFinite(v.intent) ? Math.max(0, v.intent) : Math.max(0, v.fallback);
      targets.set(v.id, { id: v.id, effectiveRate: eff, sliderMax: null, bounded: false });
      continue;
    }

    let headroom = Infinity;
    for (const [c, fp] of constraints) {
      headroom = Math.min(headroom, Math.max(0, remaining.get(c) ?? 0) / fp);
    }
    const eff = Math.max(0, Math.min(v.intent, headroom)); // Infinity intent → headroom
    for (const [c, fp] of constraints) {
      remaining.set(c, (remaining.get(c) ?? 0) - fp * eff);
      variableUse.set(c, (variableUse.get(c) ?? 0) + fp * eff);
    }
    targets.set(v.id, { id: v.id, effectiveRate: eff, sliderMax: headroom, bounded: true });
  }

  const components = new Map<string, AllocationComponent>();
  for (const [c, supply] of pinned) {
    const fu = fixedUse.get(c) ?? 0;
    const vu = variableUse.get(c) ?? 0;
    const total = fu + vu;
    components.set(c, {
      supply, fixedUse: fu, variableUse: vu, total,
      free: Math.max(0, supply - total),
      overAllocated: total > supply + EPS,
    });
  }
  return { targets, components };
}
