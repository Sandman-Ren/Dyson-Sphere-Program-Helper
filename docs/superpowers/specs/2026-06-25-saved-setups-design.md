# Saved Production Setups — Design Spec

**Date:** 2026-06-25
**Status:** Approved (design); pending implementation plan
**App:** dsp-helper (DSP production calculator)

## 1. Problem & goal

Players configure a Calculator state — target items/rates, proliferator, machine
overrides, recipe choices — but the moment they switch to a different production
plan, that configuration is lost. There is no way to keep several plans around
and flip between them, nor to share a plan with someone else.

Goal: **let the user save the current Calculator configuration under a name,
switch between saved setups quickly, and share a setup via a URL.** Saved setups
persist across reloads in `localStorage`, matching the existing machine-tiers
persistence pattern.

## 2. Scope

In scope:
- **Named setups** — save the current working state under a name; load, rename,
  delete; an unbounded list persisted to `localStorage`.
- **What a setup captures** (full reproducible calculation): the target list
  (`item`, `amount`, `unit`), `displayUnit`, `proliferatorId`,
  `machineOverrides` (per-item), and `recipeOverridesByTarget` (per-target,
  stored positionally).
- **Active setup + dirty tracking** — loading a setup makes it active; editing
  the working state marks it modified (a `•` on the name). **Save** overwrites
  the active setup; **Save As…** forks a new named setup.
- **URL sharing** — a **Share** action encodes the current working state into a
  URL (`?s=…`); opening such a URL loads it into the Calculator as an unsaved
  setup (then offered to Save As).
- **Auto-restore** — on startup, the last active setup (if any) is loaded into
  the working state.

Out of scope / explicitly NOT captured:
- **Machine tiers** (`dsp-machine-tiers`) stay **global** — they are a player
  preference, not part of a per-plan setup. Unchanged.
- No server sync, no accounts, no setup folders/tags, no import of a file
  (URL share covers the sharing need). No setup-count cap in v1.

## 3. Data model

### 3.1 Snapshot — the serializable unit

```ts
type TimeUnit = 'second' | 'minute' | 'hour';

interface SetupSnapshot {
  v: 1;                                       // schema version
  targets: { item: string; amount: number; unit: TimeUnit }[];
  displayUnit: TimeUnit;
  proliferatorId: string;
  machineOverrides: Record<string, string>;   // itemId → machineId
  recipeOverrides: RecipeOverrides[];          // index-aligned to targets[]
}
```

Key decision — **positional recipe overrides.** `recipeOverridesByTarget` is
keyed by ephemeral target ids (`t0`, `t1`, … from a module counter). Storing the
overrides as an array aligned to `targets[]` (index `i` → overrides for
`targets[i]`) makes a snapshot **id-independent**: on load we mint fresh ids and
rebuild the keyed map, avoiding any id-collision with the live counter.

`targets` keeps **all** rows including empty/placeholder ones so a saved setup
round-trips to exactly what the user sees (a single empty row is the default
state). Sanitization (§6) only runs on *untrusted* input (decoded URLs / corrupt
storage), not on internally-produced snapshots.

### 3.2 Stored container — one `localStorage` key `dsp-setups`

```ts
interface StoredSetups {
  v: 1;
  setups: { id: string; name: string; snapshot: SetupSnapshot }[];
  activeId: string | null;
}
```

Setup `id`s are stable, unique, app-generated (e.g. `s${counter}` seeded past any
existing ids on load, or a short random id). `activeId` points at the loaded
setup, or `null` when the working state is unsaved (fresh, or a freshly-imported
share). Read/write wrapped in try/catch → fall back to `{ v:1, setups:[],
activeId:null }`, mirroring `loadMachineTiers`.

## 4. Architecture

Two clean layers, splitting pure logic (testable) from React state.

### 4.1 `src/web/lib/setups.ts` — pure, Vitest-covered

No React, no DOM beyond `localStorage`/`btoa` (guarded). Responsibilities:
- `loadStoredSetups(): StoredSetups` / `saveStoredSetups(s): void` — localStorage
  CRUD with try/catch fallback.
- `encodeSetupUrl(snapshot): string` / `decodeSetupUrl(raw): SetupSnapshot |
  null` — share encoding. v1 uses **base64url(JSON)** (Unicode-safe via
  `encodeURIComponent`/`escape` or `TextEncoder`); no new dependency. Decode
  validates the `v` field and shape, returns `null` on any failure.
- `sanitizeSnapshot(input, { isValidItem, isValidMachine, isValidProliferator }):
  SetupSnapshot` — coerce untrusted input into a valid snapshot (§6).
- `canonicalSnapshotKey(snapshot): string` — stable, key-sorted JSON used for
  **dirty detection** and round-trip equality (so `machineOverrides` key order
  can't cause false "modified").

Validity predicates are injected (the module stays free of `src/web/data.js`
imports, keeping it pure and unit-testable with fixtures).

### 4.2 `useCalculator.ts` — snapshot bridge

Add two methods to the existing hook (it owns the working state):
- `getSnapshot(): SetupSnapshot` — serialize current `targets` (positional
  `recipeOverrides` rebuilt from `recipeOverridesByTarget`), `displayUnit`,
  `proliferatorId`, `machineOverrides`.
- `applySnapshot(snapshot: SetupSnapshot): void` — replace working state: mint
  fresh target ids, set targets/displayUnit/proliferator/machineOverrides, and
  rebuild `recipeOverridesByTarget` from the positional array against the new ids.

`machineTiers` is untouched by both (stays global).

### 4.3 `src/web/hooks/useSetups.ts` — setups manager

`useSetups({ getSnapshot, applySnapshot, isValidItem, … })` returns:
```ts
interface SetupsState {
  setups: { id: string; name: string }[];   // list for the picker (no snapshot)
  activeId: string | null;
  activeName: string | null;
  isDirty: boolean;                          // active && current ≠ active snapshot
  load(id: string): void;                    // applySnapshot + set active, clear dirty
  save(): void;                              // overwrite active with getSnapshot()
  saveAs(name: string): void;                // new id, becomes active
  rename(id: string, name: string): void;
  remove(id: string): void;                  // if active → activeId=null (now unsaved)
  shareUrl(): string;                        // encodeSetupUrl(getSnapshot())
}
```
- **Dirty** = `activeId != null && canonicalSnapshotKey(getSnapshot()) !==
  canonicalSnapshotKey(activeSnapshot)`, recomputed (memo) from the live
  calculator state each render.
- Every mutation persists the whole `StoredSetups` to `localStorage`.

### 4.4 Startup & URL import (in `App.tsx`)

On mount, in order:
1. If `location.search` has `?s=…` → `decodeSetupUrl` → `sanitizeSnapshot` →
   `applySnapshot`; leave `activeId = null` (unsaved import); strip the param via
   `history.replaceState` so a refresh doesn't re-import. Independent of the hash
   router (`useHashTab` reads `location.hash`), so no conflict.
2. Else if `StoredSetups.activeId` is set → `load(activeId)` (auto-restore).

## 5. UI — `SetupBar` above the Targets section

`src/web/components/SetupBar.tsx`, rendered at the top of `CalculatorTab`, above
the existing `Targets` `Section`. A compact, wrap-friendly row:

- **Setup picker** — a `Select` listing saved setups by name; the active one is
  shown with a trailing `•` when dirty. Choosing a setup calls `load(id)`. (When
  dirty, loading a *different* setup discards unsaved edits — acceptable in v1;
  Save / Save As are right there. No confirm dialog in v1.)
- **Save** — `Button`, enabled only when `isDirty && activeId`. Overwrites active.
- **Save As…** — opens a name-input **Dialog**; on confirm `saveAs(name)`. If the
  name matches an existing setup, the dialog confirms overwrite (reuse that id).
- **Rename** — in the same Dialog (prefilled) or a small menu action; `rename`.
- **Delete** — `Button`/menu action; confirms, then `remove(activeId)`.
- **Share** — `Button`; copies `shareUrl()` to the clipboard
  (`navigator.clipboard.writeText`) and shows transient inline "Copied" feedback.

Empty state (no setups, nothing active): the bar shows just **Save As…** (and
Share), so the first save is one click.

**New UI primitive:** add a minimal themed **Dialog** to `src/web/ui/index.tsx`
built on `radix-ui`'s `Dialog` namespace (already available via the unified
`radix-ui@1.4.3` package; same pattern as the existing `Select`/`Tabs`
wrappers) — overlay + content + title, no hardcoded colors. Used for Save As /
Rename and the Delete confirm.

## 6. Sanitization & error handling

`sanitizeSnapshot` (applied to decoded URLs and corrupt-storage reads only):
- Drop `targets` whose `item` is not a known product; clamp `amount` to `≥ 0`;
  coerce `unit`/`displayUnit` to one of `second|minute|hour` (default `minute`).
- Drop `machineOverrides` entries with unknown item or machine id.
- `proliferatorId` must be a known proliferator else `'none'`.
- `recipeOverrides` array is truncated/padded to `targets.length`; entries are
  plain `Record<string,string>` (unknown values are harmless — they key by tree
  path and are simply ignored by the solver if they don't match).
- An entirely empty/invalid result yields the default `[{ empty target }]` state.

Other failure modes: corrupt `localStorage` → empty container; `decodeSetupUrl`
failure → `null` (import skipped, working state untouched); clipboard write
rejection → swallow, no crash.

## 7. Files

**Add:**
- `src/web/lib/setups.ts` (+ `setups.test.ts`) — §4.1.
- `src/web/hooks/useSetups.ts` — §4.3.
- `src/web/components/SetupBar.tsx` — §5.

**Modify:**
- `src/web/hooks/useCalculator.ts` — add `getSnapshot()` / `applySnapshot()`
  (§4.2). No change to existing behavior.
- `src/web/ui/index.tsx` — add the `Dialog` primitive (§5).
- `src/web/App.tsx` — render `SetupBar` in `CalculatorTab`; wire `useSetups`;
  startup URL-import / auto-restore effect (§4.4).
- `src/web/i18n/locales/en/ui.ts` + `zh/ui.ts` — add a `setups.*` key group
  (save, saveAs, rename, delete, share, copied, namePlaceholder, untitled,
  deleteConfirm, …). en is source of truth; zh typed `: UiResource` for parity.

## 8. Testing & conventions

- `setups.ts` is **pure** (no `src/web/data.js` import; predicates injected) and
  Vitest-covered (node env, no jsdom — so logic only):
  - snapshot **round-trip**: `decodeSetupUrl(encodeSetupUrl(s))` deep-equals `s`;
  - positional recipe-overrides survive an `applySnapshot`/`getSnapshot` round
    trip (verified at the snapshot level — the React hook itself is browser-
    verified, per the project's node-env test gate);
  - `sanitizeSnapshot` drops invalid targets/overrides and defaults bad units /
    proliferator;
  - `canonicalSnapshotKey` is order-insensitive for `machineOverrides`
    (dirty-detection guard).
- React hooks/components (`useCalculator` bridge, `useSetups`, `SetupBar`) are
  verified by `tsc` + **manual browser**, per the project's test gate (no
  `@testing-library`).
- `.js` import extensions; always-dark theme (no `dark:`, no hardcoded colors);
  lucide per-icon imports; UI primitives over raw controls; i18n via `t()`
  (`useTranslation('ui')`), game names via `useNames()`.
- `npx tsc -b` and `npm test` green; browser-verify: save → reload (auto-restore)
  → edit (dirty `•`) → Save / Save As → switch setups → delete → Share (copy URL,
  open in fresh tab, imports as unsaved).

## 9. Open/tunable parameters

- Share encoding is base64url(JSON) in v1; compact keys / LZ compression are a
  later optimization if URLs get unwieldy (noted, not built).
- Loading a different setup while dirty discards edits without a confirm dialog
  in v1 (Save/Save As are adjacent). Could add a confirm later.
- No setup-count limit; if storage quota becomes a concern, add a soft cap later.
