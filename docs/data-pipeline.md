# DSP Data Pipeline

The DSP Helper's game data is **derived from the [FactorioLab](https://github.com/factoriolab/factoriolab)
project**, which publishes a complete, current, machine-readable dataset for
Dyson Sphere Program.

## Attribution & license

FactorioLab is distributed under the **MIT License** (© Doug Broad and
contributors). We use its DSP dataset and icon sprite sheet, transformed into a
slimmer schema. The MIT license text and a NOTICE accompany the seed files in
`repositories/dsp-helper/main/scripts/`. If you redistribute this app, retain
that attribution.

## Sources pulled (DSP game v0.10.29.21950)

| File | Origin |
|------|--------|
| `scripts/factoriolab-dsp.json` | `factoriolab/public/data/dsp/data.json` |
| `scripts/factoriolab-defaults.json` | `factoriolab/public/data/dsp/defaults.json` |
| `public/icons.webp` | `factoriolab/public/data/dsp/icons.webp` (1472×1472, 64px tiles) |

Raw URL pattern: `https://raw.githubusercontent.com/factoriolab/factoriolab/main/public/data/dsp/<file>`

## Transform

`npm run transform-data` (`scripts/transform-data.ts`) reads the two seed JSON
files and emits the normalized dataset into `src/data/generated/`:

| Output | Contents |
|--------|----------|
| `items.json` | `{ id, name, category, row, stack }` for every item/building/tech |
| `recipes.json` | `{ id, name, time, in[], out[], producers[], flags[], cost? }` (in/out are `{id,amount}` arrays) |
| `machines.json` | producer buildings: `{ id, name, speed, usageKW, drainKW, modules, powerType }` |
| `technologies.json` | `{ id, name, prerequisites[], recipeUnlock[], cost{time,matrices[],hash}, row, upgrade }` |
| `proliferators.json` | effect modules: `{ id, name, tier, productivity, speed, consumption, sprays, mode }` |
| `belts.json` | `{ id, name, speed }` |
| `icons.json` | sprite-sheet coords `{ id, x, y, color }` |
| `meta.json` | version + calculator defaults (excluded recipes, machine ranks, proliferable recipe ids) |

### Key mapping decisions (FactorioLab → ours)

- FactorioLab stores `in`/`out` as `{ itemId: count }` maps; we convert to
  ordered `{ id, amount }[]` arrays for stable rendering.
- A building's stats live on the item's `machine` block in FactorioLab
  (`speed`, `usage`, `drain`, `modules`, `type`). We hoist items carrying a
  `machine` block into `machines.json`; `powerType` is `electric` when
  `type === 'electric'`, else `none` (self-powered: ray receiver, orbital
  collector, mining machine).
- Technologies are modeled twice in FactorioLab — as a `technology`-flagged
  recipe (the in-lab research consumption) and as a tech item (tree metadata).
  We merge them: tree fields from the item, `cost` from the matching recipe.
- `defaults.excludedRecipes` (advanced/duplicate variants) drives which recipe
  is treated as an item's *primary* recipe in the calculator.
- `limitations.productivity` becomes `meta.proliferableRecipes` — the recipes
  eligible for the extra-products proliferator mode.

## Refreshing for a new game version

1. Download the three source files (table above) over the existing seed files.
2. `npm run transform-data`
3. `npm test` (the solver tests assert known chains like iron ingot / matrices)
4. If the research tree uses a build-time layout, `npm run generate-tech-layout`
5. Spot-check the version string shown in the app header.

### Cross-checking against the live game

Two independent tools can validate the data after a patch:

- **[d0sboots/dyson_wiki.py](https://github.com/d0sboots/dyson-sphere-program)** —
  the canonical dumper that reads `ItemProtoSet.dat` / `RecipeProtoSet.dat` /
  `TechProtoSet.dat` (Apache-2.0).
- **[GreyHak/dsp-csv-gen](https://github.com/GreyHak/dsp-csv-gen)** — a BepInEx
  runtime mod that exports recipes/items/tech (and per-planet resources) to CSV.
