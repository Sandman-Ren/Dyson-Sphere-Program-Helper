import { useEffect, useState } from 'react';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right';
import PickaxeIcon from 'lucide-react/dist/esm/icons/pickaxe';
import SparklesIcon from 'lucide-react/dist/esm/icons/sparkles';
import PinIcon from 'lucide-react/dist/esm/icons/pin';
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
  /** Pin this node's item as available supply at the given rate. */
  onPinSupply?: (item: string, ratePerSecond: number) => void;
  /** Items currently pinned (render the affordance as active). */
  pinnedItems?: Set<string>;
  /** Items that cannot be pinned (proliferators, target outputs). */
  unpinnableItems?: Set<string>;
}

// Fixed right-hand column widths — shared by the header row and every node row
// so the columns line up under their labels. Name is the only flexible track;
// everything to its right is shrink-0 fixed-width and right-anchors at a constant
// x. Below `md` the recipe/machine controls relax to full-width stacked lines.
const COL = {
  ratio: 'w-14 shrink-0 text-right',
  rate: 'w-24 shrink-0 text-right',
  pin: 'w-7 shrink-0',
  recipe: 'w-full shrink-0 md:w-44',
  machine: 'w-full shrink-0 md:w-56',
} as const;

/** The bare production-chain tree (no card/title — wrap it in a Section). */
export function ProductionChain(props: ProductionChainProps) {
  return (
    <>
      <ChainHeader />
      <ChainNode
        {...props}
        depth={0}
        path={props.node.item}
        rootRatePerSecond={props.node.ratePerSecond}
      />
    </>
  );
}

/**
 * Column labels above the tree. Desktop-only (`md:`+) — below that breakpoint
 * rows wrap and the fixed columns relax, so a header can't align. Mirrors a node
 * row's right-hand structure exactly (same `COL` widths, `gap-x-2`, `pr`/`px`,
 * and child count) so each label sits over its column.
 */
function ChainHeader() {
  const { t } = useTranslation('ui');
  return (
    <div className="hidden items-center gap-x-2 px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:flex">
      <span className="min-w-0 flex-1" />
      <span className={COL.ratio}>{t('chain.colRatio')}</span>
      <span className={COL.rate}>{t('chain.colRate')}</span>
      <span className={COL.pin} aria-hidden />
      <span className={COL.recipe} aria-hidden />
      <span className={COL.machine} aria-hidden />
    </div>
  );
}

function ChainNode({
  node, timeUnit, machineOverrides, onMachineChange, onRecipeChange,
  sharedCounts, focusedItem, onFocusItem, expandSignal,
  onPinSupply, pinnedItems, unpinnableItems, depth, path, rootRatePerSecond,
}: ProductionChainProps & { depth: number; path: string; rootRatePerSecond: number }) {
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

  // This node's rate as a multiple of the section's top-level target rate
  // (root = 1). Shown as a plain number left of the rate: "how many of this
  // per 1 final output". null guards a degenerate (zero/NaN) root rate.
  const ratioValue = rootRatePerSecond > 0 ? node.ratePerSecond / rootRatePerSecond : null;

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
        {/* Name column — the only flexible track. It absorbs slack (and carries
            the depth indent) so the fixed columns to its right stay aligned
            across rows and under the header. */}
        <div className="flex min-w-0 flex-1 items-center gap-x-2">
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
        </div>

        {/* Ratio — qty relative to the target output; labelled by the header.
            Always rendered (empty when null) so the column count never shifts. */}
        <span className={cn(COL.ratio, 'tabular-nums text-muted-foreground')} title={t('chain.ratioTitle')}>
          {ratioValue !== null ? num(ratioValue) : ''}
        </span>

        <span className={cn(COL.rate, 'tabular-nums font-medium text-primary')}>
          {rate(node.ratePerSecond, timeUnit)}
        </span>

        {/* Pin slot — reserved on every row (invisible when unpinnable) so the
            columns stay aligned. */}
        <div className={cn(COL.pin, 'flex items-center justify-center')}>
          {onPinSupply && !unpinnableItems?.has(node.item) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onPinSupply(node.item, node.ratePerSecond)}
                  className={cn(
                    'rounded p-1 text-muted-foreground transition-colors hover:text-amber',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    pinnedItems?.has(node.item) && 'text-amber',
                  )}
                  aria-label={pinnedItems?.has(node.item) ? t('chain.supplyLimited') : t('chain.limitSupply')}
                >
                  <PinIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{pinnedItems?.has(node.item) ? t('chain.supplyLimited') : t('chain.limitSupply')}</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Recipe slot — the selector when there's an alternate recipe, else a
            reserved placeholder (desktop only, so mobile gets no blank line). */}
        {node.recipe && recipes.length > 1 ? (
          <Select value={node.recipe.id} onValueChange={(v) => onRecipeChange(path, v)}>
            <SelectTrigger className={cn(COL.recipe, 'h-9 min-w-0 text-xs md:h-7')} aria-label={t('chain.recipe')}>
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
        ) : (
          <span className={cn(COL.recipe, 'hidden md:block')} aria-hidden />
        )}

        {node.machine ? (
          <div className={cn(COL.machine, 'flex items-center gap-1.5')}>
            {producers.length > 1 ? (
              <Select
                value={node.machine.id}
                onValueChange={(v) => onMachineChange(node.item, v)}
              >
                <SelectTrigger className="h-9 min-w-0 flex-1 text-xs md:h-7">
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
          <span className={cn(COL.machine, 'flex items-center gap-1 text-xs text-muted-foreground')}>
            <PickaxeIcon className="size-3.5" />{node.mined ? t('chain.mined') : t('chain.rawInput')}
          </span>
        )}
      </div>

      {open && hasChildren && node.children.map((child, i) => (
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
          onPinSupply={onPinSupply}
          pinnedItems={pinnedItems}
          unpinnableItems={unpinnableItems}
          depth={depth + 1}
          path={`${path}>${child.item}`}
          rootRatePerSecond={rootRatePerSecond}
        />
      ))}
    </div>
  );
}
