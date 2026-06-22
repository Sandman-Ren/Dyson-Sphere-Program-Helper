import { describe, it, expect } from 'vitest';
import { buildRecipeGraph } from '../recipe-graph.js';
import { balance } from './matrix.js';
import { scoreIntermediates } from './blocks.js';
import type { Recipe, Machine } from '../../data/schema.js';

const S: Machine = { id: 's', name: 'S', speed: 1, usageKW: 100, drainKW: 0, modules: 0, powerType: 'electric' };
const synth = (r: Recipe[]) => buildRecipeGraph(r, [S], { excludedRecipes: [], proliferableRecipes: [] });

const SHARED = synth([
  { id: 'a', name: 'a', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'a', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'b', name: 'b', time: 1, in: [{ id: 'shared', amount: 1 }], out: [{ id: 'b', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'shared', name: 'shared', time: 1, in: [{ id: 'raw', amount: 1 }], out: [{ id: 'shared', amount: 1 }], producers: ['s'], flags: [] },
]);

describe('scoreIntermediates', () => {
  it('flags a high-fan-out shared item as a suggestion', () => {
    const plan = balance(SHARED, [{ item: 'a', ratePerSecond: 2 }, { item: 'b', ratePerSecond: 2 }]);
    const scores = scoreIntermediates(plan, new Set(['a', 'b']));
    const shared = scores.find((s) => s.item === 'shared')!;
    expect(shared.fanOut).toBe(2);
    expect(shared.throughput).toBeCloseTo(4, 9);
    expect(shared.suggested).toBe(true);
  });

  it('never suggests a target item', () => {
    const plan = balance(SHARED, [{ item: 'a', ratePerSecond: 2 }, { item: 'b', ratePerSecond: 2 }]);
    const scores = scoreIntermediates(plan, new Set(['a', 'b']));
    expect(scores.some((s) => s.item === 'a')).toBe(false);
  });
});
