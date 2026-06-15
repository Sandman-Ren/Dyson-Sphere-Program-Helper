import { describe, it, expect } from 'vitest';
import { buildSearchEntry, buildSearchIndex } from './search-index.ts';

describe('buildSearchEntry', () => {
  it('lowercases english and derives full pinyin + initials from chinese', () => {
    const e = buildSearchEntry('Iron Ore', '铁矿');
    expect(e).toEqual({ en: 'iron ore', zh: '铁矿', py: 'tiekuang', pyInitials: 'tk' });
  });

  it('handles a missing chinese name', () => {
    const e = buildSearchEntry('Mystery Thing', '');
    expect(e).toEqual({ en: 'mystery thing', zh: '', py: '', pyInitials: '' });
  });
});

describe('buildSearchIndex', () => {
  it('keys entries by id', () => {
    const idx = buildSearchIndex([
      { id: 'iron-ore', en: 'Iron Ore', zh: '铁矿' },
      { id: 'copper-ore', en: 'Copper Ore', zh: '铜矿' },
    ]);
    expect(idx['iron-ore'].py).toBe('tiekuang');
    expect(idx['copper-ore'].pyInitials).toBe('tk');
  });
});
