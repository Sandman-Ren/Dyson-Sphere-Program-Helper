import { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import * as dagreImport from '@dagrejs/dagre';
import type { GroupedPlan } from '../../../calculator/planner/index.js';
import { displayName } from '../../data.js';

// Interop: the dagre CJS module may be wrapped under one or more `.default`
// layers depending on the bundler/loader. Unwrap until the real API surfaces.
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

const NODE_W = 180;
const NODE_H = 44;

/** Lay blocks out top-down with dagre; edges follow feed relationships. */
function layout(plan: GroupedPlan): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const block of plan.blocks) g.setNode(block.item, { width: NODE_W, height: NODE_H });
  const edges: Edge[] = [];
  for (const block of plan.blocks) {
    for (const feed of block.feeds) {
      g.setEdge(block.item, feed.block);
      edges.push({
        id: `${block.item}->${feed.block}`,
        source: block.item,
        target: feed.block,
        type: 'smoothstep',
      });
    }
  }
  dagre.layout(g);

  const nodes: Node[] = plan.blocks.map((block) => {
    const pos = g.node(block.item);
    return {
      id: block.item,
      position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 },
      data: { label: displayName(block.item) },
      style: {
        width: NODE_W,
        height: NODE_H,
        fontSize: 12,
        borderRadius: 8,
        border: block.kind === 'target' ? '1px solid var(--primary)' : '1px solid var(--border)',
        background: 'var(--card)',
        color: 'var(--foreground)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
    };
  });
  return { nodes, edges };
}

function BlockGraphInner({
  plan,
  onSelect,
}: {
  plan: GroupedPlan;
  onSelect?: (item: string) => void;
}) {
  const { nodes, edges } = useMemo(() => layout(plan), [plan]);
  const onNodeClick: NodeMouseHandler = (_, node) => onSelect?.(node.id);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      fitView
      minZoom={0.2}
      maxZoom={1.75}
      nodesDraggable={false}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={28} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function BlockGraph(props: { plan: GroupedPlan; onSelect?: (item: string) => void }) {
  return (
    <ReactFlowProvider>
      <BlockGraphInner {...props} />
    </ReactFlowProvider>
  );
}
