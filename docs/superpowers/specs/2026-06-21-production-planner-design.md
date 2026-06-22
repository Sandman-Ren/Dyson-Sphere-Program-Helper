# Production Planner — Design Spec

**Date:** 2026-06-21
**Status:** Approved (design); pending implementation plan
**App:** dsp-helper (DSP production calculator)

## 1. Problem & goal

Today's calculator is a **single-target, tree-based** solver (`src/calculator/solver.ts`):
it recurses from one target item into its ingredients, so a shared intermediate
(e.g. graphene) feeding several branches is **duplicated** in every branch with no
consolidation, no byproduct netting, and no survival of recipe loops.

The **Production Planner** is a new, complementary feature that helps a player plan a
factory producing **one or more** target items while **minimizing resource fragmentation
and duplication** and maximizing **modularity/organization**. Its thesis, validated by
research into manufacturing theory and DSP community practice: many DSP products share
common intermediates (graphene, magnetic coil, circuit board, processors…) that are best
**mass-produced once and distributed** to downstream consumers.

The Planner is an **architect/advisor**, not just an accountant: it consolidates the plan
*and* gives opinionated guidance on which intermediates to centralize into shared
production blocks.

### v1 scope (locked)

In scope:
- Multi-target input → one **consolidated** plan.
- **Byproduct-aware netting** (surplus offsets demand; leftovers warned).
- **Recipe loops** handled correctly (DSP refining/cracking).
- **Auto-suggested block grouping** with user promote/demote override.
- **Commonality score** headline.
- **Block cards + block-level dependency graph** output.

Out of scope for v1 (explicitly deferred):
- Belt / logistics-station **throughput sizing** (parallel belt counts, station counts,
  belt-stacking math). Throughput shown as raw items/s only. Deferred to a later pass.
- Full **LP optimization** that auto-selects among alternate recipes to minimize a cost.
  v1 uses a chosen-recipe-per-item balance solve (user picks alternates), not simplex.
- Spatial/blueprint layout.

## 2. Placement & relationship to existing app

- New top-level tab **"Planner"** in the `App.tsx` tab shell, alongside
  Calculator · Research Tree · Item Lookup. New `useHashTab` route `#planner`.
- The single-target **Calculator tab stays unchanged** — the tree view remains the right
  tool for "explain one item's chain". The Planner is the multi-target, consolidated,
  opinionated companion. The two engines coexist.
- The Planner **reuses**: the global `RecipeGraph`, the proliferator setting, the machine
  tiers, and the per-item machine/recipe override concept already modeled in
  `src/calculator/types.ts`.
- **Shared proliferator + machine-tier math:** the proliferator-effect and tier-selection
  helpers currently inside `solver.ts` are factored into a shared module so both the tree
  solver and the planner compute identical per-recipe machine/power/output numbers. This
  is a targeted refactor in service of the feature (no behavior change to the Calculator).

## 3. Engine — matrix balance solver

A new **pure** module under `src/calculator/planner/`, with **no React dependency**,
Vitest-covered, kept separate from `solver.ts`.

### 3.1 Recipe selection
- One **active recipe per produced item**: the graph's primary recipe by default,
  overridable per item (reusing the existing recipe-override mechanism). v1 does **not**
  auto-pick among alternates — the user chooses, matching today's UX.
- Raw/mined items (`graph.minedResources`, or items with no active recipe) are treated as
  **sources / free variables**.

### 3.2 The solve
- Build the **items × recipes net-production matrix** `A`: entry `A[i][j]` = net amount of
  item `i` produced per unit run of recipe `j` (**positive = output incl. byproducts,
  negative = input**).
- `x` = vector of recipe run-rates (→ machine counts after speed/time math).
- `b` = target demand vector (the user's `(item, rate)` targets).
- Solve `A · x = b` for `x` over the active recipe set, with raw items as free variables.
- **Byproduct netting:** because byproducts are positive entries in their item's row, a
  recipe's byproduct output automatically offsets that item's demand in the same row —
  the solver crafts less of it via its own recipe. Any **net surplus** that cannot be
  consumed is reported as a **warning** (item + surplus rate).
- **Loops** (e.g. hydrogen ⇄ refined oil via plasma refining / X-ray cracking) are solved
  simultaneously by the linear system — there is no recursion/traversal order to diverge.
- Method: **Gaussian elimination** over the determined chosen-recipe set (the Factory
  Planner model), with raw items as the free/source columns. The matrices are small
  (DSP has a few hundred recipes; an active plan touches far fewer), so exact elimination
  is fast and avoids an LP dependency.
- **Degenerate cases** to handle explicitly: an over-determined system (unconsumable
  byproduct) → allow surplus + warn; an unsatisfiable target (no recipe path) → surface a
  clear error on that target; a redundant/dependent recipe → ignore with a note.

### 3.3 Engine output (data, pre-grouping)
Per active recipe: consolidated `ratePerSecond`, `machinesNeeded` (fractional),
`powerKW`, `proliferated`. Plus plan totals: `totalMachines` (by machine id),
`rawResources` (by item), `totalPowerKW`, `proliferatorSpraysPerSecond`, and a per-item
**balance** record `{ demand, supplied, surplus }`.

## 4. Architect engine — block grouping

Layered on top of the solved rates (pure, in `src/calculator/planner/blocks.ts`).

### 4.1 Scoring
For each produced (non-raw) item in the active plan:
- **fan-out** = number of *active, distinct consumer recipes* that consume it.
- **throughput** = total items/s consumed across the plan.
- **score** ≈ `fan-out × throughput`, weighted toward higher-cost items (so a processor
  outranks a gear at equal fan-out). Exact weight tunable; default uses recipe depth /
  machine count as the cost proxy.

### 4.2 Block selection (auto-suggest + override)
- **Auto-flag as a shared block:** items with **fan-out ≥ 2** and a **meaningful rate**
  (threshold tunable; default tied to the plan's median throughput). Final targets are
  **always** their own block. Everything else stays **inline**.
- The user can **promote** any inline item to a shared block, or **demote** any suggested
  block back to inline. (The "auto-suggest, user overrides" decision.)

### 4.3 What a block is
A **block** = one **export** item (a final target or a promoted shared item). It
internally contains **every inline (non-block, non-raw) ancestor recipe**, walked back
until the next block boundary or a raw input. So a block is a **self-contained cell** that
**imports** shared intermediates + raws and **exports** exactly one item — the
Group-Technology cell / Factory-Planner-subfloor model.

Per block, compute:
- export item + export rate,
- internal machines (all internal recipes) + internal power,
- **imports**: shared-item + raw inputs crossing the block boundary, with rates,
- **feeds**: which other blocks consume this block's export, with per-consumer rates.

### 4.4 Commonality score
A headline **Martin & Ishii Commonality Index** (0–1) over the target set:
`CI = 1 − unique_intermediates / Σ intermediates_per_target`. Rendered as
"your N targets share X% of their intermediate components."

## 5. UI / output

New components under `src/web/components/planner/`, driven by a `usePlanner` hook
(mirrors `useCalculator`).

- **TargetList** — add/remove `(item, rate)` rows; reuse `ItemSelector` + `RateInput`.
- **Block cards** (`BlockCard`) — one per block: export rate, internal machine counts,
  power, **imports** list (shared + raw, with rates), **feeds** list (consumer blocks with
  per-consumer rates), and a **promote/demote** control. Suggested blocks are visually
  distinguished from inline-derived/target blocks.
- **Block dependency graph** (`BlockGraph`) — nodes = blocks, edges = shared-item flows;
  built on the existing `@xyflow/react` + `@dagrejs/dagre` stack already used by the
  tech tree.
- **Totals panel** (`PlannerTotals`) — buildings by type, raw resources, total power
  (reuse `Summary` patterns), the **commonality score**, and **surplus-byproduct
  warnings**.
- Throughput shown as raw items/s (belt/station sizing deferred).
- All display text via `useTranslation('ui')`; new keys added to `en/ui.ts` (source) and
  `zh/ui.ts` (typed for parity). Game names via `useNames()`.

### Block card sketch
```
┌─ Graphene  ▣ shared block ───────────────┐
│  72 /s   ·  4× Chemical Plant  ·  1.4 MW  │
│  imports:  Energetic Graphite 54/s,       │
│            Sulfuric Acid 36/s             │
│  feeds  →  Carbon Nanotube  48/s          │
│            Graphene (target)  24/s        │
│  [demote to inline]                       │
└───────────────────────────────────────────┘
```

## 6. File structure

```
src/calculator/planner/
  matrix.ts        # build A·x=b, Gaussian solve, free vars, byproduct netting, surplus
  blocks.ts        # fan-out scoring, block carving, commonality index
  types.ts         # PlannerInput, PlannerPlan, Block, ItemBalance
  index.ts         # public API
  matrix.test.ts   # loops, byproduct netting, consolidation
  blocks.test.ts   # scoring, block carving, commonality
src/calculator/
  proliferator.ts  # shared proliferator-effect + tier helpers (extracted from solver.ts)
src/web/components/planner/
  PlannerTab.tsx  TargetList.tsx  BlockCard.tsx  BlockGraph.tsx  PlannerTotals.tsx
src/web/hooks/usePlanner.ts
```

## 7. Testing & conventions

- Engine (`matrix.ts`, `blocks.ts`) stays **pure** — no imports from `src/web`.
- Vitest covers: shared-intermediate consolidation (one rate, not N), byproduct netting
  (surplus offsets demand; leftover warned), a refining **loop** terminating with correct
  rates, block carving (boundaries at blocks/raws), fan-out scoring, and the commonality
  index.
- Run `npx tsc -b` and `npm test` before done (project convention).
- Always-dark theme; semantic Tailwind classes only; lucide icons per-file; UI primitives
  from `src/web/ui/`.

## 8. Open/tunable parameters (defaults, revisable in implementation)

- Auto-flag threshold: **fan-out ≥ 2** AND rate ≥ plan-median throughput.
- Score cost-weight proxy: recipe depth × machine count (placeholder; refine in impl).
- Commonality index variant: unweighted Martin & Ishii for the headline; a cost-weighted
  variant may be added later.

## 9. Research basis

Design grounded in a research dossier (manufacturing theory + DSP community practice +
existing-calculator algorithms). Key load-bearing findings:
- **Matrix/LP over tree** is non-negotiable for shared-intermediate consolidation,
  byproduct netting, and loops (FactorioLab, Factory Planner, Helmod, KirkMcDonald all do
  this). v1 uses Gaussian elimination over a chosen recipe set (Factory Planner model).
- **Group Technology + Commonality Index** give the grouping algorithm and its scoring;
  fan-out is the centralize signal. No existing tool auto-suggests grouping — this is the
  novel contribution.
- **Decoupling-point / hub-and-spoke** theory → centralize high-fan-out/pre-divergence
  items, inline single-consumer/late items.
- DSP throughput ceilings (belt 1,800/min, 7,200 stacked; station ~3,600/min) inform the
  deferred throughput-sizing pass.
