import { describe, it, expect } from 'vitest';
import { buildRecipeGraph } from './recipe-graph.js';
import { solve } from './solver.js';
import type { Recipe, Machine } from '../data/schema.js';
import recipesData from '../data/generated/recipes.json';
import machinesData from '../data/generated/machines.json';
import metaData from '../data/generated/meta.json';

const recipes = recipesData as Recipe[];
const machines = machinesData as Machine[];
const meta = metaData as { excludedRecipes: string[]; proliferableRecipes: string[] };

const graph = buildRecipeGraph(recipes, machines, meta);

describe('primary recipe selection for mineable-and-craftable items', () => {
  // These items can be both pumped/mined (a planet-specific bonus) and crafted.
  // The craft recipe is the universal source, so it must win as the primary —
  // otherwise the calculator shows them as raw and hides the production chain.
  it('prefers the craft recipe over the mining/pump recipe', () => {
    expect(graph.itemToRecipe.get('sulfuric-acid')?.id).toBe('sulfuric-acid');
    expect(graph.itemToRecipe.get('organic-crystal')?.id).toBe('organic-crystal');
  });

  it('does not treat a craft-primary item as a raw mined resource', () => {
    expect(graph.minedResources.has('sulfuric-acid')).toBe(false);
    expect(graph.minedResources.has('organic-crystal')).toBe(false);
  });

  it('still treats genuine ores (only obtainable by mining) as raw', () => {
    expect(graph.minedResources.has('iron-ore')).toBe(true);
    expect(graph.minedResources.has('copper-ore')).toBe(true);
  });

  it('leaves items that already default to a craft recipe unchanged', () => {
    expect(graph.itemToRecipe.get('hydrogen')?.id).toBe('plasma-refining');
    expect(graph.itemToRecipe.get('deuterium')?.id).toBe('deuterium-fractionation');
  });

  it('solves sulfuric acid through its chemical chain, not as a raw input', () => {
    const plan = solve(graph, 'sulfuric-acid', 4);
    expect(plan.root.recipe?.id).toBe('sulfuric-acid');
    const childIds = plan.root.children.map((c) => c.item).sort();
    expect(childIds).toEqual(['refined-oil', 'stone', 'water']);
    expect(plan.rawResources['sulfuric-acid']).toBeUndefined();
  });
});
