import { describe, it, expect } from 'vitest';
import { solveLinearSystem, balance } from './matrix.js';
import { buildRecipeGraph } from '../recipe-graph.js';
import type { Recipe, Machine, Proliferator } from '../../data/schema.js';
import recipesData from '../../data/generated/recipes.json';
import machinesData from '../../data/generated/machines.json';
import metaData from '../../data/generated/meta.json';
import proliferatorsData from '../../data/generated/proliferators.json';

const realRecipes = recipesData as Recipe[];
const realMachines = machinesData as Machine[];
const realMeta = metaData as { excludedRecipes: string[]; proliferableRecipes: string[] };
const realProliferators = proliferatorsData as Proliferator[];
const realGraph = buildRecipeGraph(realRecipes, realMachines, realMeta);

// A tiny synthetic dataset for deterministic numeric assertions.
const SMELTER: Machine = {
  id: 's', name: 'S', speed: 1, usageKW: 100, drainKW: 0, modules: 0, powerType: 'electric',
};
function synth(recipes: Recipe[]) {
  return buildRecipeGraph(recipes, [SMELTER], { excludedRecipes: [], proliferableRecipes: [] });
}

describe('balance — consolidation', () => {
  it('consolidates a shared intermediate into a single recipe entry', () => {
    // a and b both consume 1 shared per craft; shared is crafted from raw.
    const g = synth([
      { id: 'a', name: 'a', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'a', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'b', name: 'b', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'b', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'shared', name: 'shared', time: 1, in: [{ id: 'raw', amount: 1 }], out: [{ id: 'shared', amount: 1 }], producers: ['s'], flags: [] },
    ]);
    const plan = balance(g, [{ item: 'a', ratePerSecond: 2 }, { item: 'b', ratePerSecond: 3 }]);
    const sharedRecipes = plan.recipes.filter((r) => r.mainItem === 'shared');
    expect(sharedRecipes).toHaveLength(1);            // one entry, not two
    expect(sharedRecipes[0]!.runsPerSecond).toBeCloseTo(5, 9); // 2 + 3
    expect(plan.rawResources['raw']).toBeCloseTo(5, 9);
  });
});

describe('balance — byproduct netting', () => {
  it('offsets demand with byproduct surplus', () => {
    // main: raw -> main + 1 bp (byproduct). bp also has its own recipe raw2 -> bp.
    // Demand 10 main + 4 bp. main runs = 10 → yields 10 bp → covers 4 demand,
    // leaving 6 surplus, and the bp recipe runs 0.
    const g = synth([
      { id: 'main', name: 'main', time: 1, in: [{ id: 'raw', amount: 1 }], out: [{ id: 'main', amount: 1 }, { id: 'bp', amount: 1 }], producers: ['s'], flags: [] },
      { id: 'bp', name: 'bp', time: 1, in: [{ id: 'raw2', amount: 1 }], out: [{ id: 'bp', amount: 1 }], producers: ['s'], flags: [] },
    ]);
    const plan = balance(g, [{ item: 'main', ratePerSecond: 10 }, { item: 'bp', ratePerSecond: 4 }]);
    expect(plan.producerOf.get('main')!.runsPerSecond).toBeCloseTo(10, 9);
    expect(plan.producerOf.get('bp')!.runsPerSecond).toBeCloseTo(0, 9);  // fully covered by byproduct
    const bpBalance = plan.balances.find((b) => b.item === 'bp')!;
    expect(bpBalance.surplus).toBeCloseTo(6, 9);
    expect(plan.surpluses.some((s) => s.item === 'bp')).toBe(true);
    expect(plan.errors).toHaveLength(0);
  });
});

describe('balance — loop', () => {
  it('terminates and balances a 2-recipe loop', () => {
    // r1: raw + 1 y -> 2 x ; r2: 1 x -> 1 y. Demand 2 x.
    // x balance: 2*r1 - 1*r2 = 2 ; y balance: 1*r2 - 1*r1 = 0 → r1=r2 → r1=r2=2.
    const g = synth([
      { id: 'r1', name: 'r1', time: 1, in: [{ id: 'raw', amount: 1 }, { id: 'y', amount: 1 }], out: [{ id: 'x', amount: 2 }], producers: ['s'], flags: [] },
      { id: 'r2', name: 'r2', time: 1, in: [{ id: 'x', amount: 1 }], out: [{ id: 'y', amount: 1 }], producers: ['s'], flags: [] },
    ]);
    const plan = balance(g, [{ item: 'x', ratePerSecond: 2 }]);
    expect(plan.producerOf.get('x')!.runsPerSecond).toBeCloseTo(2, 9);
    expect(plan.producerOf.get('y')!.runsPerSecond).toBeCloseTo(2, 9);
    expect(plan.errors).toHaveLength(0);
  });
});

describe('balance — real data smoke', () => {
  it('produces consolidated totals for two sharing targets', () => {
    const plan = balance(realGraph, [
      { item: 'electromagnetic-matrix', ratePerSecond: 1 },
      { item: 'energy-matrix', ratePerSecond: 1 },
    ]);
    expect(plan.errors).toHaveLength(0);
    expect(Object.keys(plan.totalMachines).length).toBeGreaterThan(3);
    expect(plan.rawResources['iron-ore']).toBeGreaterThan(0);
    // magnetic-coil is shared by both matrices → exactly one recipe entry.
    expect(plan.recipes.filter((r) => r.mainItem === 'magnetic-coil')).toHaveLength(1);
  });

  it('applies an extra-products proliferator (fewer raws)', () => {
    const mk3 = realProliferators.find((p) => p.id === 'proliferator-3-products')!;
    const base = balance(realGraph, [{ item: 'magnetic-coil', ratePerSecond: 10 }]);
    const sprayed = balance(realGraph, [{ item: 'magnetic-coil', ratePerSecond: 10 }], { proliferator: mk3 });
    expect(sprayed.rawResources['iron-ore']).toBeLessThan(base.rawResources['iron-ore']);
    expect(sprayed.proliferatorSpraysPerSecond).toBeGreaterThan(0);
  });
});

describe('solveLinearSystem', () => {
  it('solves a 2x2 system', () => {
    // x + y = 3 ; x - y = 1  → x=2, y=1
    const x = solveLinearSystem([[1, 1], [1, -1]], [3, 1]);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(2, 9);
    expect(x![1]).toBeCloseTo(1, 9);
  });

  it('handles a system needing pivoting (leading zero)', () => {
    // 0x + 1y = 2 ; 1x + 1y = 3  → x=1, y=2
    const x = solveLinearSystem([[0, 1], [1, 1]], [2, 3]);
    expect(x![0]).toBeCloseTo(1, 9);
    expect(x![1]).toBeCloseTo(2, 9);
  });

  it('returns null for a singular matrix', () => {
    expect(solveLinearSystem([[1, 1], [2, 2]], [1, 2])).toBeNull();
  });

  it('solves the trivial 1x1 system', () => {
    expect(solveLinearSystem([[4]], [8])![0]).toBeCloseTo(2, 9);
  });
});
