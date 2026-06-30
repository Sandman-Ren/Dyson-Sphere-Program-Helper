import { describe, it, expect } from 'vitest';
import { buildRecipeGraph } from './recipe-graph.js';
import { solve } from './solver.js';
import { combinePlans, collectMachineCounts, collectItemTotals, buildSharedComponents } from './shared-components.js';
import type { NodeSelector } from './shared-components.js';
import type { Recipe, Machine } from '../data/schema.js';

const S: Machine = { id: 's', name: 'S', speed: 1, usageKW: 100, drainKW: 0, modules: 0, powerType: 'electric' };
const synth = (r: Recipe[]) => buildRecipeGraph(r, [S], { excludedRecipes: [], proliferableRecipes: [] });

// a and b both consume `shared`; `shared` is crafted from raw ore (mined).
const SHARED = synth([
  { id: 'a', name: 'a', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'a', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'b', name: 'b', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'b', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'shared', name: 'shared', time: 1, in: [{ id: 'ore', amount: 1 }], out: [{ id: 'shared', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'ore', name: 'ore', time: 1, in: [], out: [{ id: 'ore', amount: 1 }], producers: ['s'], flags: ['mining'] },
]);

describe('combinePlans', () => {
  it("single plan combines to that plan's totals (parity)", () => {
    const p = solve(SHARED, 'a', 2);
    const c = combinePlans([p]);
    expect(c.totalMachines).toEqual(p.totalMachines);
    expect(c.rawResources).toEqual(p.rawResources);
    expect(c.totalPowerKW).toBeCloseTo(p.totalPowerKW, 9);
  });
  it('sums machines and raws across plans', () => {
    const c = combinePlans([solve(SHARED, 'a', 2), solve(SHARED, 'b', 3)]);
    // shared: 2 + 3 = 5 crafts/s → ore 5/s
    expect(c.rawResources['ore']).toBeCloseTo(5, 9);
  });
});

describe('collectMachineCounts', () => {
  it('gathers every positive machinesNeeded across plans', () => {
    const counts = collectMachineCounts([solve(SHARED, 'a', 2)]);
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.every((n) => n > 0)).toBe(true);
  });
});

describe('collectItemTotals', () => {
  const throughput: NodeSelector = (n) => n.ratePerSecond;
  const machines: NodeSelector = (n) => (n.machine && n.machinesNeeded > 0 ? n.machinesNeeded : null);

  it('sums a selected value per item, including the root target and raw resources', () => {
    const totals = collectItemTotals(solve(SHARED, 'a', 2).root, throughput);
    expect(totals.get('a')).toBeCloseTo(2, 9);       // root/target included
    expect(totals.get('shared')).toBeCloseTo(2, 9);
    expect(totals.get('ore')).toBeCloseTo(2, 9);     // mined raw included
  });

  it('merges diamond dependencies, summing both occurrences of a shared item', () => {
    // r needs m1 + m2; both consume `common`, so `common` appears twice in one tree.
    const g = synth([
      { id: 'r', name: 'r', time: 1, in: [{ id: 'm1', amount: 1 }, { id: 'm2', amount: 1 }], out: [{ id: 'r', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'm1', name: 'm1', time: 1, in: [{ id: 'common', amount: 1 }], out: [{ id: 'm1', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'm2', name: 'm2', time: 1, in: [{ id: 'common', amount: 1 }], out: [{ id: 'm2', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'common', name: 'common', time: 1, in: [{ id: 'ore', amount: 1 }], out: [{ id: 'common', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'ore', name: 'ore', time: 1, in: [], out: [{ id: 'ore', amount: 1 }], producers: ['s'], flags: ['mining'] },
    ]);
    const totals = collectItemTotals(solve(g, 'r', 1).root, throughput);
    expect(totals.get('common')).toBeCloseTo(2, 9);  // 1 via m1 + 1 via m2
    expect(totals.get('ore')).toBeCloseTo(2, 9);
  });

  it('omits nodes the selector skips', () => {
    // `raw` has no recipe → a machine-less leaf the machine selector rejects.
    const g = synth([
      { id: 'a', name: 'a', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'a', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'shared', name: 'shared', time: 1, in: [{ id: 'raw', amount: 1 }], out: [{ id: 'shared', amount: 1 }], producers: ['s'], flags: [] },
    ]);
    const root = solve(g, 'a', 1).root;
    const byMachine = collectItemTotals(root, machines);
    expect(byMachine.has('raw')).toBe(false);        // no machine → skipped
    expect(byMachine.has('a')).toBe(true);
    expect(collectItemTotals(root, throughput).has('raw')).toBe(true); // throughput counts it
  });
});

describe('buildSharedComponents', () => {
  it('is empty for a single target', () => {
    const r = buildSharedComponents([solve(SHARED, 'a', 1)]);
    expect(r.roots).toEqual([]);
    expect(r.sharedCounts.size).toBe(0);
  });

  it('detects a shared crafted item with combined rate and count', () => {
    const r = buildSharedComponents([solve(SHARED, 'a', 2), solve(SHARED, 'b', 3)]);
    expect(r.sharedCounts.get('shared')).toBe(2);
    expect(r.roots).toHaveLength(1);
    expect(r.roots[0]!.item).toBe('shared');
    expect(r.roots[0]!.combinedRatePerSecond).toBeCloseTo(5, 9);
    expect(r.roots[0]!.targetCount).toBe(2);
    expect(r.roots[0]!.reference).toBe(false);
    // 'ore' is mined → excluded from shared
    expect(r.sharedCounts.has('ore')).toBe(false);
  });

  it('nests a shared child under its nearest shared ancestor, ordered complex→raw', () => {
    // t1, t2 both consume x; x→y, y→ore. x and y shared (count 2).
    const g = synth([
      { id: 't1', name: 't1', time: 1, in: [{ id: 'x', amount: 1 }], out: [{ id: 't1', amount: 1 }], producers: ['s'], flags: [] },
      { id: 't2', name: 't2', time: 1, in: [{ id: 'x', amount: 1 }], out: [{ id: 't2', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'x', name: 'x', time: 1, in: [{ id: 'y', amount: 1 }], out: [{ id: 'x', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'y', name: 'y', time: 1, in: [{ id: 'ore', amount: 1 }], out: [{ id: 'y', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'ore', name: 'ore', time: 1, in: [], out: [{ id: 'ore', amount: 1 }], producers: ['s'], flags: ['mining'] },
    ]);
    const r = buildSharedComponents([solve(g, 't1', 1), solve(g, 't2', 1)]);
    expect(r.roots.map((n) => n.item)).toEqual(['x']);     // x is more complex → root
    expect(r.roots[0]!.children.map((n) => n.item)).toEqual(['y']);  // y nested under x
  });

  it('dedups a shared item reached from two shared parents (reference node)', () => {
    // t1, t2 both consume a and b; a→c, b→c; a,b,c all shared.
    const g = synth([
      { id: 't1', name: 't1', time: 1, in: [{ id: 'a', amount: 1 }, { id: 'b', amount: 1 }], out: [{ id: 't1', amount: 1 }], producers: ['s'], flags: [] },
      { id: 't2', name: 't2', time: 1, in: [{ id: 'a', amount: 1 }, { id: 'b', amount: 1 }], out: [{ id: 't2', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'a', name: 'a', time: 1, in: [{ id: 'c', amount: 1 }], out: [{ id: 'a', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'b', name: 'b', time: 1, in: [{ id: 'c', amount: 1 }], out: [{ id: 'b', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'c', name: 'c', time: 1, in: [{ id: 'ore', amount: 1 }], out: [{ id: 'c', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'ore', name: 'ore', time: 1, in: [], out: [{ id: 'ore', amount: 1 }], producers: ['s'], flags: ['mining'] },
    ]);
    const r = buildSharedComponents([solve(g, 't1', 1), solve(g, 't2', 1)]);
    expect(r.roots.map((n) => n.item).sort()).toEqual(['a', 'b']);   // a, b are roots
    const cNodes = r.roots.flatMap((n) => n.children).filter((n) => n.item === 'c');
    expect(cNodes).toHaveLength(2);                                   // c under both a and b
    expect(cNodes.filter((n) => n.reference === false)).toHaveLength(1); // full once
    expect(cNodes.filter((n) => n.reference === true)).toHaveLength(1);  // reference once
  });
});
