import { useEffect, useRef, useState } from 'react';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right';
import { useTranslation } from 'react-i18next';
import type { SharedComponentNode, SharedComponentsResult } from '../../calculator/shared-components.js';
import type { TimeUnit } from '../hooks/useCalculator.js';
import { ItemIcon } from './ItemIcon.js';
import { Section } from './Section.js';
import { useNames } from '../i18n/useNames.js';
import { Button } from '../ui/index.js';
import { rate } from '../lib/format.js';
import { cn } from '../lib/cn.js';

interface SharedComponentsProps {
  result: SharedComponentsResult;
  timeUnit: TimeUnit;
  focusedItem: string | null;
  onFocusItem: (item: string) => void;
}

/** Dependency tree of components shared by ≥2 targets, most-complex → raw. */
export function SharedComponents({ result, timeUnit, focusedItem, onFocusItem }: SharedComponentsProps) {
  const { t } = useTranslation('ui');
  const signalSeq = useRef(0);
  const [expandSignal, setExpandSignal] = useState<{ id: number; open: boolean } | null>(null);
  const fire = (open: boolean) => setExpandSignal({ id: (signalSeq.current += 1), open });

  if (result.roots.length === 0) return null;
  return (
    <Section
      title={t('calculator.sharedComponents')}
      actions={(
        <>
          <Button variant="outline" size="sm" onClick={() => fire(true)}>{t('calculator.expandAll')}</Button>
          <Button variant="outline" size="sm" onClick={() => fire(false)}>{t('calculator.foldAll')}</Button>
        </>
      )}
    >
      <div className="rounded-lg border border-border bg-card p-1.5">
        {result.roots.map((node, i) => (
          <SharedRow
            key={`${node.item}-${i}`}
            node={node}
            depth={0}
            timeUnit={timeUnit}
            focusedItem={focusedItem}
            onFocusItem={onFocusItem}
            expandSignal={expandSignal}
          />
        ))}
      </div>
    </Section>
  );
}

interface SharedRowProps {
  node: SharedComponentNode;
  depth: number;
  timeUnit: TimeUnit;
  focusedItem: string | null;
  onFocusItem: (item: string) => void;
  expandSignal: { id: number; open: boolean } | null;
}

function SharedRow({ node, depth, timeUnit, focusedItem, onFocusItem, expandSignal }: SharedRowProps) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  // Default: expand the root so its immediate components show; deeper levels collapsed.
  const [open, setOpen] = useState(depth < 1);
  // Expand-all / fold-all: a new signal object forces every node open/closed.
  useEffect(() => {
    if (expandSignal) setOpen(expandSignal.open);
  }, [expandSignal]);

  const hasChildren = !node.reference && node.children.length > 0;
  const isFocused = focusedItem === node.item;

  return (
    <div>
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1 rounded py-1.5 pr-2 hover:bg-accent/50',
          'pl-[calc(var(--d)*0.75rem_+_0.5rem)] sm:pl-[calc(var(--d)*1.125rem_+_0.5rem)]',
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

        {node.reference ? (
          <span className="ml-auto shrink-0 text-xs italic text-muted-foreground">{t('calculator.shownAbove')}</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onFocusItem(node.item)}
              className="shrink-0 rounded bg-amber/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber transition-colors hover:bg-amber/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={t('calculator.sharedBadgeTitle', { count: node.targetCount })}
            >
              ×{node.targetCount}
            </button>
            <span className="ml-auto shrink-0 font-medium tabular-nums text-primary">
              {rate(node.combinedRatePerSecond, timeUnit)}
            </span>
          </>
        )}
      </div>

      {open && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <SharedRow
              key={`${child.item}-${i}`}
              node={child}
              depth={depth + 1}
              timeUnit={timeUnit}
              focusedItem={focusedItem}
              onFocusItem={onFocusItem}
              expandSignal={expandSignal}
            />
          ))}
        </div>
      )}
    </div>
  );
}
