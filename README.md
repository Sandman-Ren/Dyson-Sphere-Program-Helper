# DSP Helper

A web-based **production calculator, research tree, and item reference** for
[Dyson Sphere Program](https://store.steampowered.com/app/1366540/).

Choose a target item and a production rate — get the complete production chain
with every building, raw vein, and power draw, plus optional proliferator
effects. Explore the research tree, and look up what any item is produced by,
used in, and unlocked by.

## Features

- **Production calculator** — recursive chain solver with per-item building
  overrides, integer-ratio scaling to whole buildings, and live power totals.
- **Proliferators** — model extra-products vs. production-speed modes (Mk.I–III),
  including their added power cost.
- **Research tree** — interactive graph of all technologies with prerequisites,
  matrix costs, and the recipes each tech unlocks.
- **Item lookup** — produced-by / used-in / unlocked-by for every item, with
  one-click jumps into the calculator or research tree.
- **484 items, 491 recipes, 305 technologies** from DSP v0.10.29.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173/dsp-helper/
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run transform-data` | Regenerate game data from the seed dataset |
| `npm test` | Run the calculator test suite |

## Tech stack

React 19 · TypeScript · Vite 6 · Tailwind CSS v4 · radix-ui · @xyflow/react ·
@dagrejs/dagre · Vitest.

## Data & credits

Game data is transformed from the MIT-licensed
[FactorioLab](https://github.com/factoriolab/factoriolab) DSP dataset — see
[`docs/data-pipeline.md`](docs/data-pipeline.md). Dyson Sphere
Program is a trademark of Youthcat Studio; this is an unofficial fan tool.

Architecture and contributor notes live in [`CLAUDE.md`](CLAUDE.md).
