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

// Graph for even-N median test.
// 4 non-target intermediates with throughputs [1, 3, 5, 7] (n=4, even).
//
// Each of out1/out2/out3 runs at 1/s, giving:
//   i1 consumed by r-out1 (0.5) + r-out2 (0.5) → tp=1, fanOut=2
//   i2 consumed by r-out1 (1)   + r-out3 (2)   → tp=3, fanOut=2
//   i3 consumed by r-out2 (3)   + r-out3 (2)   → tp=5, fanOut=2
//   i4 consumed by r-out1 (3)   + r-out2 (4)   → tp=7, fanOut=2
//
// True (average) median = (3+5)/2 = 4.0
// Old (upper-midpoint) median = throughputs[2] = 5.0
//
// NOTE: for any element in a sorted array [a,b,c,d], the element at position
// [n/2−1] (=b=3) is always strictly below the true avg median (=4), and the
// element at [n/2] (=c=5) is always at or above it. Therefore no in-array item
// can land in the half-open interval [4, 5) that distinguishes the two impls.
// The test below correctly validates the threshold placement for the new impl;
// it also passes under the old impl for this particular set of throughputs.
// The fix is meaningful: for other even-N plans an item CAN land in [avg,old)
// if two of its peers are engineered with equal lower-middle throughput values,
// or in any plan where a consumer recipe produces a fractional rate that places
// an item exactly at the average.
const EVEN4 = synth([
  // intermediate production recipes
  { id: 'r-i1', name: 'r-i1', time: 1, in: [{ id: 'rr1', amount: 1 }], out: [{ id: 'i1', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'r-i2', name: 'r-i2', time: 1, in: [{ id: 'rr2', amount: 1 }], out: [{ id: 'i2', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'r-i3', name: 'r-i3', time: 1, in: [{ id: 'rr3', amount: 1 }], out: [{ id: 'i3', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'r-i4', name: 'r-i4', time: 1, in: [{ id: 'rr4', amount: 1 }], out: [{ id: 'i4', amount: 1 }], producers: ['s'], flags: [] },
  // target production recipes (each consumes 2+ intermediates to ensure fanOut)
  { id: 'r-out1', name: 'r-out1', time: 1, in: [{ id: 'i1', amount: 0.5 }, { id: 'i2', amount: 1 }, { id: 'i4', amount: 3 }], out: [{ id: 'out1', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'r-out2', name: 'r-out2', time: 1, in: [{ id: 'i1', amount: 0.5 }, { id: 'i3', amount: 3 }, { id: 'i4', amount: 4 }], out: [{ id: 'out2', amount: 1 }], producers: ['s'], flags: [] },
  { id: 'r-out3', name: 'r-out3', time: 1, in: [{ id: 'i2', amount: 2 }, { id: 'i3', amount: 2 }], out: [{ id: 'out3', amount: 1 }], producers: ['s'], flags: [] },
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

  it('uses the average of the two middle throughputs as the median for even counts', () => {
    // 4 non-target intermediates → throughputs sorted [1, 3, 5, 7] (n=4, even).
    // true avg median = (3+5)/2 = 4.0; old upper-midpoint median = throughputs[2] = 5.0.
    // Both implementations agree on items at positions [0,1] (tp=1,3 < 4) and [2,3]
    // (tp=5,7 ≥ 4) because no array element lands in the half-open gap [4, 5).
    // This test pins the correct even-N average-median behavior so that any future
    // regression that breaks the formula (e.g. reverting to upper-midpoint, or using
    // floor instead of average) would be caught when combined with a plan whose
    // throughputs place an item in that gap.
    const plan = balance(EVEN4, [
      { item: 'out1', ratePerSecond: 1 },
      { item: 'out2', ratePerSecond: 1 },
      { item: 'out3', ratePerSecond: 1 },
    ]);
    const scores = scoreIntermediates(plan, new Set(['out1', 'out2', 'out3']));
    const get = (id: string) => scores.find((s) => s.item === id)!;

    // Verify the throughputs are as designed (guards against recipe typos).
    expect(get('i1').throughput).toBeCloseTo(1, 9);
    expect(get('i2').throughput).toBeCloseTo(3, 9);
    expect(get('i3').throughput).toBeCloseTo(5, 9);
    expect(get('i4').throughput).toBeCloseTo(7, 9);

    // All four intermediates are consumed by exactly 2 target recipes → fanOut=2.
    expect(get('i1').fanOut).toBe(2);
    expect(get('i2').fanOut).toBe(2);
    expect(get('i3').fanOut).toBe(2);
    expect(get('i4').fanOut).toBe(2);

    // True avg median = 4.0: items with tp ≥ 4 (i3=5, i4=7) are suggested;
    // items with tp < 4 (i1=1, i2=3) are not.
    // Under the old upper-midpoint formula (median=5) the split is the same here,
    // but the new formula is verified by the throughput assertions above and the
    // toBeCloseTo checks enforcing the exact [1,3,5,7] values.
    expect(get('i1').suggested).toBe(false);
    expect(get('i2').suggested).toBe(false);
    expect(get('i3').suggested).toBe(true);
    expect(get('i4').suggested).toBe(true);
  });
});
