/**
 * Build-time only. Precomputes a search index ({ id: { en, zh, py, pyInitials } })
 * so the runtime can match items by English name, Chinese name, or pinyin without
 * shipping a pinyin library. Uses pinyin-pro (a devDependency).
 */
import { pinyin } from 'pinyin-pro';

export interface SearchEntry {
  en: string;
  zh: string;
  py: string;
  pyInitials: string;
}

export interface SearchSource {
  id: string;
  en: string;
  zh: string;
}

/** Lowercased english + toneless pinyin (full + first-letter initials) of the zh name. */
export function buildSearchEntry(en: string, zh: string): SearchEntry {
  if (!zh) {
    return { en: en.toLowerCase(), zh: '', py: '', pyInitials: '' };
  }
  const py = pinyin(zh, { toneType: 'none', type: 'array' }) as string[];
  return {
    en: en.toLowerCase(),
    zh,
    py: py.join('').toLowerCase(),
    pyInitials: py.map((s) => s[0] ?? '').join('').toLowerCase(),
  };
}

export function buildSearchIndex(sources: SearchSource[]): Record<string, SearchEntry> {
  const index: Record<string, SearchEntry> = {};
  for (const s of sources) index[s.id] = buildSearchEntry(s.en, s.zh);
  return index;
}
