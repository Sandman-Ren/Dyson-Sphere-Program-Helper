/**
 * Pure helpers for reasoning about the technology prerequisite graph.
 * Shared by the React Flow viewer and the detail panel.
 */
import { technologies, techById, searchIndex } from '../../data.js';
import { matchesSearch } from '../../lib/search-match.js';
import type { Technology } from '../../../data/schema.js';

/** Adjacency: tech id -> its (existing) prerequisite tech ids. */
export const prereqsById: Map<string, string[]> = new Map(
  technologies.map((t) => [
    t.id,
    t.prerequisites.filter((p) => techById.has(p)),
  ]),
);

/**
 * All transitive prerequisite tech ids for `id` (its ancestors), not including
 * `id` itself. Used to highlight the full research path leading to a tech.
 */
export function ancestorTechIds(id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(prereqsById.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const p of prereqsById.get(cur) ?? []) stack.push(p);
  }
  return seen;
}

/** Search a technology by english/chinese/pinyin name or id. */
export function matchesQuery(tech: Technology, q: string): boolean {
  if (!q) return false;
  return matchesSearch(tech.id, searchIndex[tech.id], q);
}

/** Total matrices of a single kind consumed across the whole research. */
export function matrixTotal(tech: Technology, matrixId: string): number {
  const per = tech.cost.matrices.find((m) => m.id === matrixId)?.amount ?? 0;
  return per * tech.cost.hash;
}
