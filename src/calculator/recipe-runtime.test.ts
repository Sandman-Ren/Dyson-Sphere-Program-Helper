import { describe, it, expect } from 'vitest';
import { buildRecipeGraph } from './recipe-graph.js';
import { resolveMachine, proliferatorEffect } from './recipe-runtime.js';
import type { Recipe, Machine } from '../data/schema.js';
import recipesData from './../data/generated/recipes.json';
import machinesData from './../data/generated/machines.json';
import metaData from './../data/generated/meta.json';

const recipes = recipesData as Recipe[];
const machines = machinesData as Machine[];
const meta = metaData as { excludedRecipes: string[]; proliferableRecipes: string[] };
const graph = buildRecipeGraph(recipes, machines, meta);

describe('resolveMachine', () => {
  it('honors a per-item override when it can run the recipe', () => {
    const ingot = graph.itemToRecipe.get('iron-ingot')!;
    const m = resolveMachine(graph, ingot, 'iron-ingot', { 'iron-ingot': 'arc-smelter' }, undefined);
    expect(m?.id).toBe('arc-smelter');
  });

  it('falls back to the family tier, then the default machine', () => {
    const ingot = graph.itemToRecipe.get('iron-ingot')!;
    expect(resolveMachine(graph, ingot, 'iron-ingot', undefined, { smelter: 'arc-smelter' })?.id).toBe('arc-smelter');
    expect(resolveMachine(graph, ingot, 'iron-ingot', undefined, undefined)?.id).toBe('plane-smelter');
  });
});

describe('proliferatorEffect', () => {
  it('returns the no-op effect when there is no proliferator', () => {
    const fx = proliferatorEffect(null, 'magnetic-coil', 1, graph);
    expect(fx).toEqual({ outputMultiplier: 1, speedMultiplier: 1, powerMultiplier: 1, applied: false });
  });
});
