import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
  type NodeTypes,
} from '@xyflow/react';
import SearchIcon from 'lucide-react/dist/esm/icons/search';
import XIcon from 'lucide-react/dist/esm/icons/x';
import { Input } from '../../ui/index.js';
import { technologies, techById } from '../../data.js';
import layoutData from '../../../data/generated/tech-tree-layout.json';
import { TechNode, type TechFlowNode } from './TechNode.js';
import { TechDetail } from './TechDetail.js';
import { ancestorTechIds, prereqsById, matchesQuery } from './techGraph.js';

interface TechTreeProps {
  pendingTech: string | null;
  onPendingHandled: () => void;
  onCalculateItem: (id: string) => void;
}

interface TechLayout {
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
  nodes: { id: string; x: number; y: number }[];
}

const layout = layoutData as TechLayout;
const positionById = new Map(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
const nodeTypes: NodeTypes = { tech: TechNode };

/** Static base edges (prerequisite -> tech); highlighting is applied per-render. */
const baseEdges: Edge[] = technologies.flatMap((tech) =>
  (prereqsById.get(tech.id) ?? []).map((prereq) => ({
    id: `${prereq}->${tech.id}`,
    source: prereq,
    target: tech.id,
    type: 'smoothstep',
  })),
);

function TechTreeInner({ pendingTech, onPendingHandled, onCalculateItem }: TechTreeProps) {
  const { setCenter } = useReactFlow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Center the viewport on a tech node by id.
  const centerOnTech = useCallback(
    (id: string, zoom = 1) => {
      const pos = positionById.get(id);
      if (!pos) return;
      setCenter(pos.x + layout.nodeWidth / 2, pos.y + layout.nodeHeight / 2, {
        zoom,
        duration: 500,
      });
    },
    [setCenter],
  );

  const selectTech = useCallback(
    (id: string) => {
      if (!techById.has(id)) return;
      setSelectedId(id);
      centerOnTech(id, 1);
    },
    [centerOnTech],
  );

  // Consume pendingTech once when it arrives from another tab.
  const handledPendingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingTech || handledPendingRef.current === pendingTech) return;
    handledPendingRef.current = pendingTech;
    if (techById.has(pendingTech)) {
      setSelectedId(pendingTech);
      centerOnTech(pendingTech, 1);
    }
    onPendingHandled();
  }, [pendingTech, centerOnTech, onPendingHandled]);

  // Set of matched ids for the active search.
  const matchedIds = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    const set = new Set<string>();
    for (const tech of technologies) if (matchesQuery(tech, q)) set.add(tech.id);
    return set;
  }, [query]);

  // Pan to the first search match when the query changes.
  useEffect(() => {
    if (!matchedIds || matchedIds.size === 0) return;
    const first = technologies.find((t) => matchedIds.has(t.id));
    if (first) centerOnTech(first.id, 0.85);
  }, [matchedIds, centerOnTech]);

  // Ancestors of the selected tech (for path highlighting).
  const pathIds = useMemo(() => {
    if (!selectedId) return null;
    const set = ancestorTechIds(selectedId);
    set.add(selectedId);
    return set;
  }, [selectedId]);

  const nodes = useMemo<TechFlowNode[]>(
    () =>
      technologies.map((tech) => {
        const pos = positionById.get(tech.id) ?? { x: 0, y: 0 };
        const matched = matchedIds?.has(tech.id) ?? false;
        return {
          id: tech.id,
          type: 'tech',
          position: pos,
          selected: tech.id === selectedId,
          data: {
            techId: tech.id,
            name: tech.name,
            upgrade: tech.upgrade,
            matched,
            inPath: pathIds?.has(tech.id) ?? false,
            dimmed: matchedIds !== null && !matched,
          },
        };
      }),
    [matchedIds, pathIds, selectedId],
  );

  const edges = useMemo<Edge[]>(() => {
    if (!pathIds) return baseEdges;
    return baseEdges.map((e) =>
      pathIds.has(e.source) && pathIds.has(e.target)
        ? { ...e, className: 'highlighted', zIndex: 1 }
        : e,
    );
  }, [pathIds]);

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelectedId(node.id);
  }, []);

  const selectedTech = selectedId ? techById.get(selectedId) ?? null : null;

  return (
    <div className="flex h-full w-full">
      <div className="relative h-full min-w-0 flex-1">
        {/* Search overlay */}
        <div className="absolute left-3 top-3 z-10 w-72">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search technologies…"
              className="bg-card pl-8 pr-8 shadow-lg"
              aria-label="Search technologies"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>
          {matchedIds && (
            <div className="mt-1.5 inline-block rounded-md bg-popover px-2 py-1 text-xs text-muted-foreground shadow">
              {matchedIds.size} match{matchedIds.size === 1 ? '' : 'es'}
            </div>
          )}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedId(null)}
          minZoom={0.1}
          maxZoom={1.75}
          defaultViewport={{ x: 40, y: 40, zoom: 0.55 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={28} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {selectedTech && (
        <TechDetail
          tech={selectedTech}
          onClose={() => setSelectedId(null)}
          onSelectTech={selectTech}
          onCalculateItem={onCalculateItem}
        />
      )}
    </div>
  );
}

export function TechTree(props: TechTreeProps) {
  return (
    <ReactFlowProvider>
      <TechTreeInner {...props} />
    </ReactFlowProvider>
  );
}
