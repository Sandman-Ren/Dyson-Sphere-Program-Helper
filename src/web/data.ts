/**
 * Central data access for the UI. Loads the generated DSP dataset once,
 * builds the recipe graph, and exposes lookup helpers shared by every tab.
 */
import { buildRecipeGraph, type RecipeGraph } from '../calculator/index.js';
import type {
  Item, Recipe, Machine, Proliferator, Technology, Belt, Icon,
} from '../data/schema.js';

import itemsData from '../data/generated/items.json';
import recipesData from '../data/generated/recipes.json';
import machinesData from '../data/generated/machines.json';
import proliferatorsData from '../data/generated/proliferators.json';
import technologiesData from '../data/generated/technologies.json';
import beltsData from '../data/generated/belts.json';
import iconsData from '../data/generated/icons.json';
import metaData from '../data/generated/meta.json';

export interface DspMeta {
  game: string;
  version: string;
  excludedRecipes: string[];
  maxMachineRank: string[];
  minMachineRank: string[];
  defaultProliferator: string | null;
  proliferableRecipes: string[];
}

export const items = itemsData as Item[];
export const recipes = recipesData as Recipe[];
export const machines = machinesData as Machine[];
export const proliferators = proliferatorsData as Proliferator[];
export const technologies = technologiesData as Technology[];
export const belts = beltsData as Belt[];
export const icons = iconsData as Icon[];
export const meta = metaData as DspMeta;

export const graph: RecipeGraph = buildRecipeGraph(recipes, machines, meta);

export const itemById = new Map(items.map((i) => [i.id, i]));
export const iconById = new Map(icons.map((i) => [i.id, i]));
export const machineById = new Map(machines.map((m) => [m.id, m]));
export const techById = new Map(technologies.map((t) => [t.id, t]));
export const recipeById = new Map(recipes.map((r) => [r.id, r]));

/** Sprite-sheet geometry (icons.webp): 64px tiles on a 1472×1472 grid. */
export const ICON_TILE = 64;
export const ICON_SHEET = 1472;

const titleCase = (id: string) =>
  id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Human-readable display name for any item/recipe/tech id. */
export function displayName(id: string): string {
  return itemById.get(id)?.name ?? techById.get(id)?.name ?? recipeById.get(id)?.name ?? titleCase(id);
}

/** Accent color for an id, from its icon entry (falls back to the theme border). */
export function iconColor(id: string): string {
  return iconById.get(id)?.color ?? 'var(--border)';
}
