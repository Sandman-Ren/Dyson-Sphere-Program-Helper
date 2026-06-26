import { describe, it, expect } from 'vitest';
import { extractConsumption } from './bottleneck.js';
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
