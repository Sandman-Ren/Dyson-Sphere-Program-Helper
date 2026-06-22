import type { BalancedPlan } from './types.js';

export interface BlockSuggestion {
  item: string;
  fanOut: number;       // distinct active recipes consuming this item
  throughput: number;   // total items/s consumed across the plan
  score: number;        // fanOut × throughput
  suggested: boolean;
}

/**
 * Score every produced intermediate by how worth centralizing it is.
 * Fan-out (distinct consumers) is the centralization signal; throughput breaks
 * ties. Target items are excluded — they are always their own block.
 */
export function scoreIntermediates(plan: BalancedPlan, targetItems: Set<string>): BlockSuggestion[] {
  // item → set of consuming recipe ids, and total consumed rate.
  const consumers = new Map<string, Set<string>>();
  const throughput = new Map<string, number>();
  for (const sr of plan.recipes) {
    if (sr.runsPerSecond <= 0) continue;
    for (const inp of sr.recipe.in) {
      const set = consumers.get(inp.id) ?? new Set<string>();
      set.add(sr.recipe.id);
      consumers.set(inp.id, set);
      throughput.set(inp.id, (throughput.get(inp.id) ?? 0) + inp.amount * sr.runsPerSecond);
    }
  }

  const items = [...plan.producerOf.keys()].filter(
    (item) => !targetItems.has(item) && !plan.producerOf.get(item)!.recipe.flags.includes('mining'),
  );

  const throughputs = items.map((i) => throughput.get(i) ?? 0).filter((t) => t > 0).sort((a, b) => a - b);
  const mid = Math.floor(throughputs.length / 2);
  const median = throughputs.length === 0
    ? 0
    : throughputs.length % 2 === 1
      ? throughputs[mid]!
      : (throughputs[mid - 1]! + throughputs[mid]!) / 2;

  const out: BlockSuggestion[] = items.map((item) => {
    const fanOut = consumers.get(item)?.size ?? 0;
    const tp = throughput.get(item) ?? 0;
    return { item, fanOut, throughput: tp, score: fanOut * tp, suggested: fanOut >= 2 && tp >= median && tp > 0 };
  });
  return out.sort((a, b) => b.score - a.score);
}
