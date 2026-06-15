import { describe, it, expect } from 'vitest';
import { matchesSearch } from './search-match.js';

const entry = { en: 'iron ore', zh: '铁矿', py: 'tiekuang', pyInitials: 'tk' };

describe('matchesSearch', () => {
  it('matches by english substring', () => expect(matchesSearch('iron-ore', entry, 'iron')).toBe(true));
  it('matches by chinese substring', () => expect(matchesSearch('iron-ore', entry, '铁')).toBe(true));
  it('matches by full pinyin', () => expect(matchesSearch('iron-ore', entry, 'tiekuang')).toBe(true));
  it('matches by pinyin initials', () => expect(matchesSearch('iron-ore', entry, 'tk')).toBe(true));
  it('matches by id', () => expect(matchesSearch('iron-ore', entry, 'iron-o')).toBe(true));
  it('returns false on no match', () => expect(matchesSearch('iron-ore', entry, 'copper')).toBe(false));
  it('matches everything on empty query', () => expect(matchesSearch('iron-ore', entry, '')).toBe(true));
  it('tolerates a missing index entry (id-only match)', () =>
    expect(matchesSearch('iron-ore', undefined, 'iron')).toBe(true));
});
