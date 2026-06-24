import { useEffect, useState } from 'react';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right';
import PickaxeIcon from 'lucide-react/dist/esm/icons/pickaxe';
import SparklesIcon from 'lucide-react/dist/esm/icons/sparkles';
import { useTranslation } from 'react-i18next';
import type { ProductionNode, MachineOverrides } from '../../calculator/index.js';
import type { TimeUnit } from '../hooks/useCalculator.js';
import { ItemIcon } from './ItemIcon.js';
import { useNames } from '../i18n/useNames.js';
import { graph } from '../data.js';
import {
  Select, SelectTrigger, SelectContent, SelectItem, Tooltip, TooltipTrigger, TooltipContent,
} from '../ui/index.js';
import { num, rate } from '../lib/format.js';
import { cn } from '../lib/cn.js';

interface ProductionChainProps {
  node: ProductionNode;
  timeUnit: TimeUnit;
  machineOverrides: MachineOverrides;
  onMachineChange: (item: string, machine: string) => void;
  onRecipeChange: (path: string, recipeId: string) => void;
  /** shared item id → target count; present → render a ×N badge + accent. */
  sharedCounts?: Map<string, number>;
  /** the item whose occurrences should glow (click-to-trace). */
  focusedItem?: string | null;
  /** click a shared item to focus/trace it. */
  onFocusItem?: (item: string) => void;
  /** Bump with a new object to force every node open/closed (expand/fold all). */
  expandSignal?: { id: number; open: boolean } | null;
}

/** The bare production-chain tree (no card/title — wrap it in a Section). */
export function ProductionChain(props: ProductionChainProps) {
  return <ChainNode {...props} depth={0} path={props.node.item} />;
}

function ChainNode({
  node, timeUnit, machineOverrides, onMachineChange, onRecipeChange,
  sharedCounts, focusedItem, onFocusItem, expandSignal, depth, path,
}: ProductionChainProps & { depth: number; path: string }) {
  const { t } = useTranslation('ui');
  const { name, recipeName } = useNames();
  // Default: expand the root so its immediate components show; deeper levels collapsed.
  const [open, setOpen] = useState(depth < 1);
  // Expand-all / fold-all: a new signal object forces every node open/closed.
  useEffect(() => {
    if (expandSignal) setOpen(expandSignal.open);
  }, [expandSignal]);
  const hasChildren = node.children.length > 0;
  const producers = node.recipe ? graph.producersFor(node.recipe) : [];
  // Alternative recipes the user can switch this node to (default-first).
  const recipes = graph.recipesFor(node.item);

  const sharedCount = sharedCounts?.get(node.item);
  const isShared = sharedCount !== undefined;
  const isFocused = focusedItem != null && focusedItem === node.item;

  return (
    <div>
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1 rounded py-1.5 pr-2 hover:bg-accent/50',
          // Responsive indent: tighter steps on mobile to preserve row width.
          'pl-[calc(var(--d)*0.75rem_+_0.5rem)] sm:pl-[calc(var(--d)*1.125rem_+_0.5rem)]',
          isShared && 'ring-1 ring-inset ring-amber/40',
          isFocused && 'bg-amber/15 ring-2 ring-inset ring-amber',
        )}
        style={{ '--d': depth } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors sm:size-5',
            'hover:text-foreground active:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !hasChildren && 'invisible',
          )}
          aria-label={open ? t('chain.collapse') : t('chain.expand')}
        >
          <ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} />
        </button>

        <ItemIcon id={node.item} size={22} tinted className="shrink-0" />
        <span className="min-w-0 truncate font-medium">{name(node.item)}</span>

        {isShared && (
          <button
            type="button"
            onClick={() => onFocusItem?.(node.item)}
            className="shrink-0 rounded bg-amber/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber transition-colors hover:bg-amber/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={t('calculator.sharedBadgeTitle', { count: sharedCount })}
          >
            ×{sharedCount}
          </button>
        )}

        {node.proliferated && (
          <Tooltip>
            <TooltipTrigger asChild>
              <SparklesIcon className="size-3.5 shrink-0 text-amber" />
            </TooltipTrigger>
            <TooltipContent>{t('chain.proliferatorApplied')}</TooltipContent>
          </Tooltip>
        )}

        <span className="ml-auto shrink-0 font-medium tabular-nums text-primary">{rate(node.ratePerSecond, timeUnit)}</span>

        {node.recipe && recipes.length > 1 && (
          <Select value={node.recipe.id} onValueChange={(v) => onRecipeChange(path, v)}>
            <SelectTrigger className="h-9 w-full min-w-0 text-xs sm:h-7 sm:w-44 sm:shrink-0" aria-label={t('chain.recipe')}>
              <ItemIcon id={node.recipe.id} size={16} />
              <span className="truncate">{recipeName(node.recipe.id)}</span>
            </SelectTrigger>
            <SelectContent>
              {recipes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <ItemIcon id={r.id} size={16} />
                    <span className="truncate">{recipeName(r.id)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {node.machine ? (
          <div className="flex w-full items-center gap-1.5 sm:w-56 sm:shrink-0">
            {producers.length > 1 ? (
              <Select
                value={node.machine.id}
                onValueChange={(v) => onMachineChange(node.item, v)}
              >
                <SelectTrigger className="h-9 min-w-0 flex-1 text-xs sm:h-7">
                  {/* Render the value ourselves so the label truncates reliably
                      (Radix's <SelectValue> wraps the clone in a non-shrinking span). */}
                  <ItemIcon id={node.machine.id} size={16} />
                  <span className="truncate">{name(node.machine.id)}</span>
                </SelectTrigger>
                <SelectContent>
                  {producers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ItemIcon id={m.id} size={16} />
                        <span className="truncate">{name(m.id)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="flex flex-1 items-center gap-1.5 truncate text-xs text-muted-foreground">
                <ItemIcon id={node.machine.id} size={16} />{name(node.machine.id)}
              </span>
            )}
            <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums" title={t('chain.exact', { value: num(node.machinesNeeded) })}>
              ×{num(Math.ceil(node.machinesNeeded - 1e-9))}
            </span>
          </div>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <PickaxeIcon className="size-3.5" />{node.mined ? t('chain.mined') : t('chain.rawInput')}
          </span>
        )}
      </div>

      {open && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <ChainNode
              key={`${child.item}-${i}`}
              node={child}
              timeUnit={timeUnit}
              machineOverrides={machineOverrides}
              onMachineChange={onMachineChange}
              onRecipeChange={onRecipeChange}
              sharedCounts={sharedCounts}
              focusedItem={focusedItem}
              onFocusItem={onFocusItem}
              expandSignal={expandSignal}
              depth={depth + 1}
              path={`${path}>${child.item}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
