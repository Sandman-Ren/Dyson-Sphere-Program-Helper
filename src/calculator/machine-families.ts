import type { Recipe } from '../data/schema.js';

/**
 * Building families that have multiple interchangeable tiers. The calculator can
 * default every recipe in a family to a chosen tier (see `MachineTiers`), while
 * the per-node override still wins for individual items.
 */
export type MachineFamily = 'smelter' | 'assembler' | 'miner' | 'chemical' | 'lab';

/**
 * Member machine ids per family, in ascending tier order (slowest → fastest,
 * Dark-Fog tier last). Drives the global tier selectors and maps a recipe back
 * to its family via the recipe's producer list.
 */
export const MACHINE_FAMILIES: Record<MachineFamily, readonly string[]> = {
  smelter: ['arc-smelter', 'plane-smelter', 'df-negentropy-smelter'],
  assembler: ['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3', 'df-recomposing-assembler'],
  miner: ['mining-machine', 'advanced-mining-machine'],
  chemical: ['chemical-plant', 'quantum-chemical-plant'],
  lab: ['matrix-lab', 'df-self-evolution-lab'],
};

/** Stable display order for the global tier selectors. */
export const MACHINE_FAMILY_ORDER: readonly MachineFamily[] = [
  'assembler', 'smelter', 'miner', 'chemical', 'lab',
];

/** Global default machine per family: family → chosen machine id. */
export type MachineTiers = Partial<Record<MachineFamily, string>>;

const FAMILY_BY_MACHINE = new Map<string, MachineFamily>(
  (Object.entries(MACHINE_FAMILIES) as [MachineFamily, readonly string[]][])
    .flatMap(([family, ids]) => ids.map((id) => [id, family] as [string, MachineFamily])),
);

/** The family a machine belongs to, or null if it isn't a tiered family member. */
export function familyOfMachine(machineId: string): MachineFamily | null {
  return FAMILY_BY_MACHINE.get(machineId) ?? null;
}

/** The family a recipe is crafted by, derived from its producer list. */
export function familyOfRecipe(recipe: Recipe): MachineFamily | null {
  for (const id of recipe.producers) {
    const family = FAMILY_BY_MACHINE.get(id);
    if (family) return family;
  }
  return null;
}
