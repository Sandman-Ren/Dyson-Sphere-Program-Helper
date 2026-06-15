import { describe, it, expect } from 'vitest';
import { resolveName, titleCase } from './resolveName.js';

// Fake i18next-style lookup: returns '' for a miss.
const dict: Record<string, Record<string, string>> = {
  items: { 'iron-ore': '铁矿' },
  recipes: { 'iron-ingot-alt': '铁块（替代）' },
};
const t = (id: string, ns: string) => dict[ns]?.[id] ?? '';

describe('resolveName', () => {
  it('prefers the items namespace', () => {
    expect(resolveName(t, 'iron-ore', ['items', 'recipes'])).toBe('铁矿');
  });
  it('falls back to recipes namespace', () => {
    expect(resolveName(t, 'iron-ingot-alt', ['items', 'recipes'])).toBe('铁块（替代）');
  });
  it('falls back to title-cased id when unknown', () => {
    expect(resolveName(t, 'dark-fog-relic', ['items', 'recipes'])).toBe('Dark Fog Relic');
  });
});

describe('titleCase', () => {
  it('converts a kebab id to words', () => {
    expect(titleCase('universe-matrix')).toBe('Universe Matrix');
  });
});
