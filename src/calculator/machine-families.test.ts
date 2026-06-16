import { describe, it, expect } from 'vitest';
import {
  MACHINE_FAMILIES, MACHINE_FAMILY_ORDER, familyOfMachine, familyOfRecipe,
} from './machine-families.js';
import type { Recipe } from '../data/schema.js';

const recipe = (producers: string[]): Recipe => ({
  id: 'r', name: 'r', time: 1, in: [], out: [], producers, flags: [],
});

describe('familyOfMachine', () => {
  it('maps each member id to its family', () => {
    expect(familyOfMachine('arc-smelter')).toBe('smelter');
    expect(familyOfMachine('df-negentropy-smelter')).toBe('smelter');
    expect(familyOfMachine('assembling-machine-3')).toBe('assembler');
    expect(familyOfMachine('advanced-mining-machine')).toBe('miner');
    expect(familyOfMachine('quantum-chemical-plant')).toBe('chemical');
    expect(familyOfMachine('matrix-lab')).toBe('lab');
  });

  it('returns null for non-family machines', () => {
    expect(familyOfMachine('oil-refinery')).toBeNull();
    expect(familyOfMachine('nonexistent')).toBeNull();
  });
});

describe('familyOfRecipe', () => {
  it('derives the family from the recipe producer list', () => {
    expect(familyOfRecipe(recipe(['arc-smelter', 'plane-smelter']))).toBe('smelter');
    expect(familyOfRecipe(recipe(['assembling-machine-1', 'assembling-machine-2']))).toBe('assembler');
    expect(familyOfRecipe(recipe(['mining-machine', 'advanced-mining-machine']))).toBe('miner');
  });

  it('returns null when no producer belongs to a tiered family', () => {
    expect(familyOfRecipe(recipe(['oil-refinery']))).toBeNull();
    expect(familyOfRecipe(recipe([]))).toBeNull();
  });
});

describe('family config integrity', () => {
  it('orders every family and lists each only once', () => {
    expect([...MACHINE_FAMILY_ORDER].sort()).toEqual(
      Object.keys(MACHINE_FAMILIES).sort(),
    );
  });

  it('has no machine shared across families', () => {
    const seen = new Set<string>();
    for (const ids of Object.values(MACHINE_FAMILIES)) {
      for (const id of ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });
});
