import { describe, it, expect } from 'vitest';
import zh from './i18n/zh.json';
import searchIndex from './search-index.json';
import items from './items.json';

describe('generated i18n bundle', () => {
  it('has Chinese item names for known ids', () => {
    expect((zh.items as Record<string, string>)['iron-ore']).toBe('铁矿');
  });

  it('covers most items (fallback to english handles the rest)', () => {
    const zhItems = zh.items as Record<string, string>;
    const covered = (items as { id: string }[]).filter((i) => zhItems[i.id]).length;
    expect(covered).toBeGreaterThan((items as unknown[]).length * 0.8);
  });
});

describe('generated search index', () => {
  it('includes pinyin for a known item', () => {
    const idx = searchIndex as Record<string, { en: string; zh: string; py: string; pyInitials: string }>;
    expect(idx['iron-ore']).toMatchObject({ en: 'iron ore', zh: '铁矿', py: 'tiekuang', pyInitials: 'tk' });
  });
});
