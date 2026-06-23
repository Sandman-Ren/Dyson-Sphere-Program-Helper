# Multi-Target Calculator + Shared Components — Design Spec

**Date:** 2026-06-22
**Status:** Approved (design); pending implementation plan
**App:** dsp-helper (DSP production calculator)
**Supersedes:** `2026-06-21-production-planner-design.md` (architect model, shipped) and
`2026-06-22-production-planner-worksheet-design.md` (worksheet model, not built). Both are
replaced by this simpler approach. The separate **Planner tab is retired** and its engine
(block grouping, matrix/byproduct netting, dependency graph) is **removed**.

## 1. Problem & goal

Players often plan **several products at once** that share intermediates. The current
single-target Calculator can't express that, and the shipped architect-Planner buried the
useful signal under blocks/graphs/scores.

Goal — the minimal, useful thing: **let the Calculator take multiple targets, and surface
the components shared across them**, ordered from the highest-level/most-complex components
down toward raw materials, with their combined production rates.

> Keep the Calculator's current behavior. Add (1) multiple production targets, and (2) a
> "Shared Components" dependency tree highlighting components used by ≥2 targets with their
> combined rates, ordered most-complex → raw. With a single target, the Calculator is
> unchanged.

## 2. Scope

In scope:
- **Multiple targets** in the Calculator: a list of `(item, rate)` rows, one shared
  time-unit. One row = today's exact experience.
- **Per-target production chains** — the existing `ProductionChain` tree, one per target,
  with its per-node recipe/machine overrides (now scoped per target).
- **Combined Summary** — total buildings / raw resources / power / proliferator across all
  targets.
- **Shared-components dependency tree** — crafted items produced by ≥2 targets, nested by
  dependency, ordered by production depth (complex → raw), with combined rates and `×N`.
- **Shared highlighting + click-to-trace** in the per-target chains.

Out of scope / **removed**:
- The separate **Planner tab** and everything under `src/web/components/planner/`.
- The planner engine: `src/calculator/planner/` (`matrix.ts`, `blocks.ts`, `types.ts`,
  tests) — block grouping, commonality, byproduct netting, the matrix/LP solve, the block
  dependency graph.
- **No byproduct netting** — the Calculator's existing tree math is kept as-is (gross).

## 3. Input

The Calculator's single `ItemSelector` becomes a **target list**:
- Rows, each: `item` (`ItemSelector`, producible items only) + `amount` (positive number).
- An **"Add target"** control; each row has a remove control. Empty list → today's empty
  state prompt.
- **One shared time-unit** selector (`'second' | 'minute' | 'hour'`) applied to every row's
  rate and all displayed rates — matching today's behavior (no per-row units in v1).
- **Proliferator** select and **Machine defaults** stay global, as today.
- The Item-Lookup / Tech-tree "Calculate this item" deep-link sets the target list to that
  single item (preserves today's feel).

## 4. Per-target output (current behavior preserved)

- **Combined Summary** (top): `totalMachines`, `rawResources`, `totalPowerKW`,
  `proliferatorSpraysPerSecond` summed across all target plans. The minimum-integer-ratio
  multiplier is computed across the **combined** machine counts; "Apply" scales **every**
  target's amount by the multiplier. With one target this equals today's Summary exactly.
- **Per-target chain sections** — for each target: a header (`ItemIcon` + name + rate) and
  the existing collapsible `ProductionChain` (per-node machine/recipe overrides intact).
  With one target, this is today's single chain — the per-target header is hidden so the
  view reads identically to today (see §8 note).
- **Shared highlighting** — crafted nodes whose item is shared (≥2 targets) render with an
  accent + `×N` badge; clicking one (in a chain or the shared tree) sets a worksheet-level
  `focusedItem` that glows all its occurrences across every chain and the shared tree.

## 5. Shared-components dependency tree (the new feature)

Pure module `src/calculator/shared-components.ts`, operating on the per-target
`ProductionPlan[]` (no React).

### 5.1 Identify shared items
- Walk each target plan's tree. A node is **crafted** when `node.recipe !== null &&
  !node.mined`. For each target, collect the set of crafted item ids it produces and the
  per-target rate of each item (sum of `ratePerSecond` over that item's occurrences within
  the target).
- `targetCount(item)` = number of distinct targets that produce it. **Shared** =
  `targetCount ≥ 2`.
- `combinedRatePerSecond(item)` = sum of the item's `ratePerSecond` over **all** occurrences
  across **all** target trees.

### 5.2 Build the nested tree (shared items only)
- For each shared item `S`, compute its **nearest shared descendants**: walk `S`'s
  subtree(s) across every target where `S` occurs; for each descendant, the first shared
  item reached on a path down from `S` (not passing through another shared item) is a direct
  child. Union across occurrences; dedupe child ids.
- **Roots** = shared items that are not a nearest-shared-descendant of any other shared item.
- **Depth** of an item = longest path from any of its nodes down to a raw/leaf
  (`depth(leaf)=0`, else `1 + max(child depth)`), taken as the max across its occurrences.
- **Order** roots and each node's children by **depth descending** (most-complex first),
  tie-broken by `combinedRatePerSecond` descending, then item id.
- **Dedup**: render each shared item's full subtree once (first placement in the ordered
  walk); subsequent appearances are **reference nodes** (`reference: true`, no children,
  labeled "shown above").

### 5.3 Output
```
SharedComponentNode {
  item: string;
  combinedRatePerSecond: number;
  targetCount: number;          // ×N
  children: SharedComponentNode[];
  reference: boolean;           // true → dedup reference, children omitted
}
SharedComponentsResult {
  roots: SharedComponentNode[];        // ordered most-complex → raw
  sharedItemIds: Set<string>;          // for O(1) highlight lookup in chains
}
buildSharedComponents(plans: ProductionPlan[]): SharedComponentsResult
```
With 0 or 1 targets, `roots` is empty and `sharedItemIds` is empty (the shared tree is
hidden).

## 6. Engine reuse & files

**Reuse:** `solver.ts` `solve()` (per target — unchanged math), `recipe-runtime.ts`
(solver depends on it — keep), `ProductionChain.tsx`, `Summary.tsx` (adapted), `ItemIcon`,
`ItemSelector`, `MachineDefaults`, `format.ts`, `useNames`, UI primitives.

**Add:**
- `src/calculator/shared-components.ts` (+ `shared-components.test.ts`) — §5.
- `src/web/components/SharedComponents.tsx` — renders the shared dependency tree
  (collapsible nodes, `ItemIcon` + name + combined rate + `×N`, reference nodes, click-to-
  trace).

**Modify:**
- `src/web/hooks/useCalculator.ts` — `targetItem` → `targets: { id, item, amount }[]`
  (add/remove/setItem/setAmount); per-target `recipeOverrides` keyed `targetId → (path →
  recipeId)`; output `plans: ProductionPlan[]`, combined totals, and the
  `SharedComponentsResult`; `focusedItem` state. One-target path reproduces today's values.
- `src/web/App.tsx` — remove the Planner tab (trigger + content + lazy import); the
  Calculator tab renders the target list, combined Summary, shared-components tree, and
  per-target chains.
- `src/web/hooks/useHashTab.ts` — drop `'planner'` from `VALID`.
- `src/web/components/Summary.tsx` — accept combined totals (the four roll-up fields +
  integer multiplier) rather than a single `ProductionPlan`; single-target passes its plan's
  totals.
- `src/web/components/ProductionChain.tsx` — additive, defaulted-inert props
  `sharedItemIds?: Set<string>`, `focusedItem?: string | null`, `onFocusItem?(item)` for
  badge/accent/glow. No behavior change when omitted.
- i18n `en/ui.ts` + `zh/ui.ts` — remove `planner.*` keys; add `calculator.*` keys for
  add/remove target, shared-components heading, `×N` label, etc. (key parity enforced).

**Remove:**
- `src/calculator/planner/` (matrix.ts, blocks.ts, types.ts, index.ts, *.test.ts).
- `src/web/components/planner/` (BlockCard, BlockGraph, PlannerTotals, PlannerTab).
- `src/web/hooks/usePlanner.ts` (+ test if present).
- `@dagrejs/dagre` stays installed (still used by `scripts/generate-tech-layout.ts`).

## 7. State (`useCalculator.ts`)

- `targets: { id: string; item: string; amount: number }[]` + `addTarget`, `removeTarget`,
  `setTargetItem`, `setTargetAmount`. A single helper sets the list to one item (deep-link).
- `timeUnit` (shared), `proliferatorId`, `machineTiers` (+ shared `dsp-machine-tiers` key),
  `machineOverrides` (global per item, as today), per-target `recipeOverrides`.
- `focusedItem: string | null`, `setFocusedItem`.
- Derived (memoized): `plans: ProductionPlan[]` (one `solve()` per valid target),
  `combined` totals + integer multiplier, `shared: SharedComponentsResult`.

## 8. Testing & conventions

- `shared-components.ts` pure (no `src/web` imports), Vitest-covered: shared detection
  (≥2 targets, raws excluded via `recipe && !mined`); combined-rate summation incl.
  multiple occurrences within one target; nesting under nearest shared ancestor; depth
  ordering (complex → raw); dedup reference nodes; empty result for 0/1 targets.
- Single-target **parity**: the combined totals for a one-target list equal the current
  `solve()` plan's totals (guard the refactor).
- `.js` import extensions; always-dark theme (no `dark:`, no hardcoded colors); lucide
  per-icon imports; UI primitives; i18n via `t()` (en source of truth, zh parity); names via
  `useNames()`.
- `npx tsc -b` and `npm test` green; browser-verify single- and multi-target.
- **Note (one-target chrome):** with a single target, avoid adding visible multi-target
  chrome that changes today's look — the target list with one row, no shared tree, and the
  combined Summary should read identically to today. A per-target section header may be
  hidden when there is only one target.

## 9. Open/tunable parameters

- "Shared" threshold fixed at **≥2 targets** (crafted-only already excludes raw-ore noise).
- Display/time unit: one shared selector (no per-row units in v1; could add later).
- Complexity order = production depth (longest path to raw), desc; ties by combined rate.
