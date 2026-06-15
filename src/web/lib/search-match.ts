/** Case-insensitive multi-field search: english, chinese, pinyin (full+initials), id. */
export interface SearchEntry {
  en: string;
  zh: string;
  py: string;
  pyInitials: string;
}

export function matchesSearch(id: string, entry: SearchEntry | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (id.toLowerCase().includes(q)) return true;
  if (!entry) return false;
  return (
    entry.en.includes(q) ||
    entry.zh.includes(q) ||
    entry.py.includes(q) ||
    entry.pyInitials.includes(q)
  );
}
