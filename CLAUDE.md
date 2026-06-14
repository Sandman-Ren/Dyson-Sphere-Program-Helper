# dsp-helper

A web-based **production calculator, research tree, and item reference** for
[Dyson Sphere Program](https://store.steampowered.com/app/1366540/Dyson_Sphere_Program/) (DSP).
Pick a target item and rate; get the full production chain with buildings, raw
veins, power draw, and optional proliferator effects. Browse the research tree
and look up what any item is produced by / used in.

## Tech stack

- **React 19** + **TypeScript 5.6**, bundled with **Vite 6**
- **Tailwind CSS v4** (`@tailwindcss/vite`) with an always-dark theme
- **radix-ui** primitives wrapped in a small local UI kit (`src/web/ui/`)
- **@xyflow/react** + **@dagrejs/dagre** for the research-tree graph
- **lucide-react** icons (imported per-icon: `lucide-react/dist/esm/icons/<name>`)
- **Vitest** for tests
- Package manager: **npm**

## Commands

```bash
npm install            # install dependencies
npm run dev            # dev server at http://localhost:5173/dsp-helper/
npm run build          # tsc -b && vite build → ../../dist
npm run preview        # preview the production build
npm run transform-data # regenerate src/data/generated/* from the seed dataset
npm test               # run Vitest
```

## Architecture

Three decoupled layers — the calculator is pure and game-data-driven, with no
React dependency, so it is unit-testable in isolation.

```
src/
├── calculator/                # pure production-chain engine (no React)
│   ├── recipe-graph.ts         # build lookup maps from recipes + machines
│   ├── solver.ts               # recursive chain solver + proliferator math + integer ratios
│   ├── types.ts                # ProductionNode / ProductionPlan
│   ├── index.ts                # public API
│   └── solver.test.ts          # Vitest coverage of the engine
├── data/
│   ├── schema.ts               # the normalized data contract (Item, Recipe, Machine, …)
│   └── generated/*.json        # produced by scripts/transform-data.ts (committed)
└── web/                        # React UI
    ├── App.tsx                 # tab shell (Calculator · Research Tree · Item Lookup)
    ├── data.ts                 # loads generated JSON, builds the graph, lookup helpers
    ├── ui/index.tsx            # theme-aware primitives (Button, Select, Tabs, Tooltip, …)
    ├── components/
    │   ├── ItemIcon.tsx        # sprite-sheet icon renderer (public/icons.webp)
    │   ├── ItemSelector.tsx    # searchable item picker
    │   ├── ProductionChain.tsx # expandable chain tree with per-node machine overrides
    │   ├── Summary.tsx         # building / raw-resource / power rollups
    │   ├── tech-tree/          # research-tree graph (React Flow + dagre)
    │   └── item-lookup/        # produced-by / used-in / unlocked-by browser
    ├── hooks/
    │   ├── useCalculator.ts    # calculator state → solve()
    │   └── useHashTab.ts       # URL-hash tab router (#calculator, #item-lookup/<id>)
    └── lib/                    # cn() + number/rate/power formatting
```

### Data flow

```
scripts/factoriolab-dsp.json (seed)  ──transform-data.ts──▶  src/data/generated/*.json
                                                                      │
                                              src/web/data.ts loads + buildRecipeGraph()
                                                                      │
                            useCalculator() ──▶ solve(graph, item, rate, overrides, proliferator)
                                                                      │
                                       ProductionChain + Summary render the ProductionPlan
```

## Game data

The dataset is transformed from the **MIT-licensed [FactorioLab](https://github.com/factoriolab/factoriolab)
DSP data** (`public/data/dsp/data.json`, game v0.10.29). See
[`docs/data-pipeline.md`](docs/data-pipeline.md) for attribution and
the full field mapping. Key DSP-specific modeling:

- **Recipes list their `producers` directly** (no Factorio-style crafting
  categories). The default building is the best **non–Dark-Fog** (`df-*`) tier;
  override per item in the chain UI.
- **Mining recipes** (empty inputs, `mining` flag) are surfaced as raw veins but
  still drill down to a Mining Machine.
- **Research** is modeled as `technology`-flagged recipes that consume the six
  matrices; the tech tree reads `prerequisites` and `recipeUnlock`.
- **Proliferators** are effect modules with two modes: *extra products* (only on
  the curated `proliferableRecipes` list) and *production speed* (any building
  with a module slot). Both raise power draw by the module's `consumption`.

To refresh for a new game version: replace `scripts/factoriolab-dsp.json` +
`scripts/factoriolab-defaults.json` from FactorioLab, run `npm run transform-data`,
re-run `npm test`, and (if the tech tree uses a build-time layout)
`npm run generate-tech-layout`.

## Conventions

- **Always-dark theme.** Never use the `dark:` prefix. Never hardcode colors —
  use the semantic Tailwind classes / CSS variables defined in `src/web/app.css`
  (`text-foreground`, `bg-card`, `border-border`, `text-primary`, `text-amber`,
  `text-muted-foreground`, …).
- **Local module imports use the `.js` extension** (e.g. `from '../data.js'`),
  matching the bundler resolution. Keep this consistent.
- **lucide icons** are imported one-per-file from `lucide-react/dist/esm/icons/*`,
  never from the package barrel.
- Use the **UI primitives** in `src/web/ui/` instead of raw `<select>`/`<input>`.
- The calculator layer stays **pure** — no imports from `src/web`.
- Run `npx tsc -b` and `npm test` before considering a change done.
