import { describe, it, expect } from 'vitest';
import {
  encodeSetupUrl, decodeSetupUrl, sanitizeSnapshot, canonicalSnapshotKey,
  type SetupSnapshot, type SnapshotValidators,
} from './setups.js';

const validators: SnapshotValidators = {
  isValidItem: (id) => ['iron-ingot', 'copper-ingot', 'circuit-board'].includes(id),
  isValidMachine: (id) => ['assembler-mk1', 'smelter-1'].includes(id),
  isValidProliferator: (id) => id === 'none' || id === 'proliferator-mk3',
};

const snap: SetupSnapshot = {
  v: 1,
  targets: [
    { item: 'iron-ingot', amount: 60, unit: 'minute' },
    { item: 'circuit-board', amount: 30, unit: 'second' },
  ],
  displayUnit: 'minute',
  proliferatorId: 'proliferator-mk3',
  machineOverrides: { 'iron-ingot': 'smelter-1' },
  recipeOverrides: [{}, { 'root/copper-ingot': 'copper-ingot-alt' }],
};

describe('setups', () => {
  it('round-trips through URL encode/decode', () => {
    const decoded = decodeSetupUrl(encodeSetupUrl(snap));
    expect(decoded).toEqual(snap);
  });

  it('decodeSetupUrl returns null on garbage', () => {
    expect(decodeSetupUrl('not-base64-$$$')).toBeNull();
    expect(decodeSetupUrl(encodeSetupUrl({ ...snap, v: 2 as unknown as 1 }))).toBeNull();
  });

  it('canonicalSnapshotKey is insensitive to machineOverrides key order', () => {
    const a = { ...snap, machineOverrides: { x: 'assembler-mk1', y: 'smelter-1' } };
    const b = { ...snap, machineOverrides: { y: 'smelter-1', x: 'assembler-mk1' } };
    expect(canonicalSnapshotKey(a)).toBe(canonicalSnapshotKey(b));
  });

  it('canonicalSnapshotKey is sensitive to target order', () => {
    const reversed = { ...snap, targets: [...snap.targets].reverse() };
    expect(canonicalSnapshotKey(reversed)).not.toBe(canonicalSnapshotKey(snap));
  });

  it('sanitizeSnapshot drops invalid targets, machines, proliferator, and bad units', () => {
    const dirty = {
      v: 1,
      targets: [
        { item: 'iron-ingot', amount: -5, unit: 'fortnight' },
        { item: 'not-a-real-item', amount: 10, unit: 'minute' },
      ],
      displayUnit: 'aeon',
      proliferatorId: 'proliferator-fake',
      machineOverrides: { 'iron-ingot': 'smelter-1', 'iron-ingot-2': 'ghost-machine' },
      recipeOverrides: [{ a: 'b' }, { c: 'd' }],
    };
    const out = sanitizeSnapshot(dirty, validators);
    expect(out.targets).toEqual([{ item: 'iron-ingot', amount: 0, unit: 'minute' }]);
    expect(out.displayUnit).toBe('minute');
    expect(out.proliferatorId).toBe('none');
    expect(out.machineOverrides).toEqual({ 'iron-ingot': 'smelter-1' });
    expect(out.recipeOverrides).toEqual([{ a: 'b' }]);
  });

  it('sanitizeSnapshot falls back to one empty target when none survive', () => {
    const out = sanitizeSnapshot({ v: 1, targets: [] }, validators);
    expect(out.targets).toEqual([{ item: '', amount: 60, unit: 'minute' }]);
    expect(out.recipeOverrides).toEqual([{}]);
  });
});
