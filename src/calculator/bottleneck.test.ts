import { describe, it, expect } from 'vitest';
import { extractConsumption, computeAllocation, type VariableInput } from './bottleneck.js';
import type { ProductionPlan, ProductionNode } from './types.js';

// Minimal node factory — only the fields extractConsumption reads.
function node(item: string, ratePerSecond: number, children: ProductionNode[] = []): ProductionNode {
  return {
    item, recipe: null, machine: null, ratePerSecond, machinesNeeded: 0,
    children, powerKW: 0, mined: false, proliferated: false,
  };
}
function plan(root: ProductionNode): ProductionPlan {
  return { root, totalMachines: {}, rawResources: {}, totalPowerKW: 0, proliferatorSpraysPerSecond: 0 };
}

describe('extractConsumption', () => {
  it('excludes the root output node', () => {
    const p = plan(node('gear', 1, [node('iron', 2)]));
    const c = extractConsumption(p);
    expect(c.get('gear')).toBeUndefined(); // root output is not consumption
    expect(c.get('iron')).toBe(2);
  });

  it('sums a component appearing at multiple nodes', () => {
    const p = plan(node('thing', 1, [
      node('iron', 3, [node('copper', 1)]),
      node('plate', 2, [node('iron', 4)]),
    ]));
    const c = extractConsumption(p);
    expect(c.get('iron')).toBe(7); // 3 + 4
    expect(c.get('copper')).toBe(1);
    expect(c.get('plate')).toBe(2);
  });

  it('counts an intermediate even when its own subtree has another tracked item', () => {
    const p = plan(node('out', 1, [node('mid', 5, [node('raw', 10)])]));
    const c = extractConsumption(p);
    expect(c.get('mid')).toBe(5);
    expect(c.get('raw')).toBe(10);
  });
});

const vi = (id: string, fp: Record<string, number>, intent: number, fallback = 0): VariableInput =>
  ({ id, footprint: new Map(Object.entries(fp)), intent, fallback });

describe('computeAllocation', () => {
  it('single bounded target takes its max', () => {
    const r = computeAllocation(new Map([['ore', 100]]), new Map(), [vi('t1', { ore: 2 }, Infinity)]);
    expect(r.targets.get('t1')!.effectiveRate).toBe(50);
    expect(r.targets.get('t1')!.sliderMax).toBe(50);
    expect(r.targets.get('t1')!.bounded).toBe(true);
    expect(r.components.get('ore')!.variableUse).toBe(100);
    expect(r.components.get('ore')!.free).toBe(0);
    expect(r.components.get('ore')!.overAllocated).toBe(false);
  });

  it('fixed use is subtracted first; over-allocation flags', () => {
    const r = computeAllocation(new Map([['ore', 100]]), new Map([['ore', 120]]), [vi('t1', { ore: 1 }, Infinity)]);
    expect(r.targets.get('t1')!.effectiveRate).toBe(0); // nothing left
    const ore = r.components.get('ore')!;
    expect(ore.fixedUse).toBe(120);
    expect(ore.overAllocated).toBe(true);
    expect(ore.free).toBe(0);
  });

  it('sequential sweep is globally feasible for 3 targets / 2 components', () => {
    const pinned = new Map([['c1', 100], ['c2', 100]]);
    const r = computeAllocation(pinned, new Map(), [
      vi('t1', { c1: 2, c2: 1 }, Infinity),
      vi('t2', { c1: 1, c2: 2 }, Infinity),
      vi('t3', { c1: 1, c2: 1 }, Infinity),
    ]);
    expect(r.targets.get('t1')!.effectiveRate).toBe(50);
    expect(r.targets.get('t2')!.effectiveRate).toBe(0);
    expect(r.targets.get('t3')!.effectiveRate).toBe(0);
    // global feasibility
    expect(r.components.get('c1')!.total).toBeLessThanOrEqual(100 + 1e-9);
    expect(r.components.get('c2')!.total).toBeLessThanOrEqual(100 + 1e-9);
  });

  it('lowering an earlier target frees headroom for a later one', () => {
    const pinned = new Map([['c1', 100], ['c2', 100]]);
    const r = computeAllocation(pinned, new Map(), [
      vi('t1', { c1: 2, c2: 1 }, 10),   // intent capped at 10
      vi('t2', { c1: 1, c2: 2 }, Infinity),
    ]);
    expect(r.targets.get('t1')!.effectiveRate).toBe(10);  // 10, not 50
    // remaining c1 = 100-20=80, c2 = 100-10=90 → t2 max = min(80/1, 90/2)=45
    expect(r.targets.get('t2')!.effectiveRate).toBe(45);
  });

  it('an unbounded target (no pinned footprint) uses its fallback, sliderMax null', () => {
    const r = computeAllocation(new Map([['ore', 100]]), new Map(), [vi('t1', { water: 3 }, Infinity, 12)]);
    const t = r.targets.get('t1')!;
    expect(t.bounded).toBe(false);
    expect(t.sliderMax).toBeNull();
    expect(t.effectiveRate).toBe(12); // fallback, never Infinity
  });

  it('a finite intent on a bounded target is clamped to headroom', () => {
    const r = computeAllocation(new Map([['ore', 100]]), new Map(), [vi('t1', { ore: 2 }, 30)]);
    expect(r.targets.get('t1')!.effectiveRate).toBe(30);   // 30 <= 50
    expect(r.targets.get('t1')!.sliderMax).toBe(50);
  });
});
