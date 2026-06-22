import { useTranslation } from 'react-i18next';
import FactoryIcon from 'lucide-react/dist/esm/icons/factory';
import PickaxeIcon from 'lucide-react/dist/esm/icons/pickaxe';
import ZapIcon from 'lucide-react/dist/esm/icons/zap';
import LayersIcon from 'lucide-react/dist/esm/icons/layers';
import AlertTriangleIcon from 'lucide-react/dist/esm/icons/triangle-alert';
import type { GroupedPlan } from '../../../calculator/planner/index.js';
import type { TimeUnit } from '../../hooks/useCalculator.js';
import { ItemIcon } from '../ItemIcon.js';
import { useNames } from '../../i18n/useNames.js';
import { Card } from '../../ui/index.js';
import { num, rate, power } from '../../lib/format.js';

export function PlannerTotals({ plan, timeUnit }: { plan: GroupedPlan; timeUnit: TimeUnit }) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const machines = Object.entries(plan.totalMachines).sort((a, b) => b[1] - a[1]);
  const raws = Object.entries(plan.rawResources).sort((a, b) => b[1] - a[1]);
  const commonalityPct = Math.round(plan.commonalityIndex * 100);

  return (
    <Card className="mb-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<LayersIcon className="size-4 text-primary" />} label={t('planner.commonality')}>
          <div className="text-lg font-semibold tabular-nums">{commonalityPct}%</div>
          <div className="text-xs text-muted-foreground">{t('planner.commonalityHint')}</div>
        </Stat>
        <Stat icon={<FactoryIcon className="size-4 text-primary" />} label={t('summary.buildings')}>
          {machines.length === 0 && <Empty />}
          {machines.map(([id, count]) => (
            <Row key={id} id={id} value={`× ${num(Math.ceil(count - 1e-9))}`} />
          ))}
        </Stat>
        <Stat icon={<PickaxeIcon className="size-4 text-amber" />} label={t('summary.rawResources')}>
          {raws.length === 0 && <Empty />}
          {raws.map(([id, r]) => (
            <Row key={id} id={id} value={rate(r, timeUnit)} />
          ))}
        </Stat>
        <Stat icon={<ZapIcon className="size-4 text-primary" />} label={t('summary.powerDraw')}>
          <div className="text-lg font-semibold">{power(plan.totalPowerKW)}</div>
          <div className="text-xs text-muted-foreground">{t('summary.peakElectric')}</div>
        </Stat>
      </div>

      {plan.surpluses.length > 0 && (
        <div className="mt-4 rounded-md border border-amber/40 bg-amber/10 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber">
            <AlertTriangleIcon className="size-4" />{t('planner.surplusWarning')}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {plan.surpluses.map((s) => (
              <span key={s.item} className="flex items-center gap-1.5">
                <ItemIcon id={s.item} size={16} tinted />
                <span className="text-muted-foreground">{name(s.item)}</span>
                <span className="tabular-nums">+{rate(s.surplus, timeUnit)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({ id, value }: { id: string; value: string }) {
  const { name } = useNames();
  return (
    <div className="flex items-center gap-2 text-sm">
      <ItemIcon id={id} size={18} tinted />
      <span className="min-w-0 flex-1 truncate text-muted-foreground" title={name(id)}>{name(id)}</span>
      <span className="shrink-0 whitespace-nowrap text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}
function Empty() { return <div className="text-xs text-muted-foreground">—</div>; }
