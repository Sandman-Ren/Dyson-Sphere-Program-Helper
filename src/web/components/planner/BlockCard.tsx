import { useTranslation } from 'react-i18next';
import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right';
import ArrowDownIcon from 'lucide-react/dist/esm/icons/arrow-down';
import type { Block } from '../../../calculator/planner/index.js';
import type { BlockSuggestion } from '../../../calculator/planner/index.js';
import type { TimeUnit } from '../../hooks/useCalculator.js';
import { ItemIcon } from '../ItemIcon.js';
import { useNames } from '../../i18n/useNames.js';
import { Card, Badge, Button } from '../../ui/index.js';
import { num, rate, power } from '../../lib/format.js';

interface BlockCardProps {
  block: Block;
  suggestion: BlockSuggestion | undefined;
  timeUnit: TimeUnit;
  onToggle: (item: string) => void;
}

/** One self-contained production block: export, machines, imports, and feeds. */
export function BlockCard({ block, suggestion, timeUnit, onToggle }: BlockCardProps) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const machineEntries = Object.entries(block.machines).sort((a, b) => b[1] - a[1]);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <ItemIcon id={block.item} size={28} tinted />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{name(block.item)}</span>
            <Badge className={block.kind === 'target' ? 'bg-primary/15 text-primary' : 'bg-amber/15 text-amber'}>
              {block.kind === 'target' ? t('planner.targetBlock') : t('planner.sharedBlock')}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {t('planner.exports')} {rate(block.exportRate, timeUnit)} · {power(block.powerKW)}
          </div>
        </div>
        {block.kind !== 'target' && (
          <Button variant="outline" size="sm" onClick={() => onToggle(block.item)}>
            {t('planner.demote')}
          </Button>
        )}
      </div>

      {machineEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {machineEntries.map(([id, count]) => (
            <span key={id} className="flex items-center gap-1.5">
              <ItemIcon id={id} size={16} />
              <span className="text-muted-foreground">{name(id)}</span>
              <span className="font-medium tabular-nums">× {num(Math.ceil(count - 1e-9))}</span>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FlowList icon={<ArrowDownIcon className="size-3.5" />} label={t('planner.imports')}
          rows={block.imports.map((i) => ({ id: i.item, value: rate(i.rate, timeUnit) }))} />
        <FlowList icon={<ArrowRightIcon className="size-3.5" />} label={t('planner.feeds')}
          rows={block.feeds.map((f) => ({ id: f.block, value: rate(f.rate, timeUnit) }))} />
      </div>
      {suggestion && (
        <div className="text-xs text-muted-foreground">{t('planner.fanOut', { count: suggestion.fanOut })}</div>
      )}
    </Card>
  );
}

function FlowList({ icon, label, rows }: { icon: React.ReactNode; label: string; rows: { id: string; value: string }[] }) {
  const { name } = useNames();
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5 text-sm">
            <ItemIcon id={r.id} size={16} tinted />
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={name(r.id)}>{name(r.id)}</span>
            <span className="shrink-0 tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
