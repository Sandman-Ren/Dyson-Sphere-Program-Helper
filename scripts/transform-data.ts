/**
 * Transform the FactorioLab DSP dataset into this app's normalized JSON.
 *
 *   input:  scripts/factoriolab-dsp.json        (FactorioLab public/data/dsp/data.json)
 *           scripts/factoriolab-defaults.json   (FactorioLab public/data/dsp/defaults.json)
 *   output: src/data/generated/*.json
 *
 * FactorioLab is MIT-licensed (see docs/data-pipeline.md for attribution).
 * Run with: npm run transform-data
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type {
  Recipe, RecipeItem, RecipeFlag, Item, Machine, Proliferator,
  Technology, Belt, Icon, Meta,
} from '../src/data/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'src/data/generated');

// ---- Raw FactorioLab types (only the fields we read) ----
interface LabItem {
  id: string; name: string; category: string; row: number; stack?: number;
  machine?: { speed?: number; usage?: number; drain?: number; modules?: number; type?: string };
  belt?: { speed: number };
  module?: { productivity?: number; speed?: number; consumption?: number; proliferator?: string; sprays?: number };
  technology?: { prerequisites?: string[]; recipeUnlock?: string[] };
}
interface LabRecipe {
  id: string; name: string; time: number; category?: string; cost?: number;
  in: Record<string, number>; out: Record<string, number>;
  producers?: string[]; flags?: string[];
}
interface LabData {
  version: Record<string, string>;
  items: LabItem[];
  recipes: LabRecipe[];
  icons: Icon[];
  limitations: Record<string, string[]>;
}
interface LabDefaults {
  excludedRecipes: string[];
  maxMachineRank: string[];
  minMachineRank: string[];
  moduleRank: string[];
}

const data: LabData = JSON.parse(readFileSync(resolve(root, 'scripts/factoriolab-dsp.json'), 'utf8'));
const defaults: LabDefaults = JSON.parse(readFileSync(resolve(root, 'scripts/factoriolab-defaults.json'), 'utf8'));

const KNOWN_FLAGS = new Set<RecipeFlag>(['mining', 'technology', 'locked']);
const toRecipeItems = (m: Record<string, number>): RecipeItem[] =>
  Object.entries(m).map(([id, amount]) => ({ id, amount }));

// ---- Items ----
const items: Item[] = data.items.map((it) => ({
  id: it.id,
  name: it.name,
  category: it.category,
  row: it.row ?? 0,
  stack: it.stack ?? 0,
}));

// ---- Machines (items carrying a `machine` block) ----
const machines: Machine[] = data.items
  .filter((it) => it.machine)
  .map((it) => {
    const m = it.machine!;
    return {
      id: it.id,
      name: it.name,
      speed: m.speed ?? 1,
      usageKW: m.usage ?? 0,
      drainKW: m.drain ?? 0,
      modules: m.modules ?? 0,
      powerType: m.type === 'electric' ? 'electric' : 'none',
    } satisfies Machine;
  });

// ---- Belts ----
const belts: Belt[] = data.items
  .filter((it) => it.belt)
  .map((it) => ({ id: it.id, name: it.name, speed: it.belt!.speed }));

// ---- Proliferators (effect modules) ----
const proliferators: Proliferator[] = data.items
  .filter((it) => it.module?.proliferator)
  .map((it) => {
    const mod = it.module!;
    const speed = mod.speed ?? 0;
    return {
      id: it.id,
      name: it.name,
      tier: mod.proliferator!,
      productivity: mod.productivity ?? 0,
      speed,
      consumption: mod.consumption ?? 0,
      sprays: mod.sprays ?? 0,
      mode: speed > 0 ? 'speed' : 'products',
    } satisfies Proliferator;
  });

// ---- Recipes ----
const recipes: Recipe[] = data.recipes.map((r) => {
  const flags = (r.flags ?? []).filter((f): f is RecipeFlag => KNOWN_FLAGS.has(f as RecipeFlag));
  const recipe: Recipe = {
    id: r.id,
    name: r.name,
    time: r.time,
    in: toRecipeItems(r.in),
    out: toRecipeItems(r.out),
    producers: r.producers ?? [],
    flags,
  };
  if (r.cost !== undefined) recipe.cost = r.cost;
  return recipe;
});
const recipeById = new Map(recipes.map((r) => [r.id, r]));

// ---- Technologies (items carrying a `technology` block) ----
const technologies: Technology[] = data.items
  .filter((it) => it.technology)
  .map((it) => {
    const tech = it.technology!;
    const techRecipe = recipeById.get(it.id);
    const hashOut = techRecipe?.out.find((o) => o.id === it.id)?.amount ?? 0;
    return {
      id: it.id,
      name: it.name,
      prerequisites: tech.prerequisites ?? [],
      recipeUnlock: tech.recipeUnlock ?? [],
      cost: {
        time: techRecipe?.time ?? 0,
        matrices: techRecipe?.in ?? [],
        hash: hashOut,
      },
      row: it.row ?? 0,
      upgrade: it.category === 'upgrades',
    } satisfies Technology;
  });

// ---- Icons ----
const icons: Icon[] = data.icons.map((ic) => ({ id: ic.id, x: ic.x, y: ic.y, color: ic.color }));

// ---- Meta ----
const meta: Meta & { proliferableRecipes: string[] } = {
  game: 'Dyson Sphere Program',
  version: data.version.DSP ?? 'unknown',
  excludedRecipes: defaults.excludedRecipes ?? [],
  maxMachineRank: defaults.maxMachineRank ?? [],
  minMachineRank: defaults.minMachineRank ?? [],
  defaultProliferator: defaults.moduleRank?.[0] ?? null,
  proliferableRecipes: data.limitations.productivity ?? [],
};

// ---- Write ----
const write = (file: string, value: unknown) =>
  writeFileSync(resolve(outDir, file), JSON.stringify(value, null, 2) + '\n');

write('items.json', items);
write('recipes.json', recipes);
write('machines.json', machines);
write('belts.json', belts);
write('proliferators.json', proliferators);
write('technologies.json', technologies);
write('icons.json', icons);
write('meta.json', meta);

console.log(
  `transform-data: ${items.length} items, ${recipes.length} recipes, ${machines.length} machines, ` +
  `${technologies.length} techs, ${proliferators.length} proliferators, ${belts.length} belts, ` +
  `${icons.length} icons (DSP ${meta.version})`,
);
