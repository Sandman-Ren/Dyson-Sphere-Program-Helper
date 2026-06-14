/**
 * Pre-compute a left-to-right dagre layout for the research tree so the UI can
 * render ~305 tech nodes instantly without running layout in the browser.
 *
 *   input:  src/data/generated/technologies.json
 *   output: src/data/generated/tech-tree-layout.json
 *
 * Run with: npm run generate-tech-layout
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as dagreImport from '@dagrejs/dagre';
import type { Technology } from '../src/data/schema.ts';

// Interop: depending on the loader, the dagre CJS module may be wrapped under
// one or more `.default` layers. Unwrap until the real API surfaces.
function unwrap(mod: unknown): typeof import('@dagrejs/dagre') {
  let current = mod as Record<string, unknown>;
  for (let i = 0; i < 5; i += 1) {
    if (current && typeof current.layout === 'function') break;
    if (!current || !current.default) break;
    current = current.default as Record<string, unknown>;
  }
  return current as unknown as typeof import('@dagrejs/dagre');
}
const dagre = unwrap(dagreImport);

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const generatedDir = resolve(root, 'src/data/generated');

/** Node footprint used both here and by the custom React Flow node. */
const NODE_WIDTH = 188;
const NODE_HEIGHT = 52;

export interface TechLayoutNode {
  id: string;
  x: number;
  y: number;
}

export interface TechLayout {
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
  nodes: TechLayoutNode[];
}

function buildLayout(technologies: Technology[]): TechLayout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 24,
    edgesep: 12,
    ranksep: 80,
    marginx: 24,
    marginy: 24,
    ranker: 'network-simplex',
  });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(technologies.map((t) => t.id));
  for (const tech of technologies) {
    g.setNode(tech.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const tech of technologies) {
    for (const prereq of tech.prerequisites) {
      if (ids.has(prereq)) g.setEdge(prereq, tech.id);
    }
  }

  dagre.layout(g);

  const nodes: TechLayoutNode[] = technologies.map((tech) => {
    const n = g.node(tech.id);
    // dagre positions are centers; React Flow positions are top-left.
    return { id: tech.id, x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 };
  });

  const graphLabel = g.graph();
  return {
    width: graphLabel.width ?? 0,
    height: graphLabel.height ?? 0,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    nodes,
  };
}

function main(): void {
  const technologies = JSON.parse(
    readFileSync(resolve(generatedDir, 'technologies.json'), 'utf8'),
  ) as Technology[];

  const layout = buildLayout(technologies);
  const outPath = resolve(generatedDir, 'tech-tree-layout.json');
  writeFileSync(outPath, JSON.stringify(layout));

  console.log(
    `Wrote ${layout.nodes.length} positioned tech nodes ` +
      `(${Math.round(layout.width)}×${Math.round(layout.height)}) to ${outPath}`,
  );
}

main();
