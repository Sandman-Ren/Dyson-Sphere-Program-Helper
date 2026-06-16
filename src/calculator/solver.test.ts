import { describe, it, expect } from 'vitest';
import { buildRecipeGraph } from './recipe-graph.js';
import { solve } from './solver.js';
import type { Recipe, Machine, Proliferator } from '../data/schema.js';
import recipesData from '../data/generated/recipes.json';
import machinesData from '../data/generated/machines.json';
import metaData from '../data/generated/meta.json';
import proliferatorsData from '../data/generated/proliferators.json';

const recipes = recipesData as Recipe[];
const machines = machinesData as Machine[];
const meta = metaData as { excludedRecipes: string[]; proliferableRecipes: string[] };
const proliferators = proliferatorsData as Proliferator[];

const graph = buildRecipeGraph(recipes, machines, meta);

describe('recipe graph', () => {
  it('resolves a primary recipe for common products', () => {
    expect(graph.itemToRecipe.has('iron-ingot')).toBe(true);
    expect(graph.itemToRecipe.has('magnetic-coil')).toBe(true);
    expect(graph.itemToRecipe.has('electromagnetic-matrix')).toBe(true);
  });

  it('marks ores as mined raw resources', () => {
    expect(graph.minedResources.has('iron-ore')).toBe(true);
    expect(graph.minedResources.has('copper-ore')).toBe(true);
  });

  it('defaults to the best non–Dark-Fog smelter', () => {
    const ingot = graph.itemToRecipe.get('iron-ingot')!;
    const m = graph.defaultMachine(ingot)!;
    expect(m.id).toBe('plane-smelter'); // speed 2, vs arc (1); df excluded
  });
});

describe('solver', () => {
  it('computes buildings and raw ore for iron ingot', () => {
    const plan = solve(graph, 'iron-ingot', 2); // 2/s
    // plane-smelter speed 2, time 1 → 0.5 buildings per item/s → 1.0 for 2/s
    expect(plan.totalMachines['plane-smelter']).toBeCloseTo(1, 5);
    expect(plan.rawResources['iron-ore']).toBeCloseTo(2, 5);
    expect(plan.totalPowerKW).toBeGreaterThan(0);
  });

  it('recurses multi-step chains down to raw ores', () => {
    const plan = solve(graph, 'magnetic-coil', 1);
    // magnetic coil needs magnet + copper ingot → iron ore + copper ore
    const raws = Object.keys(plan.rawResources);
    expect(raws).toContain('iron-ore');
    expect(raws).toContain('copper-ore');
  });

  it('respects machine overrides', () => {
    const ingot = solve(graph, 'iron-ingot', 1, { 'iron-ingot': 'arc-smelter' });
    // arc-smelter speed 1, time 1 → 1 building per item/s
    expect(ingot.totalMachines['arc-smelter']).toBeCloseTo(1, 5);
    expect(ingot.totalMachines['plane-smelter']).toBeUndefined();
  });

  it('applies extra-products proliferator to eligible recipes', () => {
    const mk3products = proliferators.find((p) => p.id === 'proliferator-3-products')!;
    expect(mk3products).toBeTruthy();
    const base = solve(graph, 'magnetic-coil', 1);
    const sprayed = solve(graph, 'magnetic-coil', 1, undefined, { proliferator: mk3products });
    // Extra products → strictly fewer raw ores for the same output.
    expect(sprayed.rawResources['iron-ore']).toBeLessThan(base.rawResources['iron-ore']);
    expect(sprayed.proliferatorSpraysPerSecond).toBeGreaterThan(0);
  });

  it('terminates on the full universe matrix chain', () => {
    const plan = solve(graph, 'universe-matrix', 1);
    expect(plan.root.children.length).toBeGreaterThan(0);
    expect(Object.keys(plan.totalMachines).length).toBeGreaterThan(3);
  });
});

describe('global machine tiers', () => {
  it('applies a family tier to every recipe in that family', () => {
    // arc-smelter (speed 1) instead of the default plane-smelter (speed 2).
    const plan = solve(graph, 'iron-ingot', 1, undefined, undefined, { smelter: 'arc-smelter' });
    expect(plan.totalMachines['arc-smelter']).toBeCloseTo(1, 5);
    expect(plan.totalMachines['plane-smelter']).toBeUndefined();
  });

  it('lets a per-node override beat the global tier', () => {
    const plan = solve(
      graph, 'iron-ingot', 1,
      { 'iron-ingot': 'plane-smelter' }, // per-node override wins
      undefined,
      { smelter: 'arc-smelter' },        // global tier
    );
    expect(plan.totalMachines['plane-smelter']).toBeCloseTo(0.5, 5); // speed 2
    expect(plan.totalMachines['arc-smelter']).toBeUndefined();
  });

  it('ignores a tier for a family the recipe does not belong to', () => {
    const plan = solve(graph, 'iron-ingot', 1, undefined, undefined, { assembler: 'assembling-machine-1' });
    expect(plan.totalMachines['plane-smelter']).toBeCloseTo(0.5, 5); // unaffected default
  });

  it('applies the miner tier to mined resources deeper in the chain', () => {
    const plan = solve(graph, 'iron-ingot', 1, undefined, undefined, { miner: 'mining-machine' });
    expect(plan.totalMachines['mining-machine']).toBeGreaterThan(0);
    expect(plan.totalMachines['advanced-mining-machine']).toBeUndefined();
  });

  it('falls back to the recipe default when the chosen tier cannot make a recipe', () => {
    // A smelting-style recipe whose only producer is arc-smelter.
    const customRecipes: Recipe[] = [{
      id: 'thing', name: 'Thing', time: 1,
      in: [], out: [{ id: 'thing', amount: 1 }],
      producers: ['arc-smelter'], flags: [],
    }];
    const g = buildRecipeGraph(customRecipes, machines, meta);
    // Prefer plane-smelter, but this recipe only lists arc-smelter → fall back to arc.
    const plan = solve(g, 'thing', 1, undefined, undefined, { smelter: 'plane-smelter' });
    expect(plan.totalMachines['arc-smelter']).toBeCloseTo(1, 5);
    expect(plan.totalMachines['plane-smelter']).toBeUndefined();
  });
});
