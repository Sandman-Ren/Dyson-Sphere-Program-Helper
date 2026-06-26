import { describe, it, expect } from 'vitest';
import {
  encodeSetupUrl, decodeSetupUrl, sanitizeSnapshot, canonicalSnapshotKey,
  type SetupSnapshot, type SnapshotValidators,
} from './setups.js';

const validators: SnapshotValidators = {
  isValidItem: (id) => ['iron-ingot', 'copper-ingot', 'circuit-board', 'proliferator-mk3'].includes(id),
  isValidMachine: (id) => ['assembler-mk1', 'smelter-1'].includes(id),
  isValidProliferator: (id) => id === 'none' || id === 'proliferator-mk3',
  // Proliferators are valid items but NOT pinnable.
  isPinnableItem: (id) => ['iron-ingot', 'copper-ingot', 'circuit-board'].includes(id),
};

const snap: SetupSnapshot = {
  v: 2,
  targets: [
    { item: 'iron-ingot', amount: 60, unit: 'minute', mode: 'fixed', followMax: false },
    { item: 'circuit-board', amount: 30, unit: 'second', mode: 'variable', followMax: true },
  ],
  displayUnit: 'minute',
  proliferatorId: 'proliferator-mk3',
  machineOverrides: { 'iron-ingot': 'smelter-1' },
  recipeOverrides: [{}, { 'root/copper-ingot': 'copper-ingot-alt' }],
  pinnedSupply: { 'copper-ingot': { amount: 120, unit: 'minute' } },
};

describe('setups', () => {
  it('round-trips through URL encode/decode', () => {
    expect(decodeSetupUrl(encodeSetupUrl(snap))).toEqual(snap);
  });

  it('decodeSetupUrl accepts v1 and v2 but rejects other versions and garbage', () => {
    expect(decodeSetupUrl('not-base64-$$$')).toBeNull();
    expect(decodeSetupUrl(encodeSetupUrl({ ...snap, v: 3 as unknown as 2 }))).toBeNull();
    // a real v1 payload still decodes (no mode/pinnedSupply fields)
    const v1 = { v: 1, targets: [{ item: 'iron-ingot', amount: 5, unit: 'minute' }], displayUnit: 'minute',
      proliferatorId: 'none', machineOverrides: {}, recipeOverrides: [{}] };
    expect(decodeSetupUrl(encodeSetupUrl(v1 as unknown as SetupSnapshot))).not.toBeNull();
  });

  it('canonicalSnapshotKey is insensitive to machineOverrides key order', () => {
    const a = { ...snap, machineOverrides: { x: 'assembler-mk1', y: 'smelter-1' } };
    const b = { ...snap, machineOverrides: { y: 'smelter-1', x: 'assembler-mk1' } };
    expect(canonicalSnapshotKey(a)).toBe(canonicalSnapshotKey(b));
  });

  it('sanitizeSnapshot upgrades a v1 payload to all-fixed + empty pool', () => {
    const v1 = { v: 1, targets: [{ item: 'iron-ingot', amount: 5, unit: 'minute' }], displayUnit: 'minute',
      proliferatorId: 'none', machineOverrides: {}, recipeOverrides: [{}] };
    const out = sanitizeSnapshot(v1, validators);
    expect(out.v).toBe(2);
    expect(out.targets[0]).toEqual({ item: 'iron-ingot', amount: 5, unit: 'minute', mode: 'fixed', followMax: false });
    expect(out.pinnedSupply).toEqual({});
  });

  it('sanitizeSnapshot keeps modes aligned when an unknown-item target is dropped', () => {
    const dirty = {
      v: 2,
      targets: [
        { item: 'not-real', amount: 1, unit: 'minute', mode: 'variable', followMax: true },
        { item: 'iron-ingot', amount: 2, unit: 'minute', mode: 'variable', followMax: true },
      ],
      displayUnit: 'minute', proliferatorId: 'none', machineOverrides: {},
      recipeOverrides: [{ a: 'b' }, { c: 'd' }],
      pinnedSupply: {},
    };
    const out = sanitizeSnapshot(dirty, validators);
    expect(out.targets).toEqual([{ item: 'iron-ingot', amount: 2, unit: 'minute', mode: 'variable', followMax: true }]);
    expect(out.recipeOverrides).toEqual([{ c: 'd' }]); // override stayed aligned with its target
  });

  it('sanitizeSnapshot drops invalid mode, unknown/proliferator pinned ids, and bad amounts', () => {
    const dirty = {
      v: 2,
      targets: [{ item: 'iron-ingot', amount: 10, unit: 'minute', mode: 'sideways', followMax: 'yes' }],
      displayUnit: 'minute', proliferatorId: 'none', machineOverrides: {}, recipeOverrides: [{}],
      pinnedSupply: {
        'copper-ingot': { amount: 50, unit: 'minute' },
        'ghost-item': { amount: 5, unit: 'minute' },        // unknown → dropped
        'proliferator-mk3': { amount: 20, unit: 'minute' }, // valid item but not pinnable → dropped
        'circuit-board': { amount: -3, unit: 'fortnight' }, // bad amount/unit → clamped/defaulted
      },
    };
    const out = sanitizeSnapshot(dirty, validators);
    expect(out.targets[0].mode).toBe('fixed');     // invalid mode → fixed
    expect(out.targets[0].followMax).toBe(false);  // invalid followMax → false
    expect(out.pinnedSupply).toEqual({
      'copper-ingot': { amount: 50, unit: 'minute' },
      'circuit-board': { amount: 0, unit: 'minute' },
    });
  });

  it('sanitizeSnapshot falls back to one empty fixed target when none survive', () => {
    const out = sanitizeSnapshot({ v: 2, targets: [] }, validators);
    expect(out.targets).toEqual([{ item: '', amount: 60, unit: 'minute', mode: 'fixed', followMax: false }]);
    expect(out.recipeOverrides).toEqual([{}]);
    expect(out.pinnedSupply).toEqual({});
  });
});
