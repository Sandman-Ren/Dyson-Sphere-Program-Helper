import { useTranslation } from 'react-i18next';
import CornerDownRightIcon from 'lucide-react/dist/esm/icons/corner-down-right';
import type { SharedComponentNode, SharedComponentsResult } from '../../calculator/shared-components.js';
import type { TimeUnit } from '../hooks/useCalculator.js';
import { ItemIcon } from './ItemIcon.js';
import { Section } from './Section.js';
import { useNames } from '../i18n/useNames.js';
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
  if (result.roots.length === 0) return null;
  return (
    <Section title={t('calculator.sharedComponents')}>
      <div className="space-y-0.5">
        {result.roots.map((node, i) => (
          <SharedRow
            key={`${node.item}-${i}`}
            node={node}
            depth={0}
            timeUnit={timeUnit}
            focusedItem={focusedItem}
            onFocusItem={onFocusItem}
          />
        ))}
      </div>
    </Section>
  );
}

function SharedRow({
  node, depth, timeUnit, focusedItem, onFocusItem,
}: { node: SharedComponentNode; depth: number } & Omit<SharedComponentsProps, 'result'>) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const isFocused = focusedItem === node.item;
  return (
    <>
      <button
        type="button"
        onClick={() => onFocusItem(node.item)}
        style={{ '--d': depth } as React.CSSProperties}
        className={cn(
          'flex w-full items-center gap-2 rounded py-1 pr-2 text-left text-sm transition-colors',
          'pl-[calc(var(--d)*1.125rem_+_0.5rem)] hover:bg-accent/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isFocused && 'bg-amber/15 ring-1 ring-inset ring-amber',
        )}
      >
        {depth > 0 && <CornerDownRightIcon className="size-3.5 shrink-0 text-muted-foreground" />}
        <ItemIcon id={node.item} size={20} tinted className="shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium" title={name(node.item)}>{name(node.item)}</span>
        {node.reference ? (
          <span className="shrink-0 text-xs italic text-muted-foreground">{t('calculator.shownAbove')}</span>
        ) : (
          <>
            <span className="shrink-0 rounded bg-amber/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber">
              ×{node.targetCount}
            </span>
            <span className="shrink-0 tabular-nums text-primary">{rate(node.combinedRatePerSecond, timeUnit)}</span>
          </>
        )}
      </button>
      {!node.reference && node.children.map((child, i) => (
        <SharedRow
          key={`${child.item}-${i}`}
          node={child}
          depth={depth + 1}
          timeUnit={timeUnit}
          focusedItem={focusedItem}
          onFocusItem={onFocusItem}
        />
      ))}
    </>
  );
}
