import { useMemo } from 'react';
import XIcon from 'lucide-react/dist/esm/icons/x';
import PlusIcon from 'lucide-react/dist/esm/icons/plus';
import { useTranslation } from 'react-i18next';
import type { useCalculator } from '../hooks/useCalculator.js';
import { UNIT_SECONDS } from '../hooks/useCalculator.js';
import { graph, proliferators } from '../data.js';
import { ItemSelector } from './ItemSelector.js';
import { ItemIcon } from './ItemIcon.js';
import { Section } from './Section.js';
import {
  Input, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, Button,
  Tooltip, TooltipTrigger, TooltipContent,
} from '../ui/index.js';
import { useNames } from '../i18n/useNames.js';
import { rate, num } from '../lib/format.js';
import { cn } from '../lib/cn.js';

type Calc = ReturnType<typeof useCalculator>;

/** Item ids that may not be pinned: proliferator items + every current target's output. */
function useUnpinnableItems(calc: Calc): Set<string> {
  return useMemo(() => {
    const s = new Set<string>();
    for (const p of proliferators) { s.add(p.id); if (p.tier) s.add(p.tier); }
    for (const t of calc.targets) if (t.item) s.add(t.item);
    return s;
  }, [calc.targets]);
}

export function AvailableSupply({ calc }: { calc: Calc }) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const unpinnable = useUnpinnableItems(calc);
  const entries = Object.entries(calc.pinnedSupply);

  // Pickable items: products that aren't already pinned and aren't unpinnable.
  const pickable = useMemo(
    () => graph.allProducts.filter((id) => !unpinnable.has(id) && !(id in calc.pinnedSupply)),
    [unpinnable, calc.pinnedSupply],
  );

  return (
    <Section title={t('supply.title')}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('supply.empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map(([item, entry]) => {
            const comp = calc.allocation.components.get(item);
            const supply = entry.amount / UNIT_SECONDS[entry.unit];
            const pct = (v: number) => (supply > 0 ? Math.min(100, (v / supply) * 100) : 0);
            const fixedPct = comp ? pct(comp.fixedUse) : 0;
            const varPct = comp ? pct(comp.variableUse) : 0;
            const over = comp?.overAllocated ?? false;
            return (
              <div key={item} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ItemIcon id={item} size={20} tinted className="shrink-0" />
                  <span className="min-w-0 truncate text-sm font-medium">{name(item)}</span>
                  <Input
                    type="number" min={0} step="any"
                    value={Number.isFinite(entry.amount) ? entry.amount : ''}
                    onChange={(e) => calc.setPinnedSupply(item, Number(e.target.value) || 0, entry.unit)}
                    className="ml-auto w-20 flex-shrink-0 sm:w-24"
                  />
                  <Select value={entry.unit} onValueChange={(v) => calc.setPinnedSupply(item, entry.amount, v as typeof entry.unit)}>
                    <SelectTrigger className="w-28 flex-shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="second">{t('calculator.perSecond')}</SelectItem>
                      <SelectItem value="minute">{t('calculator.perMinute')}</SelectItem>
                      <SelectItem value="hour">{t('calculator.perHour')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => calc.removePinnedSupply(item)} aria-label={t('supply.remove')}>
                    <XIcon className="size-4" />
                  </Button>
                </div>
                {/* Utilization bar: fixed | variable | free */}
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary" role="img"
                  aria-label={`${t('supply.fixedUse')} ${num(comp?.fixedUse ?? 0)}, ${t('supply.variableUse')} ${num(comp?.variableUse ?? 0)}`}>
                  <div className={cn('h-full', over ? 'bg-amber' : 'bg-primary/60')} style={{ width: `${fixedPct}%` }} />
                  <div className={cn('h-full', over ? 'bg-amber' : 'bg-primary')} style={{ width: `${varPct}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-3 text-[11px] tabular-nums text-muted-foreground">
                  <span>{t('supply.fixedUse')}: {rate(comp?.fixedUse ?? 0, calc.displayUnit)}</span>
                  <span>{t('supply.variableUse')}: {rate(comp?.variableUse ?? 0, calc.displayUnit)}</span>
                  <span>{t('supply.free')}: {rate(comp?.free ?? supply, calc.displayUnit)}</span>
                  {over && <span className="font-semibold text-amber">{t('supply.overAllocated')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <PlusIcon className="size-4 text-muted-foreground" />
        <ItemSelector
          items={pickable}
          value=""
          placeholder={t('supply.pick')}
          onChange={(id) => { if (id) calc.setPinnedSupply(id, 60, 'minute'); }}
        />
        <Tooltip>
          <TooltipTrigger asChild><span className="cursor-help text-xs text-muted-foreground underline decoration-dotted">?</span></TooltipTrigger>
          <TooltipContent className="max-w-xs">{t('supply.ceilingHint')}</TooltipContent>
        </Tooltip>
      </div>
    </Section>
  );
}
