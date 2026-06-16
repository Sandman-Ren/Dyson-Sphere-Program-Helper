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
import { useTranslation } from 'react-i18next';
import SearchIcon from 'lucide-react/dist/esm/icons/search';
import XIcon from 'lucide-react/dist/esm/icons/x';
import { Input, Tabs, TabsList, TabsTrigger } from '../../ui/index.js';
import { useNames } from '../../i18n/useNames.js';
import type { Technology } from '../../../data/schema.js';
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

/** The two in-game research screens. */
type TechCategory = 'technologies' | 'upgrades';
const CATEGORIES: TechCategory[] = ['technologies', 'upgrades'];

const layouts = layoutData as Record<TechCategory, TechLayout>;
const nodeTypes: NodeTypes = { tech: TechNode };

// Each tech lives in exactly one category, so a single merged map yields a
// unique position per tech (in that category's own coordinate space).
const positionById = new Map<string, { x: number; y: number }>();
for (const cat of CATEGORIES)
  for (const n of layouts[cat].nodes) positionById.set(n.id, { x: n.x, y: n.y });
const { nodeWidth, nodeHeight } = layouts.technologies;

/** Which screen a tech belongs to. */
function categoryOf(id: string): TechCategory {
  return techById.get(id)?.upgrade ? 'upgrades' : 'technologies';
}

const techsByCategory: Record<TechCategory, Technology[]> = {
  technologies: technologies.filter((t) => !t.upgrade),
  upgrades: technologies.filter((t) => t.upgrade),
};

/** Base edges (prerequisite -> tech) within a category; cross-category edges are dropped. */
function buildEdges(list: Technology[]): Edge[] {
  const ids = new Set(list.map((t) => t.id));
  return list.flatMap((tech) =>
    (prereqsById.get(tech.id) ?? [])
      .filter((prereq) => ids.has(prereq))
      .map((prereq) => ({
        id: `${prereq}->${tech.id}`,
        source: prereq,
        target: tech.id,
        type: 'smoothstep',
      })),
  );
}

const edgesByCategory: Record<TechCategory, Edge[]> = {
  technologies: buildEdges(techsByCategory.technologies),
  upgrades: buildEdges(techsByCategory.upgrades),
};

function TechTreeInner({ pendingTech, onPendingHandled, onCalculateItem }: TechTreeProps) {
  const { setCenter, setViewport } = useReactFlow();
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const [category, setCategory] = useState<TechCategory>('technologies');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const activeTechs = techsByCategory[category];
  const activeBaseEdges = edgesByCategory[category];

  // Center the viewport on a tech node by id.
  const centerOnTech = useCallback(
    (id: string, zoom = 1) => {
      const pos = positionById.get(id);
      if (!pos) return;
      setCenter(pos.x + nodeWidth / 2, pos.y + nodeHeight / 2, {
        zoom,
        duration: 500,
      });
    },
    [setCenter],
  );

  const selectTech = useCallback(
    (id: string) => {
      if (!techById.has(id)) return;
      setCategory(categoryOf(id));
      setSelectedId(id);
      centerOnTech(id, 1);
    },
    [centerOnTech],
  );

  // Switch screens: reset selection, search, and the viewport to the new tree.
  const changeCategory = useCallback(
    (value: string) => {
      setCategory(value as TechCategory);
      setSelectedId(null);
      setQuery('');
      setViewport({ x: 40, y: 40, zoom: 0.55 }, { duration: 300 });
    },
    [setViewport],
  );

  // Consume pendingTech once when it arrives from another tab.
  const handledPendingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingTech || handledPendingRef.current === pendingTech) return;
    handledPendingRef.current = pendingTech;
    if (techById.has(pendingTech)) {
      setCategory(categoryOf(pendingTech));
      setSelectedId(pendingTech);
      centerOnTech(pendingTech, 1);
    }
    onPendingHandled();
  }, [pendingTech, centerOnTech, onPendingHandled]);

  // Set of matched ids for the active search (scoped to the current screen).
  const matchedIds = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    const set = new Set<string>();
    for (const tech of activeTechs) if (matchesQuery(tech, q)) set.add(tech.id);
    return set;
  }, [query, activeTechs]);

  // Pan to the first search match when the query changes.
  useEffect(() => {
    if (!matchedIds || matchedIds.size === 0) return;
    const first = activeTechs.find((tech) => matchedIds.has(tech.id));
    if (first) centerOnTech(first.id, 0.85);
  }, [matchedIds, activeTechs, centerOnTech]);

  // Ancestors of the selected tech (for path highlighting).
  const pathIds = useMemo(() => {
    if (!selectedId) return null;
    const set = ancestorTechIds(selectedId);
    set.add(selectedId);
    return set;
  }, [selectedId]);

  const nodes = useMemo<TechFlowNode[]>(
    () =>
      activeTechs.map((tech) => {
        const pos = positionById.get(tech.id) ?? { x: 0, y: 0 };
        const matched = matchedIds?.has(tech.id) ?? false;
        return {
          id: tech.id,
          type: 'tech',
          position: pos,
          selected: tech.id === selectedId,
          data: {
            techId: tech.id,
            name: name(tech.id),
            upgrade: tech.upgrade,
            matched,
            inPath: pathIds?.has(tech.id) ?? false,
            dimmed: matchedIds !== null && !matched,
          },
        };
      }),
    [activeTechs, matchedIds, pathIds, selectedId, name],
  );

  const edges = useMemo<Edge[]>(() => {
    if (!pathIds) return activeBaseEdges;
    return activeBaseEdges.map((e) =>
      pathIds.has(e.source) && pathIds.has(e.target)
        ? { ...e, className: 'highlighted', zIndex: 1 }
        : e,
    );
  }, [activeBaseEdges, pathIds]);

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelectedId(node.id);
  }, []);

  const selectedTech = selectedId ? techById.get(selectedId) ?? null : null;

  return (
    <div className="flex h-full w-full">
      <div className="relative h-full min-w-0 flex-1">
        {/* Screen toggle + search overlay */}
        <div className="absolute left-3 right-3 top-3 z-10 flex flex-col gap-2 sm:right-auto sm:w-72">
          <Tabs value={category} onValueChange={changeCategory}>
            <TabsList className="rounded-md border border-border bg-card px-1.5 shadow-lg">
              <TabsTrigger value="technologies">{t('tech.tabTechnologies')}</TabsTrigger>
              <TabsTrigger value="upgrades">{t('tech.tabUpgrades')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tech.searchTechnologies')}
              className="bg-card pl-8 pr-8 shadow-lg"
              aria-label={t('tech.searchTechnologies')}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t('tech.clearSearch')}
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>
          {matchedIds && (
            <div className="mt-1.5 inline-block rounded-md bg-popover px-2 py-1 text-xs text-muted-foreground shadow">
              {t('tech.matchCount', { count: matchedIds.size })}
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
