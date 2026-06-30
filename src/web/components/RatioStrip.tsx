import { Fragment, useEffect, useMemo, useState } from 'react';
import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw';
import InfoIcon from 'lucide-react/dist/esm/icons/info';
import { useTranslation } from 'react-i18next';
import type { NodeSelector, ProductionNode, ProductionPlan } from '../../calculator/index.js';
import { collectItemTotals, computeIntegerRatios } from '../../calculator/index.js';
import { ItemIcon } from './ItemIcon.js';
import { Section } from './Section.js';
import { useNames } from '../i18n/useNames.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/index.js';
import { cn } from '../lib/cn.js';

/** Machine ratio: each crafted item's fractional building count. */
export const machineCountSelector: NodeSelector = (node: ProductionNode) =>
  node.machine && node.machinesNeeded > 0 ? node.machinesNeeded : null;

/** Component shares: each item's total throughput (raws and the target included). */
export const throughputSelector: NodeSelector = (node: ProductionNode) =>
  node.ratePerSecond > 0 ? node.ratePerSecond : null;

/** Largest integer ratio we'll show before falling back to normalized decimals. */
const MAX_INTEGER_RATIO = 200;

interface RatioStripProps {
  plan: ProductionPlan;
  /** Section heading for this strip. */
  title: string;
  /** Per-node value each item is ranked by (building count vs throughput share). */
  selector: NodeSelector;
  /** Optional one-line explanation shown via an info icon in the header. */
  info?: string;
}

/**
 * A strip of clickable item chips expressing each item's `selector` value as a
 * minimum integer ratio (e.g. 4 : 5 : 1) — either relative building counts
 * ("Machine ratio") or relative throughput ("Component shares"). The same item
 * at several depths is summed once. Clicking a chip excludes it so the ratio can
 * focus on a subset of the chain.
 */
export function RatioStrip({ plan, title, selector, info }: RatioStripProps) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const entries = useMemo(() => {
    const totals = collectItemTotals(plan.root, selector);
    return [...totals.entries()].map(([item, value]) => ({ item, value }));
  }, [plan, selector]);

  // Forget exclusions whenever the target item (and thus the chain) changes.
  const targetItem = plan.root.item;
  useEffect(() => setExcluded(new Set()), [targetItem]);

  // item id → display string. Prefer GCD-reduced integers; fall back to decimals
  // normalized so the smallest included value is 1 when integers get unwieldy.
  const ratioByItem = useMemo(() => {
    const map = new Map<string, string>();
    const included = entries.filter((e) => !excluded.has(e.item));
    if (included.length === 0) return map;

    const values = included.map((e) => e.value);
    const intRatios = computeIntegerRatios(values);

    if (intRatios && Math.max(...intRatios) <= MAX_INTEGER_RATIO) {
      included.forEach((e, i) => map.set(e.item, String(intRatios[i])));
      return map;
    }

    const minVal = Math.min(...values);
    if (minVal > 0) {
      for (const e of included) {
        const normalized = e.value / minVal;
        const rounded = Math.round(normalized);
        map.set(e.item, Math.abs(normalized - rounded) < 0.05 ? String(rounded) : normalized.toFixed(1));
      }
    }
    return map;
  }, [entries, excluded]);

  const toggle = (item: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  // A ratio of a single item is meaningless — only show with two or more.
  if (entries.length < 2) return null;

  // The first included chip gets no leading ':' separator.
  const firstIncluded = entries.find((e) => !excluded.has(e.item))?.item;

  const reset = excluded.size > 0 ? (
    <button
      type="button"
      onClick={() => setExcluded(new Set())}
      className={cn(
        'inline-flex items-center gap-1 rounded text-[11px] font-medium normal-case tracking-normal',
        'text-muted-foreground transition-colors hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <RotateCcwIcon className="size-3" />
      {t('ratio.reset')}
    </button>
  ) : undefined;

  // The info icon lives in the header's actions slot (outside the section's
  // toggle button) to avoid nesting interactive elements.
  const infoTrigger = info ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={info}
          className={cn(
            'inline-flex items-center rounded text-muted-foreground transition-colors hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{info}</TooltipContent>
    </Tooltip>
  ) : undefined;

  const actions = infoTrigger || reset ? (
    <>
      {infoTrigger}
      {reset}
    </>
  ) : undefined;

  return (
    <Section title={title} actions={actions}>
      <div className="flex flex-wrap items-center gap-1.5">
        {entries.map((entry) => {
          const isExcluded = excluded.has(entry.item);
          const ratio = isExcluded ? null : ratioByItem.get(entry.item) ?? null;
          const showSeparator = !isExcluded && entry.item !== firstIncluded;
          const label = name(entry.item);

          return (
            <Fragment key={entry.item}>
              {showSeparator && (
                <span aria-hidden className="select-none text-base leading-none text-muted-foreground">:</span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => toggle(entry.item)}
                    aria-pressed={!isExcluded}
                    aria-label={t(isExcluded ? 'ratio.clickToInclude' : 'ratio.clickToExclude', { name: label })}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm tabular-nums',
                      'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isExcluded ? 'bg-transparent opacity-30 hover:opacity-60' : 'bg-background hover:bg-accent/50',
                    )}
                  >
                    <ItemIcon id={entry.item} size={20} tinted />
                    {ratio !== null && (
                      <span className="min-w-[0.875rem] text-center font-semibold">{ratio}</span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {t(isExcluded ? 'ratio.clickToInclude' : 'ratio.clickToExclude', { name: label })}
                </TooltipContent>
              </Tooltip>
            </Fragment>
          );
        })}
      </div>
    </Section>
  );
}
