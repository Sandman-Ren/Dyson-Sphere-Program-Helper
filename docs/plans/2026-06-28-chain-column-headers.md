# Production-chain column headers + fixed-column row layout

**Date:** 2026-06-28
**Branch:** `feat/chain-row-ratio` (continues the per-row ratio work)
**Status:** Proposed (revised after adversarial review) — awaiting approval

## Problem

The per-row ratio (added previously) renders as a bare muted number left of the
production rate. It's undiscoverable: a user sees `1 / 2 / 2` with no cue that it
means "quantity relative to the target output". The fix is an **aligned column
header row** ("Ratio", "Rate") above the chain.

A header only works if each labelled column lands at the **same x-position on
every row**. Today it doesn't, because two elements right of the rate are
conditional and shift the columns:

- **Pin button** — absent on unpinnable rows (target item, proliferators),
  present elsewhere (`ProductionChain.tsx:118`).
- **Recipe selector** — only rendered when an item has >1 recipe (`:138`).

So the right side must become **fixed-width columns**, with reserved slots for
the conditional pin and recipe selector.

## Decisions (locked)

- **Ratio basis / format / root** — unchanged: `node.ratePerSecond /
  root.ratePerSecond`, plain number, root shows `1`.
- **Recipe selector** — **reserve a fixed-width slot** on every (desktop) row,
  empty when the item has a single recipe. Accepted trade-off: blank space on
  single-recipe rows.
- **Header scope** — label **Ratio** and **Rate** only.

## Why flex, not CSS grid/subgrid

A shared CSS-grid `subgrid` template would make column alignment a browser
invariant instead of a hand-maintained convention — genuinely more robust. But
the rows are a recursive tree that **wraps to a stacked layout on mobile**
(`flex-wrap`, controls go `w-full`), which flex gives for free; grid would force
us to re-author that responsive reflow (explicit track/area changes per
breakpoint). For a 2-column header the flex approach is sufficient **provided the
fragility points the review found are fixed**, so we keep flex and lean on shared
width constants for discipline. (If we later add several more numeric columns,
revisit grid+subgrid.)

## Target layout (desktop, `md:` and up)

```
                         Ratio      Rate
▾ Processor                  1    60/min                 [Assembling Mach… ▾] ×4
  ▸ Circuit Board            2   120/min  [Circuit Bd ▾] [Assembling Mach… ▾] ×2
  ▸ Microcrystalline Comp.   2   120/min                 [Assembling Mach… ▾] ×6
```

Column order, left → right, every row structurally identical (6 flex children,
5 `gap-x-2` gaps):

| # | Column   | Width                       | Notes |
|---|----------|-----------------------------|-------|
| 1 | Name     | `min-w-0 flex-1`            | chevron + icon + name + shared badge + sparkle, in ONE nested flex child; absorbs slack; truncates; carries depth indent |
| 2 | Ratio    | `w-14 shrink-0 text-right`  | muted; header labels this; **always rendered** (empty string if null) |
| 3 | Rate     | `w-24 shrink-0 text-right`  | primary; header labels this |
| 4 | Pin      | `w-7 shrink-0`              | button when pinnable, else `invisible` placeholder (kept at all sizes — narrow, harmless) |
| 5 | Recipe   | desktop `md:w-44 shrink-0`  | `<Select>` when >1 recipe; else **`hidden md:block`** placeholder (NOT rendered on mobile, to avoid a blank `w-full` line) |
| 6 | Machine  | `w-full md:w-56 shrink-0`   | selector + `×N`, **or** the mined/raw label — both branches get this width |

Because **Name** is the only flexible child and items 2–6 are `shrink-0`
fixed-width, they right-anchor at constant x on every row. The header, built from
the *same* widths, same `gap-x-2`, same child count, and same `pr-2`, aligns over
them.

> Widths are starting points; tuned in implementation so realistic maxima
> (4-digit ratio, `1,234/min`) don't clip. `tabular-nums` on numeric cells.

## Review fixes folded in (from adversarial review, 2026-06-28)

1. **Header breakpoint is `md:` not `sm:`.** Reserved fixed columns + gaps sum to
   ~620px before the name; at 640px rows would wrap under the header. `md:`
   (768px) leaves the name ~80px+ of room on one line. Header = `hidden md:flex`.
2. **Every fixed column gets `shrink-0`** (not just `sm:shrink-0`) — flex's
   default `shrink:1` would otherwise compress the "fixed" columns under pressure
   and break alignment silently. Ratio/Rate are `shrink-0` at all sizes.
3. **Header right-edge parity:** header container uses the same `pr-2` and
   `gap-x-2` as rows, and mirrors all 5 right slots (Ratio, Rate, pin-spacer,
   recipe-spacer, machine-spacer) so cumulative gaps/x-positions match.
4. **Ratio cell always rendered.** When `ratioValue === null` (degenerate zero
   root rate) the cell still renders (empty content) so the column count — and
   thus every downstream column's x — never shifts.
5. **Mined/raw else-branch gets `COL.machine` width.** Today it's a content-sized
   `<span>` (`:211`); without the fixed width, the machine column would be
   narrower on raw rows. Apply the same width to both branches.
6. **Empty recipe placeholder is desktop-only** (`hidden md:block md:w-44`), so a
   single-recipe row doesn't get a blank full-width line on mobile.

## Implementation

Contained to the chain renderer + locale files. **No calculator-engine change**
(ratio stays a render-time division), so Vitest is unaffected.

### 1. `src/web/components/ProductionChain.tsx`

- **Shared column-width constants** at module scope (the DRY anchor for header +
  rows), e.g.:

  ```ts
  // Fixed right-hand columns — shared by the header and every node row so the
  // columns line up under their labels. Name is the only flexible track.
  const COL = {
    ratio:   'w-14 shrink-0 text-right',
    rate:    'w-24 shrink-0 text-right',
    pin:     'w-7 shrink-0',
    recipe:  'shrink-0 w-full md:w-44',
    machine: 'shrink-0 w-full md:w-56',
  } as const;
  ```

- **Restructure `ChainNode`'s row** to exactly 6 flex children:
  - Wrap chevron + icon + name + shared badge + sparkle in ONE `min-w-0 flex-1
    flex items-center gap-x-2` group (so the row's top level has a single
    flexible child). Depth indent stays here / on the row's `pl-[calc(...)]`,
    inside the flexible region so it never pushes the right columns.
  - **Ratio** (`COL.ratio`): drop `ml-auto`; always render the cell, content =
    `ratioValue !== null ? num(ratioValue) : ''`. Keep `tabular-nums
    text-muted-foreground` + the `title={t('chain.ratioTitle')}` tooltip.
  - **Rate** (`COL.rate`): `tabular-nums font-medium text-primary`.
  - **Pin** (`COL.pin`): button when pinnable; otherwise an `invisible`
    (or `aria-hidden` empty) placeholder of the same width.
  - **Recipe** (`COL.recipe`): `<Select>` when `recipes.length > 1`; otherwise a
    `hidden md:block md:w-44` placeholder.
  - **Machine** (`COL.machine`): existing selector+`×N` div and the mined/raw
    `<span>` else-branch BOTH carry the width.
  - Row stays `flex flex-wrap` so mobile wraps as today.

- **Header row** in the `ProductionChain` wrapper (non-recursive), above the root
  `ChainNode`, `hidden md:flex items-center gap-x-2 pr-2 pl-2`, children:
  `flex-1` spacer + `Ratio` (`COL.ratio`) + `Rate` (`COL.rate`) + `COL.pin`
  spacer + `COL.recipe` spacer + `COL.machine` spacer. Labels styled like
  `Summary`'s `Stat` caption (`text-xs font-semibold uppercase tracking-wide
  text-muted-foreground`); subtle `border-b border-border pb-1 mb-1`.

### 2. i18n — `src/web/i18n/locales/{en,zh}/ui.ts`

Add under `chain`: `colRatio` (`'Ratio'` / `'比例'`), `colRate` (`'Rate'` /
`'速率'`). zh is typed `: UiResource`, so parity is compile-enforced.

### 3. `src/web/App.tsx`

No change — the header lives inside `ProductionChain`; `TargetChain` keeps
passing `node={plan.root}`.

## Responsive / mobile behavior

- Header is **desktop-only** (`hidden md:flex`); below md the row wraps and fixed
  columns relax to the existing stacked layout (controls `w-full`).
- Ratio/Rate cells are fixed-width at all sizes (small values, fine on mobile).
- **Known gap:** on mobile the ratio is still a bare number explained only by its
  `title` tooltip. Out of scope; possible follow-up = a mobile-only inline label.
  Flagged, not silently dropped.

## Verification

- `npx tsc -b` clean (zh parity enforced).
- `npm test` — 84 tests still pass (no engine change).
- Manual (`npm run dev`), checking the review's failure modes explicitly:
  - Chain mixing single- and multi-recipe items → Ratio/Rate stay aligned; header
    sits over them.
  - Target row (no pin) vs children (pin) → aligned.
  - Mined/raw rows → machine column header aligns over them too.
  - Deep nesting → indent only in Name; right columns hold.
  - Resize across the `md` breakpoint → no overflow band; header appears only when
    rows are single-line; no blank recipe line on mobile.
  - Large values (4-digit ratio, `1,234/min`) → no clipping.

## Risks

- **Alignment-by-discipline:** correctness depends on header and rows sharing
  `COL`, `gap-x-2`, `pr-2`, and child count. Mitigated by the shared `COL`
  constants and a structurally-mirrored header; documented for future editors.
- **Reserved empty recipe slot** leaves blank space on single-recipe desktop rows
  (accepted).
- **Width tuning** must fit realistic maxima without clipping while staying
  compact.
