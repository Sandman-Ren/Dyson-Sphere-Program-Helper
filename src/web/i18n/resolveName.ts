/** Pure display-name resolution. `lookup(id, ns)` returns '' on a miss. */
export type NamespaceLookup = (id: string, ns: string) => string;

export function titleCase(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveName(lookup: NamespaceLookup, id: string, nsOrder: string[]): string {
  for (const ns of nsOrder) {
    const v = lookup(id, ns);
    if (v) return v;
  }
  return titleCase(id);
}
