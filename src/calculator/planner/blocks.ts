import type {
  BalancedPlan, Block, BlockImport, GroupedPlan, PlannerTarget, SolvedRecipe,
} from './types.js';

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

const EPS = 1e-9;

/**
 * For each produced item, the fraction of its total consumption attributable to
 * each block. A block-item's recipe belongs wholly to its own block; an inline
 * item's recipe is split across the blocks that ultimately consume it.
 *
 * Computed by memoized recursion from consumers down to producers; cycles fall
 * back to whole attribution to the first block reached (totals stay correct —
 * only the per-block split is approximate inside a loop).
 */
function buildBlockShares(
  plan: BalancedPlan,
  demand: Map<string, number>,
  blockItems: Set<string>,
): Map<string, Map<string, number>> {
  // item → (block → consumed rate of item on behalf of that block)
  const shares = new Map<string, Map<string, number>>();
  const inProgress = new Set<string>();

  const add = (m: Map<string, number>, block: string, rate: number) =>
    m.set(block, (m.get(block) ?? 0) + rate);

  function sharesOf(item: string): Map<string, number> {
    const cached = shares.get(item);
    if (cached) return cached;
    const result = new Map<string, number>();
    shares.set(item, result);
    if (inProgress.has(item)) return result; // cycle guard
    inProgress.add(item);

    // External demand for a target item is attributed to that target's block.
    const ext = demand.get(item) ?? 0;
    if (ext > 0 && blockItems.has(item)) add(result, item, ext);

    // Each recipe that consumes `item`.
    for (const sr of plan.recipes) {
      if (sr.runsPerSecond <= 0) continue;
      const used = (sr.recipe.in.find((i) => i.id === item)?.amount ?? 0) * sr.runsPerSecond;
      if (used <= EPS) continue;
      if (blockItems.has(sr.mainItem)) {
        // Consumer recipe lives inside a block → attribute wholly to that block.
        add(result, sr.mainItem, used);
      } else {
        // Inline consumer → distribute by where its own output goes.
        const downstream = sharesOf(sr.mainItem);
        const total = mapSum(downstream);
        if (total <= EPS) continue;
        for (const [block, rate] of downstream) add(result, block, used * (rate / total));
      }
    }
    inProgress.delete(item);
    return result;
  }

  for (const item of plan.producerOf.keys()) sharesOf(item);
  return shares;
}

const mapSum = (m: Map<string, number>) => {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
};

/** Partition the consolidated plan into self-contained blocks. */
export function groupPlan(
  plan: BalancedPlan,
  targets: PlannerTarget[],
  blockItemsIn: Set<string>,
): GroupedPlan {
  const demand = new Map<string, number>();
  for (const t of targets) if (t.ratePerSecond > 0) demand.set(t.item, (demand.get(t.item) ?? 0) + t.ratePerSecond);

  // Block items always include every target.
  const blockItems = new Set(blockItemsIn);
  for (const item of demand.keys()) blockItems.add(item);
  // Only keep block items that are actually produced in this plan.
  for (const item of [...blockItems]) if (!plan.producerOf.has(item)) blockItems.delete(item);

  const shares = buildBlockShares(plan, demand, blockItems);

  // Per recipe, its run-rate apportioned to each block.
  // Block-item recipe → wholly its own block. Inline recipe → split by its main item's shares.
  function recipeBlockRuns(sr: SolvedRecipe): Map<string, number> {
    const m = new Map<string, number>();
    if (sr.runsPerSecond <= 0) return m;
    if (blockItems.has(sr.mainItem)) { m.set(sr.mainItem, sr.runsPerSecond); return m; }
    const downstream = shares.get(sr.mainItem);
    const total = downstream ? mapSum(downstream) : 0;
    if (!downstream || total <= EPS) return m;
    for (const [block, rate] of downstream) m.set(block, sr.runsPerSecond * (rate / total));
    return m;
  }

  // Initialize a block per block-item.
  const blocks = new Map<string, Block>();
  for (const item of blockItems) {
    blocks.set(item, {
      item,
      kind: demand.has(item) ? 'target' : 'shared',
      exportRate: 0,
      recipes: [],
      machines: {},
      powerKW: 0,
      imports: [],
      feeds: [],
    });
  }

  // Assign scaled recipes to blocks; accumulate machines/power; collect imports.
  const importAgg = new Map<string, Map<string, { rate: number; raw: boolean }>>(); // block → item → import
  const feedAgg = new Map<string, Map<string, number>>(); // producerBlock → consumerBlock → rate

  for (const sr of plan.recipes) {
    const dist = recipeBlockRuns(sr);
    for (const [blockId, runs] of dist) {
      if (runs <= EPS) continue;
      const block = blocks.get(blockId)!;
      const scale = runs / sr.runsPerSecond;
      const scaled: SolvedRecipe = {
        ...sr,
        runsPerSecond: runs,
        machinesNeeded: sr.machinesNeeded * scale,
        powerKW: sr.powerKW * scale,
      };
      block.recipes.push(scaled);
      block.powerKW += scaled.powerKW;
      if (scaled.machine) block.machines[scaled.machine.id] = (block.machines[scaled.machine.id] ?? 0) + scaled.machinesNeeded;

      // Inputs that cross the block boundary (a different block-item or a raw).
      for (const inp of sr.recipe.in) {
        const rate = inp.amount * runs;
        if (rate <= EPS) continue;
        const producer = plan.producerOf.get(inp.id);
        const isRaw = !producer || producer.recipe.flags.includes('mining') || !blockItems.has(inp.id);
        const crossesBoundary = blockItems.has(inp.id) || isRaw;
        if (!crossesBoundary) continue; // produced inline within this block — not an import
        const raw = !producer || producer.recipe.flags.includes('mining');
        const byItem = importAgg.get(blockId) ?? new Map();
        importAgg.set(blockId, byItem);
        const cur = byItem.get(inp.id) ?? { rate: 0, raw };
        cur.rate += rate;
        byItem.set(inp.id, cur);

        // If the import is another block's export, record the feed edge.
        if (blockItems.has(inp.id) && !raw) {
          const feeds = feedAgg.get(inp.id) ?? new Map();
          feedAgg.set(inp.id, feeds);
          feeds.set(blockId, (feeds.get(blockId) ?? 0) + rate);
        }
      }
    }
  }

  // Export rate per block = external demand + total fed to other blocks.
  for (const block of blocks.values()) {
    const fed = feedAgg.get(block.item);
    let exportRate = demand.get(block.item) ?? 0;
    if (fed) for (const r of fed.values()) exportRate += r;
    block.exportRate = exportRate;
    block.feeds = fed ? [...fed].map(([b, rate]) => ({ block: b, rate })) : [];
    const imps = importAgg.get(block.item);
    block.imports = imps ? [...imps].map(([item, v]): BlockImport => ({ item, rate: v.rate, raw: v.raw })) : [];
    block.imports.sort((a, b) => b.rate - a.rate);
    block.feeds.sort((a, b) => b.rate - a.rate);
  }

  return {
    blocks: [...blocks.values()].sort((a, b) => b.exportRate - a.exportRate),
    commonalityIndex: commonalityIndex(plan, targets),
    totalMachines: plan.totalMachines,
    rawResources: plan.rawResources,
    totalPowerKW: plan.totalPowerKW,
    surpluses: plan.surpluses,
    errors: plan.errors,
  };
}

/**
 * Martin & Ishii commonality index over the target set:
 *   CI = 1 − uniqueIntermediates / Σ_t intermediatesPerTarget
 * 0 when nothing is shared (incl. a single target), → 1 with heavy sharing.
 */
export function commonalityIndex(plan: BalancedPlan, targets: PlannerTarget[]): number {
  const targetItems = targets.filter((t) => t.ratePerSecond > 0).map((t) => t.item);
  if (targetItems.length < 2) return 0;

  // Produced (non-raw) intermediates reachable from each target, excluding the target itself.
  const reachable = (root: string): Set<string> => {
    const out = new Set<string>();
    const stack = [root];
    const seen = new Set<string>([root]);
    while (stack.length) {
      const item = stack.pop()!;
      const sr = plan.producerOf.get(item);
      if (!sr) continue;
      for (const inp of sr.recipe.in) {
        const p = plan.producerOf.get(inp.id);
        if (p && !p.recipe.flags.includes('mining')) out.add(inp.id);
        if (!seen.has(inp.id)) { seen.add(inp.id); stack.push(inp.id); }
      }
    }
    return out;
  };

  const sets = targetItems.map(reachable);
  const counts = new Map<string, number>();
  let totalAcross = 0;
  for (const s of sets) {
    totalAcross += s.size;
    for (const item of s) counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  if (totalAcross === 0) return 0;
  const unique = [...counts.values()].filter((c) => c === 1).length;
  return 1 - unique / totalAcross;
}
